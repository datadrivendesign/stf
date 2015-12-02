module.exports = angular.module('stf/tapp', [
  require('stf/app-state').name
])
  .factory('TappSessionService', require('./tapp-session-service'))
