/**
 * This module exposes functions that intercept data produced by OpenSTF.  It 
 * allows us to record data for later purposes.
 */
var fs = require('fs');
var path = require('path');

// var TAPP_DIR = '/Users/forrest/Documents/tapp';
var TAPP_DIR = '../../../../tapp';
var pathExists = require('./utils').pathExists;
var config = require(path.join(TAPP_DIR, 'webapp/config/config'));
var OUTPUT_DIR = path.resolve(config['OUTPUT_DIR']['EXPLORE_RECORDING']);


// // Validate the path to the recording output directory.
// if (!pathExists(OUTPUT_DIR)) {
// 	console.error('Could not find output directory', OUTPUT_DIR);
// 	process.exit();
// } else {
// 	console.log('Using exploration output directory', OUTPUT_DIR);
// }


// Initialize our interceptors with our configuration options.
var options = {
	dir: OUTPUT_DIR
};

var frameInterceptor = require('./frame-interceptor')(options);
var uiDataInterceptor = require('./ui-data-interceptor')(options);

module.exports = {
	receiveFrame: frameInterceptor.receiveFrame,
	receiveEvent: uiDataInterceptor.receiveEvent
}
