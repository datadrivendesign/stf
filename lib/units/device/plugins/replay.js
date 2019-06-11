var syrup = require('stf-syrup')
var _ = require('underscore')
var Promise = require('bluebird')
var sleep = require('sleep-promise')

var wire = require('../../../wire')
var wireutil = require('../../../wire/util')
var dbapi = require('../../../db/api')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .dependency(require('./viewbridge'))
  .dependency(require('./viewhash'))
  .dependency(require('./install'))
  .define(function(options, adb, router, push, viewbridge, viewhasher, installer) {
    // Gets a list of inputs to send to Monkey, including (x,y) coordinates
    // and time delays
    function getInputs(gesture, screenDimensions) {
      var inputs = []
      var lastTimestamp = gesture.events[0].timestamp;
      gesture.events.forEach(function(event) {
        if (event.x !== null && event.y !== null) {
          var delay = event.timestamp - lastTimestamp;
          lastTimestamp = event.timestamp;
          var x = Math.floor(event.x * screenDimensions.width);
          var y = Math.floor(event.y * screenDimensions.height);
          inputs.push({
            delay: delay,
            coords: [x, y]
          });
        }
      });
      return inputs;
    }

    // Returns map of request ids to clicked element ids
    function getLogcatMap(logcats) {
      var map = {};
      for (var i = 0; i < logcats.length; i++) {
        var current = logcats[i].split(':');
        var next = (i < logcats.length-1) ? logcats[i+1].split(':') : [];
        if (current[1] === 'Request_ID' && next[1] === 'click') {
          // We use : to separate different parts of the message, but
          // the resource id also has a : in it...
          map[current[2].trim()] = next[3] + ':' + next[4];
        }
      }
      return map;
    }

    function parseGestures(events, logcats, screenDimensions) {
      var gestures = [];
      var logcatMap = getLogcatMap(logcats);
      var currentGesture = { 'events': [] };
      // Create gestures objects
      events.forEach(function(event) {
        // Ignore touchCommit events; they're not useful.
        if (event.eventName === 'input.touchCommit') {
          return;
        }
        if (event.eventName === 'input.gestureStart' &&
            currentGesture.events.length) {
          gestures.push(currentGesture);
          currentGesture = { 'events': [] };
        }
        currentGesture.events.push(event);
        if (event.viewHierarchy) {
          currentGesture.viewHierarchy = event.viewHierarchy;
          var requestId = currentGesture.viewHierarchy.request_id;
          if (logcatMap[requestId]) {
            currentGesture.clickedElementId = logcatMap[requestId];
          }
        }
        if (event.eventName === 'input.gestureStop') {
          gestures.push(currentGesture);
          currentGesture = { 'events': [] };
        }
      });
      if (currentGesture.events.length) {
        gestures.push(currentGesture);
      }
      gestures.forEach(function(gesture) {
        gesture.inputs = getInputs(gesture, screenDimensions);
      });
      return gestures;
    }

    function isTapGesture(gesture) {
      return gesture.inputs.length === 1;
    }

    function isScrollGesture(gesture) {
      return gesture.inputs.length > 1;
    }

    function isTypeGesture(gesture) {
      return _.every(gesture.events, {eventName: 'input.type'});
    }

    function getTypedText(typeGesture) {
      var text = [];
      typeGesture.events.forEach(function(event) {
        text.push(event.text);
      });
      return text.join('');
    }

    function performTap(monkey, x, y) {
      return new Promise(function(resolve, reject) {
        monkey.tap(x, y, function(err) {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    }

    function performType(monkey, text) {
      return new Promise(function(resolve, reject) {
        monkey.type(text, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    function performSwipe(gesture, monkey) {
      var inputs = gesture.inputs;
      var touchDownX = inputs[0].coords[0];
      var touchDownY = inputs[0].coords[1];
      var command = monkey.multi().touchDown(touchDownX, touchDownY);
      inputs.slice(1, inputs.length-1).forEach(function(input) {
        command = command
          .sleep(input.delay)
          .touchMove(input.coords[0], input.coords[1]);
      });
      var touchUpX = inputs[inputs.length-1].coords[0];
      var touchUpY = inputs[inputs.length-1].coords[1];
      return new Promise(function(resolve, reject) {
        command.touchUp(touchUpX, touchUpY).execute(function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
    }

    function getViewHierarchy() {
      return (viewbridge.isRunning() ? Promise.resolve() : viewbridge.start())
        .then(function() {
          return viewbridge.tryToGetViewHierarchy('');
        })
        .then(function(viewHierarchyString) {
          return JSON.parse(viewHierarchyString);
        });
    }

    function checkForKeyboardDeployment() {
      return getViewHierarchy().then(function(hierarchy) {
        if (hierarchy.is_keyboard_deployed) {
          return Promise.resolve();
        } else {
          return Promise.reject();
        }
      });
    }

    function retry(operation, delay, times) {
      if (times === 0) {
        return Promise.reject();
      }
      return operation().catch(function() {
        return sleep(delay)
          .then(retry.bind(null, operation, delay, times-1));
      });
    }
 
    // Traverses nodes in a hierarchy until callback returns true.
    function findInHierarchy(root, elementId) {
      if (!root) {
        return null;
      }
      if (root['resource-id'] === elementId) {
        return root;
      }
      var children = root.children || [];
      for (var i = 0; i < children.length; i++) {
        var result = findInHierarchy(children[i], elementId);
        if (result) {
          return result;
        }
      }
      return null;
    };

    function currentViewMatches(viewHierarchy) {
      return Promise.all([viewhasher.getCurrentViewHash(),
        viewhasher.computeHash(viewHierarchy)]).spread(function(current, saved) {
          return (current === saved) ? Promise.resolve() : Promise.reject();
        });
    };

    function getTapCoords(gesture) {
      if (!gesture.viewHierarchy || !gesture.clickedElementId) {
        return Promise.resolve(gesture.inputs[0].coords);
      }

      return retry(function() {
        return getViewHierarchy().then(function(currentView) {
          if (gesture.viewHierarchy.activity_name !== currentView.activity_name) {
            return Promise.reject();
          }
          var root = currentView.activity.root;
          var node = findInHierarchy(root, gesture.clickedElementId);
          if (node) {
            var bounds = node.bounds;
            var centerX = Math.floor((bounds[0] + bounds[2]) / 2);
            var centerY = Math.floor((bounds[1] + bounds[3]) / 2);
            return Promise.resolve([centerX, centerY]);
          } else {
            return Promise.reject();
          }
        });
      }, 1000, 5).catch(function() {
        // Fall back to the saved coordinates.
        return Promise.resolve(gesture.inputs[0].coords);
      });
    }

    function waitForTypeGesture() {
      return retry(checkForKeyboardDeployment, 1000, 5);
    }

    function waitForScrollGesture(gesture) {
      return retry(function() {
        if (!gesture.viewHierarchy) {
          return Promise.resolve();
        }
        return currentViewMatches(gesture.viewHierarchy);
      }, 1000, 5);
    }

    function replayGestures(gestures, monkey) {
      var serial = options.serial;
      return Promise.each(gestures, function(gesture) {
        if (isTapGesture(gesture)) {
          return getTapCoords(gesture).then(function(coords) {
            return performTap(monkey, coords[0], coords[1]).then(sleep(3000));
          });
        } else if (isScrollGesture(gesture)) {
          return waitForScrollGesture(gesture).finally(function() {
            return performSwipe(gesture, monkey).then(sleep(1000));
          });
        } else if (isTypeGesture(gesture)) {
          return waitForTypeGesture().then(function() {
            return performType(monkey, getTypedText(gesture)).then(sleep(500));
          });
        }
      });
    }

    function checkForSuccess(viewHash) {
      return retry(function() {
        if (!viewHash) {
          return Promise.resolve();
        }
        return viewhasher.getCurrentViewHash().then(function(currentHash) {
          return (currentHash === viewHash) ? Promise.resolve() : Promise.reject('Final hash does not match');
        });
      }, 200, 50);
    }

    function replay(token) {
      return Promise.all([dbapi.getInputEvents(token),
        dbapi.getLogcatMessages(token),
        dbapi.getScreenDimensions(options.serial),
        dbapi.getToken(token),
        adb.openMonkey(options.serial)])
        .spread(function(events, logcats, screenDimensions, tokenObj, monkey) {
          var gestures = parseGestures(events, logcats, screenDimensions);
          return replayGestures(gestures, monkey).catch(function(err) {
            console.error(err);
          }).then(function() {
            return checkForSuccess(tokenObj.viewHash);
          }).finally(function() {
            // TODO: There could be issues with stopping/restarting STF if the
            // process dies before we can quit monkey.
            monkey.quit(function(err) {
              monkey.end();
            });
          });
        });
    }

    router.on(wire.ReplayMessage, function(channel, message) {
      var reply = wireutil.reply(options.serial);
      var token = message.token;

      replay(token).then(function() {
        push.send([
          channel
          , reply.okay('success')
        ]);
      }).catch(function() {
        push.send([
          channel, reply.fail('fail')
        ]);
      });
    });
  })
