var Cryptr = require('cryptr')
var cryptr = new Cryptr(process.env.WEBSOCKET_SECRET)

var cryptutil = module.exports = Object.create(null)

cryptutil.encrypt = function(input) {
    if (typeof input === "string") {
        return cryptr.encrypt(input)
    } else if (typeof input === "object") {
        return cryptr.encrypt(JSON.stringify(input))
    } else {
        return input
    }
}

cryptutil.decrypt = function(input) {
    const decrypted = cryptr.decrypt(input)
    try {
        return JSON.parse(decrypted)
    } catch (e) {
        return decrypted
    }
}
