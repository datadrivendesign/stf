/**
 * This module exposes functions that intercept data produced by OpenSTF.  It 
 * allows us to record data for later purposes.
 */
var fs = require('fs');
var path = require('path');

var pathExists = require('./utils').pathExists;
var utils = require('./utils');

// // Validate the path to the recording output directory.
// if (!pathExists(OUTPUT_DIR)) {
// 	console.error('Could not find output directory', OUTPUT_DIR);
// 	process.exit();
// } else {
// 	console.log('Using exploration output directory', OUTPUT_DIR);
// }


// // Initialize our interceptors with our configuration options.
// var frameInterceptor = require('./frame-interceptor');

// // UI data intercepts need to know which frame we are at.
// var uiDataInterceptor = require('./ui-data-interceptor');

// // var dataInterceptor = require('./data-interceptor');


// module.exports = {
// 	receiveFrame: frameInterceptor.receiveFrame,
// 	receiveEvent: uiDataInterceptor.receiveEvent,
// 	getImgCount: frameInterceptor.getImgCount,
	
// 	// receiveFrame: dataInterceptor.receiveFrame,
// 	// receiveEvent: dataInterceptor.receiveEvent,
// 	// getImgCount: dataInterceptor.getImgCount,
// }

// var syrup = require('stf-syrup')

// module.exports = syrup.serial()
//   .define(function(options) {
//     var plugin = Object.create(null)

//     plugin.receiveFrame = dataInterceptor.receiveFrame
// 	plugin.receiveEvent = dataInterceptor.receiveEvent
// 	plugin.getImgCount = dataInterceptor.getImgCount
// 	plugin.TAPP_PORT = utils.TAPP_PORT
//     return plugin
//   })

