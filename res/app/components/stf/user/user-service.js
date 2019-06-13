var cryptutil = require('../../../../../lib/util/cryptutil.js')

module.exports = function UserServiceFactory(
  $rootScope
, socket
, AppState
, AddAdbKeyModalService
) {
  var UserService = {}

  var user = UserService.currentUser = AppState.user

  UserService.getAdbKeys = function() {
    return (user.adbKeys || (user.adbKeys = []))
  }

  UserService.addAdbKey = function(key) {
    socket.emit('user.keys.adb.add', key)
  }

  UserService.acceptAdbKey = function(key) {
    socket.emit('user.keys.adb.accept', key)
  }

  UserService.removeAdbKey = function(key) {
    socket.emit('user.keys.adb.remove', key)
  }

  socket.on('user.keys.adb.error', function(error) {
    var decrypted = cryptutil.decrypt(error)
    $rootScope.$broadcast('user.keys.adb.error', decrypted)
  })

  socket.on('user.keys.adb.added', function(key) {
    var decrypted = cryptutil.decrypt(key)
    UserService.getAdbKeys().push(decrypted)
    $rootScope.$broadcast('user.keys.adb.updated', user.adbKeys)
    $rootScope.$apply()
  })

  socket.on('user.keys.adb.removed', function(key) {
    var decrypted = cryptutil.decrypt(key)
    user.adbKeys = UserService.getAdbKeys().filter(function(someKey) {
      return someKey.fingerprint !== decrypted.fingerprint
    })
    $rootScope.$broadcast('user.keys.adb.updated', user.adbKeys)
    $rootScope.$apply()
  })

  socket.on('user.keys.adb.confirm', function(data) {
    var decrypted = cryptutil.decrypt(data)
    AddAdbKeyModalService.open(decrypted).then(function(result) {
      if (result) {
        UserService.acceptAdbKey(decrypted)
      }
    })
  })

  return UserService
}
