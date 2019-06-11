var http = require('http')
var events = require('events')
var url = require('url')
var fs = require('fs')

var Promise = require('bluebird');
var express = require('express')
var validator = require('express-validator')
var cookieSession = require('cookie-session')
var bodyParser = require('body-parser')
var serveFavicon = require('serve-favicon')
var serveStatic = require('serve-static')
var csrf = require('csurf')
var compression = require('compression')
var uuid = require('node-uuid')
var _ = require('underscore')

var logger = require('../../util/logger')
var pathutil = require('../../util/pathutil')
var dbapi = require('../../db/api')
var datautil = require('../../util/datautil')
var emailutil = require('../../util/emailutil')
var zmqutil = require('../../util/zmqutil')
var wire = require('../../wire')
var wireutil = require('../../wire/util')
var wirerouter = require('../../wire/router')
var srv = require('../../util/srv')
var lifecycle = require('../../util/lifecycle')
var config = require('../../../config');

var authFactory = require('./middleware/auth')
var deviceIconMiddleware = require('./middleware/device-icons')
var browserIconMiddleware = require('./middleware/browser-icons')
var appstoreIconMiddleware = require('./middleware/appstore-icons')

var markdownServe = require('markdown-serve')

const MILLIS_PER_SEC = 1000;
const SECS_PER_MIN = 60;
const MILLIS_PER_MIN = SECS_PER_MIN * MILLIS_PER_SEC;

module.exports = function(options) {
  var log = logger.createLogger('app')
  var app = express()
  var server = http.createServer(app)

  // zmq sockets allow communication with device
  // processes for installing apps

  // Output
  var push = zmqutil.socket('push');
  Promise.map(options.endpoints.push, function(endpoint) {
    return srv.resolve(endpoint).then(function(records) {
      return srv.attempt(records, function(record) {
        log.info('Sending output to "%s"', record.url);
        push.connect(record.url);
        return Promise.resolve(true);
      });
    });
  }).catch(function(err) {
    log.fatal('Unable to connect to push endpoint', err);
    lifecycle.fatal();
  });

  // Input
  var sub = zmqutil.socket('sub');
  Promise.map(options.endpoints.sub, function(endpoint) {
    return srv.resolve(endpoint).then(function(records) {
      return srv.attempt(records, function(record) {
        log.info('Receiving input from "%s"', record.url);
        sub.connect(record.url);
        return Promise.resolve(true);
      });
    });
  })
  .catch(function(err) {
    log.fatal('Unable to connect to sub endpoint', err);
    lifecycle.fatal();
  });

  // Wire transactions create new response channels. The channelRouter
  // encapsulates subscribing/unsubscribing from these channels and
  // dispatching messages.
  var channels = {};
  var channelRouter = new events.EventEmitter();
  function addChannelListener(channel, listener) {
    channels[channel] = listener;
    channelRouter.on(channel, listener);
    sub.subscribe(channel);
  }
  function removeChannelListener(channel) {
    var listener = channels[channel];
    channelRouter.removeListener(channel, listener);
    delete channels[channel];
    sub.unsubscribe(channel);
  }
  sub.on('message', function(channel, data) {
    channelRouter.emit(channel.toString(), channel, data);
  });

  var makeDeviceTransaction = function(channel, wireMsg) {
    return new Promise(function(resolve, reject) {
      // Add listener for completion message.
      var txChannel = 'tx.' + uuid.v4();
      addChannelListener(txChannel, wirerouter()
        .on(wire.TransactionDoneMessage, function(channel, message) {
          removeChannelListener(txChannel);
          if (message.success) {
            resolve(message.data);
          } else {
            reject(message.data);
          }
        })
          .handler()
      );

      push.send([
        channel,
        wireutil.transaction(
          txChannel
          , wireMsg
        )
      ]);
    });
  }

  app.use('/static/wiki', markdownServe.middleware({
    rootDirectory: pathutil.root('node_modules/stf-wiki')
  , view: 'docs'
  }))

  app.set('view engine', 'pug')
  app.set('views', pathutil.resource('app/views'))
  app.set('strict routing', true)
  app.set('case sensitive routing', true)
  app.set('trust proxy', true)

  if (fs.existsSync(pathutil.resource('build'))) {
    log.info('Using pre-built resources')
    app.use(compression())
    app.use('/static/app/build/entry',
      serveStatic(pathutil.resource('build/entry')))
    app.use('/static/app/build', serveStatic(pathutil.resource('build'), {
      maxAge: '10d'
    }))
  }
  else {
    log.info('Using webpack')
    // Keep webpack-related requires here, as our prebuilt package won't
    // have them at all.
    var webpackServerConfig = require('./../../../webpack.config').webpackServer
    app.use('/static/app/build',
      require('./middleware/webpack')(webpackServerConfig))
  }

  app.use('/static/bower_components',
    serveStatic(pathutil.resource('bower_components')))
  app.use('/static/app/data', serveStatic(pathutil.resource('data')))
  app.use('/static/app/status', serveStatic(pathutil.resource('common/status')))
  app.use('/static/app/browsers', browserIconMiddleware())
  app.use('/static/app/appstores', appstoreIconMiddleware())
  app.use('/static/app/devices', deviceIconMiddleware())
  app.use('/static/app', serveStatic(pathutil.resource('app')))

  app.use('/static/logo',
    serveStatic(pathutil.resource('common/logo')))
  app.use(serveFavicon(pathutil.resource(
    'common/logo/exports/STF-128.png')))

  app.use(cookieSession({
    name: options.ssid
  , keys: [options.secret]
  }))

  var auth = authFactory({
    secret: options.secret
  , authUrl: options.authUrl
  });
  app.use(function(req, res, next) {
    // Skip authentication for some API paths.
    if (req.path.indexOf('/app/api/v1/noauth/') === 0) {
      return next();
    }
    return auth(req, res, next);
  });

  // This needs to be before the csrf() middleware or we'll get nasty
  // errors in the logs. The dummy endpoint is a hack used to enable
  // autocomplete on some text fields.
  app.all('/app/api/v1/dummy', function(req, res) {
    res.send('OK')
  })

  var expireToken = function(token, res) {
    dbapi.expireToken(token).then(function() {
      res.sendStatus(200);
    }).catch(function(err) {
      log.error('Error expiring token: ', err.stack);
      res.sendStatus(500);
    });
  };

  app.delete('/app/api/v1/token/:token', function(req, res) {
    var token = req.params.token;

    expireToken(token, res);
  });

  app.delete('/app/api/v1/token', function(req, res) {
    var serial = req.query.serial;

    dbapi.getDeviceBySerial(serial).then(function(device) {
      if (device && device.owner && device.owner.email) {
        // TODO: email field should really be called token
        expireToken(device.owner.email, res);
      } else {
        res.status(404);
        res.send('No owner found for serial: ' + serial);
      }
    }).catch(function(err) {
      log.error('Failed to get device by serial: ', err.stack);
      res.sendStatus(500);
    });
  });

  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json())

  app.post('/app/api/v1/noauth/feedback/:token', function(req,res) {
    var token = req.params.token;
    var feedback = _.clone(req.body);
    feedback.token = token;
    feedback.hadIssues = (req.body.hadIssues === 'on');
    feedback.tasks = _.without(req.body.tasks, '');

    dbapi.saveFeedback(feedback).then(function() {
      return res.redirect('/auth/token/' + token);
    });
  });

  app.post('/app/api/v1/noauth/responses/:token', function(req, res) {
    var token = req.params.token;
    req.body.token = token;
    dbapi.saveResponse(req.body).then(function() {
      if (req.body.taskAnswer) {
        return res.sendStatus(200);
      }
      return res.redirect('/auth/token/' + token);
    }).catch(function(err) {
      console.error('Error saving response', err);
      res.sendStatus(500);
    });
  });

  app.post('/app/api/v1/noauth/task-answer/:token', function(req,res) {
    var token = req.params.token;
    var task = _.clone(req.body);
    task.token = token;
    task.hadIssues = (req.body.hadIssues === 'on');
    task.answer = req.body.answer;

    dbapi.saveTask(task).then(function() {
      return res.redirect('/auth/token/' + token);
    });
  });

  app.use(csrf())
  app.use(validator())

  app.use(function(req, res, next) {
    res.cookie('XSRF-TOKEN', req.csrfToken())
    next()
  })

  app.get('/', function(req, res) {
    res.render('index', {stfConfig: JSON.stringify(config || {})});
  })

  app.get('/app/api/v1/state.js', function(req, res) {
    var state = {
      config: {
        websocketUrl: (function() {
          var wsUrl = url.parse(options.websocketUrl, true)
          wsUrl.query.uip = req.ip
          return url.format(wsUrl)
        })()
      }
    , user: req.user
    }

    if (options.userProfileUrl) {
      state.config.userProfileUrl = (function() {
        return options.userProfileUrl
      })()
    }

    res.type('application/javascript')
    res.send('var GLOBAL_APPSTATE = ' + JSON.stringify(state))
  })

  app.get('/app/api/v1/user', function(req, res) {
    res.json({
      success: true
    , user: req.user
    })
  })

  app.get('/app/api/v1/group', function(req, res) {
    dbapi.loadGroup(req.user.email).then((devices) => {
      devices.forEach(function(device) {
        datautil.normalize(device, req.user)
      })
      res.json({
        success: true
      , devices
      })
    })
    .catch(function(err) {
      log.error('Failed to load group: ', err.stack)
      res.json(500, {
        success: false
      })
    })
  })

  app.get('/app/api/v1/devices', function(req, res) {
    dbapi.loadDevices().then((devices) => {
      devices.forEach(function(device) {
        datautil.normalize(device, req.user)
      })

      res.json({
        success: true
      , devices
      })
    })
    .catch(function(err) {
      log.error('Failed to load device list: ', err.stack)
      res.json(500, {
        success: false
      })
    })
  })

  app.get('/app/api/v1/devices/:serial', function(req, res) {
    dbapi.loadDevice(req.params.serial)
      .then(function(device) {
        if (device) {
          datautil.normalize(device, req.user)
          res.json({
            success: true
          , device: device
          })
        }
        else {
          res.json(404, {
            success: false
          })
        }
      })
      .catch(function(err) {
        log.error('Failed to load device "%s": ', req.params.serial, err.stack)
        res.json(500, {
          success: false
        })
      })
  })

  app.get('/app/api/v1/accessTokens', function(req, res) {
    dbapi.loadAccessTokens(req.user.email).then(function(devices) {
      const titles = []
      devices.forEach(function(token) {
        titles.push(token.title)
      })
      res.json({
        success: true
      , titles: titles
      })
    })
    .catch(function(err) {
      log.error('Failed to load tokens: ', err.stack)
      res.json(500, {
        success: false
      })
    })
  })

  // Tilde pattern is REST shorthand for "my", e.g. get my token.
  app.get('/app/api/v1/token/~', function(req, res) {
    if (!req.user || !req.user.email) {
      res.status(404);
      return res.send('Missing user email in request.');
    }

    dbapi.getToken(req.user.email).then(function(tokenObj) {
      if (tokenObj) {
        res.json(tokenObj);
      } else {
        res.status(404);
        res.send('Token not found for email: ' + req.user.email);
      }
    }).catch(function(err) {
      log.error('Failed to get token: ', err.stack);
      res.sendStatus(500);
    });
  });

  app.post('/app/api/v1/twilio', function(req, res) {
    var body = req.query.Body;
    var from = req.query.From;
    var to = req.query.To;

    dbapi.saveSms(from, to , body);
  });

  var getEmail = function(token) {
    return emailutil.getEmail(token.serial)
      .then(function(emails) {
        // Only returns emails that arrived after this token became active.
        emails = emails.filter(function(email) {
          var emailDate = new Date(email.date.getTime()),
            tokenStart = new Date(token.activeTimeStart);
          return (emailDate > tokenStart);
        });

        // Formats newlines for HTML display.
        emails.forEach(function(email) {
          if (email.text) {
            email.text = email.text.replace(/\n/g, '<br>');
          }
        });

        return emails;
      });
  }

  var getSms = function(token) {
    var phoneNumber = config.loginInfo[token.serial].sms;
    var startTime = token.activeTimeStart;
    return dbapi.getSms(phoneNumber, startTime);
  };

  app.get('/app/api/v1/messages/~', function(req, res) {
    if (!req.user || !req.user.email) {
      res.status(404);
      return res.send('Missing user email in request.');
    }
    dbapi.getToken(req.user.email)
      .then(function(token) {
        return Promise.all([getEmail(token), getSms(token)]);
      }).spread(function(emails, smsMessages) {
        return res.json({
          success: true,
          emails: emails,
          smsMessages: smsMessages
        });
      }).catch(function(err) {
        return res.status(500).send(err);
      });
  });

  app.post('/app/api/v1/replay/~', function(req, res) {
    if (!req.user || !req.user.email) {
      res.status(500);
      return res.send('Missing user token in request');
    }
    var tokenObj;
    dbapi.getToken(req.user.email)
      .then(function(_tokenObj) {
        tokenObj = _tokenObj;
        return dbapi.loadDevice(tokenObj.serial);
      }).then(function(device) {
        return makeDeviceTransaction(device.channel,
          new wire.ViewHashMessage()).catch(function(err) {
            console.error('Could not get final view hash for replay token:', err);
            return Promise.resolve(null);
          });
      }).then(function(viewHash) {
        console.log('Got viewHash');
        console.log(viewHash);
        return dbapi.saveReplay(tokenObj.appId, req.user.email, viewHash);
      }).then(function() {
        console.log('Saved replay');
        return res.status(200).send();
      });
  });

  app.delete('/app/api/v1/events/~', function(req, res) {
    if (!req.user || !req.user.email) {
      res.status(500);
      return res.send('Missing user token in request');
    }
    dbapi.deleteInputEvents(req.user.email).then(function() {
      return res.status(200).send();
    });
  });

  /**
   * Installs an app on the device given by the "serial" query param.
   */
  app.get('/app/api/v1/install/', function(req, res) {
    var serial = req.query.serial;
    var packageName = req.query.packageName;
    var device;

    dbapi.loadDevice(serial)
      .then(function(_device) {
        device = _device;
        return makeDeviceTransaction(device.channel,
          new wire.InstallMessage(packageName)).catch(function() {
            console.error('Installation failed');
            return Promise.reject();
          });
      }).then(function() {
        // Apps sometimes don't get launched automatically after install.
        // To solve this, we explicitly request the app to be launched.
        // Maybe if we ask nicely, the phones will accept our request.
        return makeDeviceTransaction(device.channel,
          new wire.ReturnToAppMessage(packageName))
          .catch(function() {
            console.error(`Failed to launch the app ${packageName}`);
            return Promise.reject();
          });
      }).then(function() {
        res.status(200).send();
      }).catch(function(err) {
        res.status(500).send();
      });
  });

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}
