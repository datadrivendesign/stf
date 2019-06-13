var cryptutil = require('../../../../../lib/util/cryptutil.js')

module.exports = function AccessTokenServiceFactory(
  $rootScope
, $http
, socket
) {
  var AccessTokenService = {}

  AccessTokenService.getAccessTokens = function() {
    return $http.get('/api/v1/user/accessTokens')
  }

  AccessTokenService.generateAccessToken = function(title) {
    socket.emit('user.keys.accessToken.generate', {
      title: title
    })
  }

  AccessTokenService.removeAccessToken = function(title) {
    socket.emit('user.keys.accessToken.remove', {
      title: title
    })
  }

  socket.on('user.keys.accessToken.generated', function(token) {
    var decryptedToken = cryptutil.decrypted(token)
    $rootScope.$broadcast('user.keys.accessTokens.generated', decryptedToken)
    $rootScope.$apply()
  })

  socket.on('user.keys.accessToken.removed', function() {
    $rootScope.$broadcast('user.keys.accessTokens.updated')
    $rootScope.$apply()
  })

  return AccessTokenService
}
