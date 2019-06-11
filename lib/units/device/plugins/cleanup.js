var fs = require('fs')
var mkdirp = require('mkdirp');
var syrup = require('stf-syrup')
var Promise = require('bluebird')
var path = require('path');
var _ = require('lodash')

var logger = require('../../../util/logger');
var config = require('../../../../config');
var tokenListener = require('../../../util/tokenListener');

var UPWORK_POST_PROCESSING_DIR = '../api/turk_dump/';
var TURK_POST_PROCESSING_DIR = '../api/turk_task/';

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../resources/service'))
  .dependency(require('./group'))
  .define(function(options, adb, service, group) {
    var log = logger.createLogger('device:plugins:cleanup')
    var plugin = Object.create(null)

    // Copies contents of deviceDirectory on a device to outputDirectory
    function pullFolder(deviceDirectory, outputDirectory) {
      mkdirp.sync(outputDirectory);
      return adb.readdir(options.serial, deviceDirectory)
        .then(function(files) {
          return Promise.map(files, function(file) {
            if (file.isFile()) {
              return adb.pull(options.serial,
                path.join(deviceDirectory, file.name))
                .then(function(pullStream) {
                  var writeStream =
                    fs.createWriteStream(path.join(outputDirectory, file.name));
                  return new Promise(function(resolve, reject) {
                    pullStream.on('error', reject);
                    pullStream.on('end', resolve);
                    pullStream.pipe(writeStream);
                  });
                });
            }
            // Recurse on the directory
            return pullFolder(path.join(deviceDirectory, file.name),
              path.join(outputDirectory, file.name));
          });
        });
    }

    if (!options.cleanup) {
      return plugin
    }

    function listPackages() {
      return adb.getPackages(options.serial)
    }

    function uninstallPackage(tokenObj) {
      var pkg = tokenObj.androidId || tokenObj.appId;
      log.info('Cleaning up package "%s"', pkg)

      // Create the directories which will hold the copied app data.
      var appId = tokenObj.appId;
      var token = tokenObj.token;
      var appDir;
      if (tokenObj.crowdService === 'upwork') {
        appDir = path.join(UPWORK_POST_PROCESSING_DIR, appId + '_' + token);
      } else if (tokenObj.crowdService === 'mturk') {
        appDir = path.join(TURK_POST_PROCESSING_DIR,
          tokenObj.androidId + '_' + appId, token);
      }
      var dataDir = path.join(appDir, 'data');
      var sdCardDir = path.join(appDir, 'sdcard');
      return (tokenObj.isReplayToken ? Promise.resolve() : Promise.all([
        pullFolder('/data/data/'+pkg, dataDir),
        pullFolder('/sdcard/android/data/'+pkg, sdCardDir)
      ])).catch(function(err) {
        log.warn('Unable to backup package "%s"', pkg, err);
        return true;
      }).then(function() {
        return adb.uninstall(options.serial, pkg)
          .catch(function(err) {
            log.warn('Unable to clean up package "%s"', pkg, err)
            return true
          })
      });
    }

    tokenListener.on('expired', function(tokenObj) {
      if (tokenObj.serial === options.serial) {
        uninstallPackage(tokenObj);
      }
    });

    return plugin;
  })
