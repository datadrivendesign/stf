var Promise = require('bluebird')

var cryptutil = require('../../../../../../lib/util/cryptutil.js')

module.exports = function GroupServiceFactory(
  socket
, TransactionService
, TransactionError
) {
  var groupService = {
  }

  groupService.invite = function(device) {
    if (!device.usable) {
      return Promise.reject(new Error('Device is not usable'))
    }

    var tx = TransactionService.create(device)
    socket.emit('group.invite', device.channel, tx.channel, cryptutil.encrypt({
      requirements: {
        serial: {
          value: device.serial
        , match: 'exact'
        }
      }
    }))
    return tx.promise
      .then(function(result) {
        return result.device
      })
      .catch(TransactionError, function() {
        throw new Error('Device refused to join the group')
      })
  }

  groupService.kick = function(device, force) {
    if (!force && !device.usable) {
      return Promise.reject(new Error('Device is not usable'))
    }

    var tx = TransactionService.create(device)
    socket.emit('logcat.stop', device.channel, tx.channel, cryptutil.encrypt({
      requirements: {
        serial: {
          value: device.serial,
          match: 'exact'
        }
      }
    }));
    socket.emit('group.kick', device.channel, tx.channel, cryptutil.encrypt({
      requirements: {
        serial: {
          value: device.serial
        , match: 'exact'
        }
      }
    }))
    return tx.promise
      .then(function(result) {
        return result.device
      })
      .catch(TransactionError, function() {
        throw new Error('Device refused to join the group')
      })
  }

  return groupService
}
