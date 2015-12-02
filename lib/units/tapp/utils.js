/**
 * Miscellaneous utilities.
 */

module.exports = {
    pathExists: function (path) {
        try {
            fs.readdirSync(path);
            return true;
        } catch (e) {
            return false;
        }
    }
};
