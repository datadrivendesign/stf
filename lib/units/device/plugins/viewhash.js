var syrup = require('stf-syrup')
var _ = require('underscore');
var nch = require('non-crypto-hash');
var hasher = nch.createHash('superfasthash');

var wire = require('../../../wire')
var wireutil = require('../../../wire/util')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .dependency(require('./viewbridge'))
  .define(function(options, adb, router, push, viewbridge) {
    var plugin = {};

    var isAd = function(elem) {
      var adClasses = ['com.mopub.mobileads.MoPubView',
                       'com.google.ads.AdView',
                       'com.google.android.gms.ads'];
      var adIds = ['admob'];
      var classNames = [elem['class']].concat(elem['ancestors']);
      var hasAdClass = _.intersection(adClasses, classNames).length > 0;
      if (hasAdClass) {
        return true;
      }
      var resourceId = elem['resource-id'] || '';
      var hasAdId = _.some(adIds, function(adId) {
        return resourceId.indexOf(adId) !== -1;
      });
      return hasAdId;
    };

    var getElemIds = function(root) {
      var elemIds = [];
      if (root && !isAd(root)) {
        if (root['resource-id'] && root['visible-to-user']) {
          elemIds.push(root['resource-id']);
        }
        (root.children || []).forEach(function(child) {
          elemIds = elemIds.concat(getElemIds(child));
        });
        elemIds = _.uniq(elemIds).sort();
      }
      return elemIds;
    };

    plugin.computeHash = function(view) {
      var hashStr = [];
      if (view.activity_name) {
        hashStr.push(view.activity_name.trim());
      }
      var fragments = (view.activity.active_fragments || []).concat(
        view.activity.added_fragments || []);
      fragments.sort();
      hashStr = hashStr.concat(fragments.map(function(fragment) {
        return ':' + fragment.trim();
      }));
      var elemIds = getElemIds(view.activity.root).map(function(elemId) {
        return ';' + elemId.trim();
      });
      hashStr = hashStr.concat(elemIds);
      hashStr.push(':', view.is_keyboard_deployed);
      return hasher.hash(hashStr.join(''));
    };

    plugin.getCurrentViewHash = function() {
      return (viewbridge.isRunning() ? Promise.resolve() : viewbridge.start())
        .then(function() {
          return viewbridge.tryToGetViewHierarchy('');
        })
        .then(function(viewHierarchyString) {
          return JSON.parse(viewHierarchyString);
        }).then(plugin.computeHash);
    };

    router.on(wire.ViewHashMessage, function(channel, message) {
      var reply = wireutil.reply(options.serial);

      plugin.getCurrentViewHash().then(function(hash) {
        push.send([
          channel
          , reply.okay(hash)
        ])
      }).catch(function(err) {
        push.send([
          channel
          , reply.fail(err.toString())
        ]);
      });
    })

    return plugin;
  })
