var syrup = require('stf-syrup')

var wire = require('../../../wire')
var wireutil = require('../../../wire/util')
var dbapi = require('../../../db/api')
var logger = require('../../../util/logger')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .define(function(options, adb, router, push) {
    var log = logger.createLogger('device:plugins:return')

    router.on(wire.ReturnToAppMessage, function(channel, message) {
      var reply = wireutil.reply(options.serial);
      var appId = message.appId;

      log.info('Launching ' + appId + ' on ' + options.serial);
      dbapi.getApp(appId).then(function(app) {
        var androidId = app.androidId || appId;
        return adb.shell(options.serial,
          'monkey -p '+androidId+' -c android.intent.category.LAUNCHER 1')
          .timeout(300)
          .then(function() {
            push.send([
              channel
            , reply.okay()
            ])
          }).catch(function() {
            // If switching directly to the app fails, open the app switcher
            // instead.
            return adb.shell(options.serial, 'input keyevent KEYCODE_APP_SWITCH')
            .timeout(300)
            .then(function() {
              push.send([
                channel
                , reply.okay()
              ])
            });
          });
      }).catch(function() {
        push.send([
          channel
          , reply.fail(err.message)
        ]);
      });
    })
  })
