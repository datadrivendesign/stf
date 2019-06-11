var syrup = require('stf-syrup');
var Promise = require('bluebird');
var net = require('net');
var locks = require('locks');
var logger = require('../../../util/logger');
var wire = require('../../../wire');
var wireutil = require('../../../wire/util');
var lifecycle = require('../../../util/lifecycle');
var config = require('../../../../config');
var _ = require('underscore');

// Localhost binding complies with STF spec, placing
// the device threads on the same host as adb.
const ADB_VIEW_SERVER_HOST = '127.0.0.1';
const VIEW_JSON_END_DELIMITER = 'RICO_JSON_END';

module.exports = syrup.serial()
    .dependency(require('../support/adb'))
    .dependency(require('../support/router'))
    .dependency(require('../support/push'))
    .dependency(require('./group'))
    .define(function(options, adb, router, push, group) {
      // This odd plugin/object setup follows the OpenSTF open source
      // plugin pattern.
      var log = logger.createLogger('device:plugins:viewbridge');
      var plugin = Object.create(null);
      var activeViewBridge = null;

      // To prevent timeout issues, only one unresolved request to the
      // viewbridge may exist at a time. We use a mutex to control access
      // to the viewbridge.
      var mutex = locks.createMutex();

      // A queue for tracking currently outstanding requests. Currently,
      // the queue never holds more than one request.
      var requestQueue = [];

      var openViewBridge = function() {
        return new Promise(function(resolve, reject) {
          log.info('adb view bridge opening stream.');

          var activeViewBridge = new net.Socket();
          var port = options.viewbridgePort;
          activeViewBridge.connect(port, ADB_VIEW_SERVER_HOST, function() {
            resolve(activeViewBridge);
          });

          activeViewBridge.on('error', function(err) {
            reject();
            log.error('Unable to access adb view bridge');
            throw err;
          });
        });
      };

      // The plugin start implementation follows the OpenSTF
      // plugin pattern of deferred stop-start
      plugin.start = function() {
        return plugin.stop()
          .then(function() {
            log.info('Starting view bridge.');
            return openViewBridge(options.serial);
          })
          .then(function(viewBridge) {
            activeViewBridge = viewBridge;

            // Accumulates chunks of a view hierarchy until complete,
            // then resolves the first promise in the request queue.
            var viewBridgeJson = '';
            function entryListener(entry) {
              var entryText = entry.toString();
              var splitEntryText = entryText.split(VIEW_JSON_END_DELIMITER);
              var isEndOfJson = splitEntryText.length > 1;
              viewBridgeJson += splitEntryText[0];
              if (isEndOfJson) {
                var resolver = requestQueue.shift();
                if (resolver) {
                  resolver(viewBridgeJson);
                }
                viewBridgeJson = '';
              }
            }

            activeViewBridge.on('data', entryListener);

            return plugin.reset();
          });
      };

      /**
       * Makes a request for a dump of the view hierarchy. Should only be
       * called after obtaining the mutex lock.
       * @return {Promise} - resolves with view hierarchy.
       */
      plugin.getSeq = Promise.method(function(seq) {
        if (plugin.isRunning()) {
          var promise = new Promise(function(resolve, reject) {
            // When the response comes in, the resolver will be dequeued and
            // the promise will resolve with the view hierarchy.
            requestQueue.push(resolve);

            // To prevent the mutex from locking forever in the case of a lost
            // response, set a timeout.
            setTimeout(function() {
              if (promise.isPending()) {
                requestQueue.shift();
                var err = 'No response from viewbridge for seq ' + seq;
                console.error(err);
                reject(err);
              }
            }, config.viewHierarchyTimeout * 2);
          });

          // The view bridge writes a 'd' character over tcp
          // to request a dump from the on-device view hierarchy dump service.
          activeViewBridge.write('d ' + seq + '\n');
          return promise;
        }
      });

      /**
       * Will make a request for a view hierarchy iff there is not currently
       * an active request. Otherwise, the Promise rejects.
       * @return {Promise} - resolves with the view hierarchy
       */
      plugin.tryToGetViewHierarchy = function(seq) {
        if (mutex.tryLock()) {
          return plugin.getSeq(seq).finally(function() {
            mutex.unlock();
          });
        } else {
          return Promise.reject('Viewbridge is busy');
        }
      };

      plugin.stop = Promise.method(function() {
        if (plugin.isRunning()) {
          log.info('Stopping view bridge.');
          activeViewBridge.destroy();
          activeViewBridge = null;
          if (mutex.isLocked) {
            mutex.unlock();
          }
          requestQueue = [];
        }
      });

      plugin.reset = Promise.method(function(filters) {
        filters = null;
      });

      plugin.isRunning = function() {
        return !!activeViewBridge && activeViewBridge.destroy;
      };

      lifecycle.observe(plugin.stop);
      group.on('leave', plugin.stop);

      router.on(wire.ViewBridgeStartMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial);
        plugin.start(message.filters)
            .then(function() {
              push.send([
                channel,
                reply.okay('success')
              ]);
            }).catch(function(err) {
              log.warn('Unable to open view bridge.', err.stack);
              push.send([
                channel,
                reply.fail('fail')
              ]);
            });
          })
          .on(wire.ViewBridgeGetMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial);

            // Wait for any outstanding request to finish before making
            // this request. Once the request is made, no other service will
            // be able to make requests until this one is resolved.
            mutex.lock(function() {
              plugin.getSeq(message.seq).then(function(viewBridgeJson) {
                group.get().then(function(group) {
                  try {
                    push.send([
                      group.group,
                      wireutil.envelope(
                        new wire.DeviceViewBridgeEntryMessage(
                          options.serial,
                          new Date().getTime(),
                          viewBridgeJson,
                          message.seq
                        )
                      )
                    ]);
                  } catch (err) {
                    log.warn('View bridge socket emit failure.');
                  }
                });
              }).catch(_.noop)
              .finally(function() {
                mutex.unlock();
              });
            });
            push.send([
              channel,
              reply.okay('success')
            ]);
          })
          .on(wire.ViewBridgeStopMessage, function(channel) {
            var reply = wireutil.reply(options.serial);
            plugin.stop()
                .then(function() {
                  push.send([
                    channel,
                    reply.okay('success')
                  ]);
                })
                .catch(function(err) {
                  log.warn('Failed to stop view bridge', err.stack);
                  push.send([
                    channel,
                    reply.fail('fail')
                  ]);
                });
          });

      return plugin;
    });
