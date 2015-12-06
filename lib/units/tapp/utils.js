/**
 * Miscellaneous utilities.
 */
var path = require('path');
// var TAPP_DIR = '/Users/forrest/Documents/tapp';
var TAPP_DIR = '../../../../tapp';
var config = require(path.join(TAPP_DIR, 'webapp/config/config'));

module.exports = {
    pathExists: function (path) {
        try {
            fs.readdirSync(path);
            return true;
        } catch (e) {
            return false;
        }
    },

    TAPP_DIR: '../../../../tapp',
    config: config,
	OUTPUT_DIR: path.resolve(config['OUTPUT_DIR']['EXPLORE_RECORDING']),
	TAPP_PORT: config['PORT']['GENERALSERVER'] || 80
};
