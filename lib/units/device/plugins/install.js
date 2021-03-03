var stream = require('stream')
var url = require('url')
var util = require('util')

var syrup = require('stf-syrup')
var request = require('request')
var Promise = require('bluebird')
var sleep = require('sleep-promise')

var logger = require('../../../util/logger')
var wire = require('../../../wire')
var wireutil = require('../../../wire/util')
var promiseutil = require('../../../util/promiseutil')
var config = require('../../../../config')
var dbapi = require('../../../db/api')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .define(function(options, adb, router, push) {
    var log = logger.createLogger('device:plugins:install')
    var serial = options.serial;

    var plugin = Object.create(null);

    plugin.install = function (appId) {
      log.info('Installing ' + appId + ' to ' + serial);
      return dbapi.getApp(appId).then(function (app) {
        var androidId = app.androidId || appId;
        return adb.isInstalled(serial, androidId)
          .then(function (installed) {
            const deviceInfo = config.deviceInfo[serial] || config.deviceInfo.default
            if (installed) {
              return adb.uninstall(serial, androidId);
            }
            return Promise.resolve();
          })
          .then(function () {
            return adb.install(serial, config.apkDirectory + appId + '.apk');
          })
          .then(function () {
            return adb.shell(serial,
                'monkey -p ' + androidId + ' -c android.intent.category.LAUNCHER 1')
              .timeout(300);
          }).then(sleep(5000)); // Give the app some time to start up
      });
    }

    router.on(wire.InstallMessage, function(channel, message) {
      var reply = wireutil.reply(serial);
      plugin.install(message.packageName)
        .then(function() {
          push.send([
            channel
            , reply.okay('success')
          ]);
        })
        .catch(function(err) {
          log.error('Installation failed', err);
          push.send([
            channel
            , reply.fail('fail')
          ])
        })
    });

    router.on(wire.UninstallMessage, function(channel, message) {
      log.info('Uninstalling "%s"', message.packageName)

      var reply = wireutil.reply(serial)

      adb.uninstall(serial, message.packageName)
        .then(function() {
          push.send([
            channel
          , reply.okay('success')
          ])
        })
        .catch(function(err) {
          log.error('Uninstallation failed', err.stack)
          push.send([
            channel
          , reply.fail('fail')
          ])
        })
    })

    return plugin;
  })
