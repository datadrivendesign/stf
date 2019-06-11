var syrup = require('stf-syrup');

var wire = require('../../../wire');
var wireutil = require('../../../wire/util');
var config = require('../../../../config');
var _ = require('underscore');

// Requests a new view hierarchy for analysis after this many milliseconds
// without a new frame.
var HIERARCHY_REQUEST_DELAY = 500;

module.exports = syrup.serial()
  .dependency(require('./screen/stream'))
  .dependency(require('./viewbridge'))
  .dependency(require('../support/push'))
  .dependency(require('./group'))
  .define(function(options, screenStream, viewbridge, push, group) {
    if (!config.piiDetectionEnabled) {
      return;
    }

    var textEntryClasses = {
      'android.widget.EditText': true
    };

    var flaggedWords = ['email', 'password', 'phone number', 'credit card'];

    // Traverses nodes in a hierarchy until callback returns true.
    var traverseHierarchy = function(root, callback) {
      if (!root) {
        return false;
      }
      if (callback(root)) {
        return true;
      }
      var children = root.children || [];
      for (var i = 0; i < children.length; i++) {
        if (traverseHierarchy(children[i], callback)) {
          return true;
        }
      }
      return false;
    };

    var allowsTextEntry = function(root) {
      return traverseHierarchy(root, function(node) {
        if (textEntryClasses[node.class]) {
          return true;
        }
        var ancestors = node.ancestors || [];
        for (var i in ancestors) {
          if (textEntryClasses[ancestors[i]]) {
            return true;
          }
        }
        return false;
      });
    };

    /**
     * @return {array} a list of all the flagged words found in the hierarchy
     */
    var getFlaggedWords = function(root) {
      var foundWords = {};
      traverseHierarchy(root, function(node) {
        if (node.text) {
          // Removes all punctuation and collapsed whitespace.
          var text = node.text.replace(/[^\w\s]|_/g, "")
                      .replace(/\s+/g, " ")
                      .toLowerCase();
          for (var i in flaggedWords) {
            var flaggedWord = flaggedWords[i];
            if (text.indexOf(flaggedWord) !== -1) {
              foundWords[flaggedWord] = true;
            }
          }
        }
        return false; // Continue traversing
      });
      return _.keys(foundWords);
    };

    var getPiiFlags = function(viewHierarchyString) {
      try {
        var viewHierarchy = JSON.parse(viewHierarchyString);
        var root = viewHierarchy.activity.root;
        var flaggedWords = getFlaggedWords(root);
        if (flaggedWords && allowsTextEntry(root)) {
          return flaggedWords;
        }
        return [];
      } catch (e) {
        console.error('Error parsing view hierarchy');
        return [];
      }
    };

    var requestViewHierarchy = _.debounce(function() {
      group.get().then(function(group) {
        // The PII detector shares access to the viewbridge with the logic
        // for tracking user gestures. To avoid starving the gesture logic,
        // only request view hierarchies if the viewbridge is not being used.
        viewbridge.tryToGetViewHierarchy('').then(function(viewHierarchy) {
          push.send([
            group.group,
            wireutil.envelope(
              new wire.DevicePiiWarningMessage(
                options.serial,
                getPiiFlags(viewHierarchy)
              )
            )
          ]);
        }).catch(_.noop);
      }).catch(_.noop);
    }, HIERARCHY_REQUEST_DELAY);

    var frameListener = function(frame) {
      requestViewHierarchy();
    };

    screenStream.broadcastSet.insert('pii', {
      onStart: _.noop,
      onFrame: frameListener
    });
  });
