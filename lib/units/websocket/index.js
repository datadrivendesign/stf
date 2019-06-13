var http = require('http')
var events = require('events')
var util = require('util')

var socketio = require('socket.io')
var Promise = require('bluebird')
var _ = require('lodash')
var request = Promise.promisifyAll(require('request'))
var adbkit = require('adbkit')
var uuid = require('uuid')

var config = require('../../../config')
var logger = require('../../util/logger')
var wire = require('../../wire')
var wireutil = require('../../wire/util')
var wirerouter = require('../../wire/router')
var dbapi = require('../../db/api')
var datautil = require('../../util/datautil')
var srv = require('../../util/srv')
var lifecycle = require('../../util/lifecycle')
var zmqutil = require('../../util/zmqutil')
var cookieSession = require('./middleware/cookie-session')
var ip = require('./middleware/remote-ip')
var auth = require('./middleware/auth')
var jwtutil = require('../../util/jwtutil')
var DeviceEventStore = require('./deviceeventstore')
var deviceEventStore = new DeviceEventStore();
var layoutCaptureService = require('./layoutcaptureservice')
var cryptutil = require('../../util/cryptutil')

const START_LOGCAT_DELIM = 'RicoBegin';
const END_LOGCAT_DELIM = 'RicoEnd';
const VIEW_JSON_END_DELIMITER = 'RICO_JSON_END';
const VIEW_REQ_XMIT_TIMEOUT = config.viewHierarchyTimeout || 1000;
const VIEW_REQ_ERR_MSG = 'Err:View hierarchy request exceeded ' +
  VIEW_REQ_XMIT_TIMEOUT + 'ms.';

module.exports = function(options) {
  var log = logger.createLogger('websocket')
  var server = http.createServer()
  var io = socketio.listen(server, {
        serveClient: false
      , transports: ['websocket']
      })
  var channelRouter = new events.EventEmitter()
  var viewResHandlers = {};

  // Output
  var push = zmqutil.socket('push')
  Promise.map(options.endpoints.push, function(endpoint) {
    return srv.resolve(endpoint).then(function(records) {
      return srv.attempt(records, function(record) {
        log.info('Sending output to "%s"', record.url)
        push.connect(record.url)
        return Promise.resolve(true)
      })
    })
  })
  .catch(function(err) {
    log.fatal('Unable to connect to push endpoint', err)
    lifecycle.fatal()
  })

  // Input
  var sub = zmqutil.socket('sub')
  Promise.map(options.endpoints.sub, function(endpoint) {
    return srv.resolve(endpoint).then(function(records) {
      return srv.attempt(records, function(record) {
        log.info('Receiving input from "%s"', record.url)
        sub.connect(record.url)
        return Promise.resolve(true)
      })
    })
  })
  .catch(function(err) {
    log.fatal('Unable to connect to sub endpoint', err)
    lifecycle.fatal()
  })

  // Establish always-on channels
  ;[wireutil.global].forEach(function(channel) {
    log.info('Subscribing to permanent channel "%s"', channel)
    sub.subscribe(channel)
  })

  sub.on('message', function(channel, data) {
    channelRouter.emit(channel.toString(), channel, data)
  })

  io.use(cookieSession({
    name: options.ssid
  , keys: [options.secret]
  }))

  io.use(ip({
    trust: function() {
      return true
    }
  }))

  io.use(auth)

  dbapi.setKickCallback(function(tokenObj) {
    io.sockets.emit('forceKick', cryptutil.encrypt(tokenObj));
    layoutCaptureService.resetSerial(tokenObj.serial);
  });

  io.on('connection', function(socket) {
    var req = socket.request
    var user = req.user
    var channels = []

    user.ip = socket.handshake.query.uip || req.ip
    socket.emit('socket.ip', cryptutil.encrypt(user.ip))

    function joinChannel(channel) {
      channels.push(channel)
      channelRouter.on(channel, messageListener)
      sub.subscribe(channel)
    }

    function leaveChannel(channel) {
      _.pull(channels, channel)
      channelRouter.removeListener(channel, messageListener)
      sub.unsubscribe(channel)
    }

    var messageListener = wirerouter()
      .on(wire.DeviceLogMessage, function(channel, message) {
        socket.emit('device.log', message)
      })
      .on(wire.DeviceIntroductionMessage, function(channel, message) {
        socket.emit('device.add', cryptutil.encrypt({
          important: true
        , data: {
            serial: message.serial
          , present: false
          , provider: message.provider
          , owner: null
          , status: message.status
          , ready: false
          , reverseForwards: []
          }
        }))
      })
      .on(wire.DeviceReadyMessage, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: {
            serial: message.serial
          , channel: message.channel
          , owner: null // @todo Get rid of need to reset this here.
          , ready: true
          , reverseForwards: [] // @todo Get rid of need to reset this here.
          }
        }))
      })
      .on(wire.DevicePresentMessage, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: {
            serial: message.serial
          , present: true
          }
        }))
      })
      .on(wire.DeviceAbsentMessage, function(channel, message) {
        socket.emit('device.remove', cryptutil.encrypt({
          important: true
        , data: {
            serial: message.serial
          , present: false
          , likelyLeaveReason: 'device_absent'
          }
        }))
      })
      .on(wire.JoinGroupMessage, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: datautil.applyOwner({
              serial: message.serial
            , owner: message.owner
            , likelyLeaveReason: 'owner_change'
            , usage: message.usage
            }
          , user
          )
        }))
      })
      .on(wire.JoinGroupByAdbFingerprintMessage, function(channel, message) {
        socket.emit('user.keys.adb.confirm', cryptutil.encrypt({
          title: message.comment
        , fingerprint: message.fingerprint
        }))
      })
      .on(wire.LeaveGroupMessage, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: datautil.applyOwner({
              serial: message.serial
            , owner: null
            , likelyLeaveReason: message.reason
            }
          , user
          )
        }))
      })
      .on(wire.DeviceStatusMessage, function(channel, message) {
        message.likelyLeaveReason = 'status_change'
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: message
        }))
      })
      .on(wire.DeviceIdentityMessage, function(channel, message) {
        datautil.applyData(message)
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: message
        }))
      })
      .on(wire.TransactionProgressMessage, function(channel, message) {
        socket.emit('tx.progress', channel.toString(), cryptutil.encrypt(message))
      })
      .on(wire.TransactionDoneMessage, function(channel, message) {
        socket.emit('tx.done', channel.toString(), cryptutil.encrypt(message))
      })
      .on(wire.DeviceLogcatEntryMessage, function(channel, message) {
        var messageStr = message.message;
        var serial = message.serial;
        var date = message.date;

        // Break the logcat messages out of their delimiters and save.
        if (messageStr.indexOf(START_LOGCAT_DELIM) > -1) {
          messageStr.split(START_LOGCAT_DELIM).forEach(function(item) {
            if (item.indexOf(END_LOGCAT_DELIM) > -1) {
              var logcatMessage = item.split(END_LOGCAT_DELIM)[0];
              dbapi.saveLogcat(message.serial, date, logcatMessage);
            }
          });
        }
      })
      .on(wire.DeviceViewBridgeEntryMessage, function(channel, message) {
          // Check if the response handler hung up due to timeout.
          var imgId = message.seq;
          if(message.serial && viewResHandlers[message.serial + imgId]) {
            // Stash a reference to the handler.
            var viewResHandler = viewResHandlers[message.serial + imgId];

            // Ready the handlers for the next handler.
            viewResHandlers[message.serial + imgId] = null;

            // Invoke the save response defined in the gesture.
            viewResHandler(message.message);
          } else {
            log.warn('Ignoring view response for serial %s', message.serial);
          }

      })
      .on(wire.AirplaneModeEvent, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: {
            serial: message.serial
          , airplaneMode: message.enabled
          }
        }))
      })
      .on(wire.BatteryEvent, function(channel, message) {
        var serial = message.serial
        delete message.serial
        socket.emit('device.change', cryptutil.encrypt({
          important: false
        , data: {
            serial: serial
          , battery: message
          }
        }))
      })
      .on(wire.DeviceBrowserMessage, function(channel, message) {
        var serial = message.serial
        delete message.serial
        socket.emit('device.change', cryptutil.encrypt({
          important: true
        , data: datautil.applyBrowsers({
            serial: serial
          , browser: message
          })
        }))
      })
      .on(wire.DevicePiiWarningMessage, function(channel, message) {
        socket.emit('warn.pii', cryptutil.encrypt({
          flaggedWords: message.flaggedWords,
          serial: message.serial
        }));
      })
      .on(wire.ConnectivityEvent, function(channel, message) {
        var serial = message.serial
        delete message.serial
        socket.emit('device.change', cryptutil.encrypt({
          important: false
        , data: {
            serial: serial
          , network: message
          }
        }))
      })
      .on(wire.PhoneStateEvent, function(channel, message) {
        var serial = message.serial
        delete message.serial
        socket.emit('device.change', cryptutil.encrypt({
          important: false
        , data: {
            serial: serial
          , network: message
          }
        }))
      })
      .on(wire.RotationEvent, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: false
        , data: {
            serial: message.serial
          , display: {
              rotation: message.rotation
            }
          }
        }))
      })
      .on(wire.ReverseForwardsEvent, function(channel, message) {
        socket.emit('device.change', cryptutil.encrypt({
          important: false
        , data: {
            serial: message.serial
          , reverseForwards: message.forwards
          }
        }))
      })
      .handler()

    // Global messages
    //
    // @todo Use socket.io to push global events to all clients instead
    // of listening on every connection, otherwise we're very likely to
    // hit EventEmitter's leak complaints (plus it's more work)
    channelRouter.on(wireutil.global, messageListener)

    // User's private group
    joinChannel(user.group)

    new Promise(function(resolve) {
      socket.on('disconnect', resolve)
        // Global messages for all clients using socket.io
        //
        // Device note
        .on('device.note', function(data) {
          var decryptedData = cryptutil.decrypt(data)
          return dbapi.setDeviceNote(decryptedData.serial, decryptedData.note)
            .then(function() {
              return dbapi.loadDevice(decryptedData.serial)
            })
            .then(function(device) {
              if (device) {
                io.emit('device.change', cryptutil.encrypt({
                  important: true
                , data: {
                    serial: device.serial
                  , notes: device.notes
                  }
                }))
              }
            })
        })
        // Client specific messages
        //
        // Settings
        .on('user.settings.update', function(data) {
          var decryptedData = cryptutil.decrypt(data)
          dbapi.updateUserSettings(user.email, decryptedData)
        })
        .on('user.settings.reset', function() {
          dbapi.resetUserSettings(user.email)
        })
        .on('user.keys.accessToken.generate', function(data) {
          var decryptedData = cryptutil.decrypt(data)
          var jwt = jwtutil.encode({
            payload: {
              email: user.email
            , name: user.name
            }
          , secret: options.secret
          })

          var tokenId = util.format('%s-%s', uuid.v4(), uuid.v4()).replace(/-/g, '')
          var title = decryptedData.title

          return dbapi.saveUserAccessToken(user.email, {
            title: title
          , id: tokenId
          , jwt: jwt
          })
            .then(function() {
              socket.emit('user.keys.accessToken.generated', cryptutil.encrypt({
                title: title
              , tokenId: tokenId
              }))
            })
        })
        .on('user.keys.accessToken.remove', function(data) {
          var decryptedData = cryptutil.decrypt(data)
          return dbapi.removeUserAccessToken(user.email, decryptedData.title)
            .then(function() {
              socket.emit('user.keys.accessToken.removed', cryptutil.encrypt(decryptedData.title))
            })
        })
        .on('user.keys.adb.add', function(data) {
          return adbkit.util.parsePublicKey(data.key)
            .then(function(key) {
              return dbapi.lookupUsersByAdbKey(key.fingerprint)
                .then(function(users) {
                  if (users.length) {
                    throw new dbapi.DuplicateSecondaryIndexError()
                  }
                  else {
                    return dbapi.insertUserAdbKey(user.email, {
                      title: data.title
                    , fingerprint: key.fingerprint
                    })
                  }
                })
                .then(function() {
                  socket.emit('user.keys.adb.added', cryptutil.encrypt({
                    title: data.title
                  , fingerprint: key.fingerprint
                  }))
                })
            })
            .then(function() {
              push.send([
                wireutil.global
              , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
              ])
            })
            .catch(dbapi.DuplicateSecondaryIndexError, function(err) {
              socket.emit('user.keys.adb.error', cryptutil.encrypt({
                message: 'Someone already added this key'
              }))
            })
            .catch(Error, function(err) {
              socket.emit('user.keys.adb.error', cryptutil.encrypt({
                message: err.message
              }))
            })
        })
        .on('user.keys.adb.accept', function(data) {
          return dbapi.lookupUsersByAdbKey(data.fingerprint)
            .then(function(users) {
              if (users.length) {
                throw new dbapi.DuplicateSecondaryIndexError()
              }
              else {
                return dbapi.insertUserAdbKey(user.email, {
                  title: data.title
                , fingerprint: data.fingerprint
                })
              }
            })
            .then(function() {
              socket.emit('user.keys.adb.added', cryptutil.encrypt({
                title: data.title
              , fingerprint: data.fingerprint
              }))
            })
            .then(function() {
              push.send([
                user.group
              , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
              ])
            })
            .catch(dbapi.DuplicateSecondaryIndexError, function() {
              // No-op
            })
        })
        .on('user.keys.adb.remove', function(data) {
          return dbapi.deleteUserAdbKey(user.email, data.fingerprint)
            .then(function() {
              socket.emit('user.keys.adb.removed', cryptutil.encrypt(data))
            })
        })
        // Touch events
        .on('input.touchDown', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.TouchDownMessage, function() {
            deviceEventStore.storeEvent('input.touchDown', decryptedData);
            push.send([
              channel
              , wireutil.envelope(new wire.TouchDownMessage(
                decryptedData.seq
                , decryptedData.contact
                , decryptedData.x
                , decryptedData.y
                , decryptedData.pressure
              ))
            ])
          }, null, decryptedData.serial);
        })
        .on('input.touchMove', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.TouchMoveMessage, function() {
            deviceEventStore.storeEvent('input.touchMove', decryptedData);
            push.send([
              channel
              , wireutil.envelope(new wire.TouchMoveMessage(
                decryptedData.seq
                , decryptedData.contact
                , decryptedData.x
                , decryptedData.y
                , decryptedData.pressure
              ))
            ])
          }, null, data.serial);
        })
        .on('input.touchUp', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.TouchUpMessage, function() {
            deviceEventStore.storeEvent('input.touchUp', decryptedData);

            push.send([
              channel
              , wireutil.envelope(new wire.TouchUpMessage(
                decryptedData.seq
                , decryptedData.contact
              ))
            ])
          }, null, decryptedData.serial);

        })
        .on('input.touchCommit', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.TouchCommitMessage, function() {
            deviceEventStore.storeEvent('input.touchCommit', decryptedData);

            push.send([
              channel
              , wireutil.envelope(new wire.TouchCommitMessage(
                decryptedData.seq
              ))
            ])
          }, null, decryptedData.serial);

        })
        .on('input.touchReset', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.TouchResetMessage, function() {
            deviceEventStore.storeEvent('input.touchReset', decryptedData);

            push.send([
              channel
              , wireutil.envelope(new wire.TouchResetMessage(
                decryptedData.seq
              ))
            ])
          }, null, decryptedData.serial);
        })
        .on('input.gestureStart', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.GestureStartMessage, function() {
            push.send([channel,
              wireutil.envelope(new wire.GestureStartMessage(
              decryptedData.seq
              ))
            ]);
          }, function(callback) {
            var imgId =  decryptedData.imgId.split('_')[1];
            viewResHandlers[decryptedData.serial + imgId] = function(viewHierarchy) {
              decryptedData.viewHierarchy = viewHierarchy;
              deviceEventStore.storeEvent('input.gestureStart', decryptedData);
              callback();
            };

            // Send a request to the TCP view bridge.
            push.send([channel,
              wireutil.envelope(new wire.ViewBridgeGetMessage(
                  imgId,
                  decryptedData.serial
              ))
            ]);

            // If we don't hear back from the device's view hierarchy service,
            // ignore the request, log a warning, and move on.
            setTimeout(function noResponse(){
              if (viewResHandlers[decryptedData.serial + imgId]) {
                log.warn('View hierarchy response timed out, ' +
                  'skipping request. --------------------------------------  ' +
                  decryptedData.serial + ":" + imgId);
                var viewResHandler = viewResHandlers[decryptedData.serial + imgId];
                viewResHandlers[decryptedData.serial + imgId] = null;

                // Invoke the gesture save with an error message.
                viewResHandler(VIEW_REQ_ERR_MSG);
              }
            }, VIEW_REQ_XMIT_TIMEOUT);
          }, decryptedData.serial);
        })
        .on('input.gestureStop', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.GestureStopMessage, function() {
            deviceEventStore.storeEvent('input.gestureStop', decryptedData);

            push.send([
              channel
              , wireutil.envelope(new wire.GestureStopMessage(
                decryptedData.seq
              ))
            ])
          }, null, decryptedData.serial);
        })
        // Key events
        .on('input.keyDown', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.KeyDownMessage, function() {
            deviceEventStore.storeEvent('input.keyDown', decryptedData);

            push.send([
              channel,
              wireutil.envelope(new wire.KeyDownMessage(
                  decryptedData.key
              ))
            ]);
          }, null, decryptedData.serial);
        })
        .on('input.keyUp', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.KeyUpMessage, function() {
            deviceEventStore.storeEvent('input.keyUp', decryptedData);

            push.send([
              channel,
              wireutil.envelope(new wire.KeyUpMessage(
                  decryptedData.key
              ))
            ]);
          }, null, decryptedData.serial);
        })
        .on('input.keyPress', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.KeyPressMessage, function() {
            deviceEventStore.storeEvent('input.keyPress', decryptedData);

            push.send([
              channel,
              wireutil.envelope(new wire.KeyPressMessage(
                  decryptedData.key
              ))
            ]);
          }, null, decryptedData.serial);
        })
        .on('input.type', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.TypeMessage, function() {
            deviceEventStore.storeEvent('input.type', decryptedData);

            push.send([
              channel
              , wireutil.envelope(new wire.TypeMessage(
                decryptedData.text
              ))
            ])
          }, null, decryptedData.serial);
        })
        .on('input.replay', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel);
          push.send([
            channel
            , wireutil.transaction(
              responseChannel
              , new wire.ReplayMessage(decryptedData.token)
            )
          ]);
        })
        .on('display.rotate', function(channel, data) {
          var decryptedData = cryptutil.decrypt(data);
          decryptedData.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.RotateMessage, function() {
            push.send([
              channel
              , wireutil.envelope(new wire.RotateMessage(
                decryptedData.rotation
              ))
            ])
          }, null, decryptedData.serial);
        })
        // Transactions
        .on('clipboard.paste', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          data.serverXmlRequestedTimestamp = new Date().getTime();
          layoutCaptureService.enqueue(wire.PasteMessage, function() {
            deviceEventStore.storeEvent('clipboard.paste', data);

            joinChannel(responseChannel)
            push.send([
              channel
              , wireutil.transaction(
                responseChannel
                , new wire.PasteMessage(data.text)
              )
            ])
          }, null, data.serial);
        })
        .on('clipboard.copy', function(channel, responseChannel) {
          joinChannel(responseChannel);
          push.send([
            channel,
            wireutil.transaction(
                responseChannel,
                new wire.CopyMessage()
            )
          ]);
        })
        .on('device.identify', function(channel, responseChannel) {
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.PhysicalIdentifyMessage()
            )
          ])
        })
        .on('device.reboot', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.RebootMessage()
            )
          ])
        })
        .on('account.check', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.AccountCheckMessage(decryptedData)
            )
          ])
        })
        .on('account.remove', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.AccountRemoveMessage(decryptedData)
            )
          ])
        })
        .on('account.addmenu', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.AccountAddMenuMessage()
            )
          ])
        })
        .on('account.add', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.AccountAddMessage(decryptedData.user, decryptedData.password)
            )
          ])
        })
        .on('account.get', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.AccountGetMessage(decryptedData)
            )
          ])
        })
        .on('sd.status', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.SdStatusMessage()
            )
          ])
        })
        .on('ringer.set', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.RingerSetMessage(decryptedData.mode)
            )
          ])
        })
        .on('ringer.get', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.RingerGetMessage()
            )
          ])
        })
        .on('wifi.set', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.WifiSetEnabledMessage(decryptedData.enabled)
            )
          ])
        })
        .on('wifi.get', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.WifiGetStatusMessage()
            )
          ])
        })
        .on('group.invite', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data)
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.GroupMessage(
                new wire.OwnerMessage(
                  user.email
                , user.name
                , user.group
                )
              , decryptedData.timeout || null
              , wireutil.toDeviceRequirements(decryptedData.requirements)
              )
            )
          ])
        })
        .on('group.kick', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.UngroupMessage(
                wireutil.toDeviceRequirements(decryptedData.requirements)
              )
            )
          ])
        })
        .on('tx.cleanup', function(channel) {
          leaveChannel(channel)
        })
        .on('tx.punch', function(channel) {
          joinChannel(channel)
          socket.emit('tx.punch', channel)
        })
        .on('shell.command', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ShellCommandMessage(decryptedData)
            )
          ])
        })
        .on('shell.keepalive', function(channel, data) {
          push.send([
            channel
          , wireutil.envelope(new wire.ShellKeepAliveMessage(data))
          ])
        })
        .on('device.uninstall', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data)
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.UninstallMessage(decryptedData)
            )
          ])
        })
        .on('storage.upload', function(channel, responseChannel, data) {
          joinChannel(responseChannel)
          request.postAsync({
              url: util.format(
                '%sapi/v1/resources?channel=%s'
              , options.storageUrl
              , responseChannel
              )
            , json: true
            , body: {
                url: data.url
              }
            })
            .catch(function(err) {
              log.error('Storage upload had an error', err.stack)
              leaveChannel(responseChannel)
              socket.emit('tx.cancel', responseChannel, cryptutil.encrypt({
                success: false
              , data: 'fail_upload'
              }))
            })
        })
        .on('forward.test', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data)
          joinChannel(responseChannel)
          if (!decryptedData.targetHost || decryptedData.targetHost === 'localhost') {
            decryptedData.targetHost = user.ip
          }
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ForwardTestMessage(decryptedData)
            )
          ])
        })
        .on('forward.create', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data)
          if (!decryptedData.targetHost || decryptedData.targetHost === 'localhost') {
            decryptedData.targetHost = user.ip
          }
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ForwardCreateMessage(decryptedData)
            )
          ])
        })
        .on('forward.remove', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data)
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ForwardRemoveMessage(decryptedData)
            )
          ])
        })
        .on('logcat.start', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data)
          log.info('Starting logcat service.');
          joinChannel(responseChannel);

          dbapi.getAppIdBySerial(decryptedData.serial, function(err, appId) {
            if (err || !appId) {
              return log.error('Could not fetch app id from serial.', err);
            }

            var msg = {
              filters: decryptedData.filters,
              appId: appId
            };

            push.send([
              channel,
              wireutil.transaction(
                  responseChannel,
                  new wire.LogcatStartMessage(msg))
            ]);
            push.send([
              channel,
              wireutil.transaction(
                  responseChannel,
                  new wire.ViewBridgeStartMessage(msg))
            ]);
          });
        })
        .on('logcat.stop', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          log.info('Stoping logcat service.');
          var serial = decryptedData.requirements.serial.value;
          dbapi.getAppIdBySerial(serial, function(err, appId) {
            if (err || !appId) {
              return log.error('Could not fetch app id from serial.', err);
            }

            joinChannel(responseChannel);
            push.send([
              channel,
              wireutil.transaction(
                  responseChannel,
                  new wire.LogcatStopMessage({appId: appId}))
            ]);
            push.send([
              channel,
              wireutil.transaction(
                  responseChannel,
                  new wire.ViewBridgeStopMessage({appId: appId}))
            ]);
          });
        })
        .on('connect.start', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ConnectStartMessage()
            )
          ])
        })
        .on('connect.stop', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ConnectStopMessage()
            )
          ])
        })
        .on('browser.open', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.BrowserOpenMessage(decryptedData)
            )
          ])
        })
        .on('browser.clear', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.BrowserClearMessage(decryptedData)
            )
          ])
        })
        .on('store.open', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.StoreOpenMessage()
            )
          ])
        })
        .on('screen.capture', function(channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.ScreenCaptureMessage()
            )
          ])
        })
        .on('fs.retrieve', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.FileSystemGetMessage(decryptedData)
            )
          ])
        })
        .on('fs.list', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          push.send([
            channel
          , wireutil.transaction(
              responseChannel
            , new wire.FileSystemListMessage(decryptedData)
            )
          ])
        })
        .on('app.return', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          dbapi.getAppIdBySerial(decryptedData.serial, function(err, appId) {
            if (err || !appId) {
              return log.error('Could not fetch app id from serial.', err);
            }

            push.send([
              channel,
              wireutil.transaction(
                  responseChannel,
                  new wire.ReturnToAppMessage({appId: appId}))
            ]);
          });
        })
        .on('app.reinstall', function(channel, responseChannel, data) {
          var decryptedData = cryptutil.decrypt(data);
          joinChannel(responseChannel)
          dbapi.getAppIdBySerial(decryptedData.serial, function(err, appId) {
            if (err || !appId) {
              return log.error('Could not fetch app id from serial.', err);
            }

            push.send([
              channel,
              wireutil.transaction(
                  responseChannel,
                  new wire.InstallMessage({packageName: appId}))
            ]);
          });
        })
    })
    .finally(function() {
      // Clean up all listeners and subscriptions
      channelRouter.removeListener(wireutil.global, messageListener)
      channels.forEach(function(channel) {
        channelRouter.removeListener(channel, messageListener)
        sub.unsubscribe(channel)
      })
    })
    .catch(function(err) {
      // Cannot guarantee integrity of client
      log.error(
        'Client had an error, disconnecting due to probable loss of integrity'
      , err.stack
      )

      socket.disconnect(true)
    })
  })

  lifecycle.observe(function() {
    [push, sub].forEach(function(sock) {
      try {
        sock.close()
      }
      catch (err) {
        // No-op
      }
    })
  })

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}
