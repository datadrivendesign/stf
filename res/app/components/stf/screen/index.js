require('./screen.css')

module.exports = angular.module('stf/screen', [
  require('stf/screen/scaling').name
, require('stf/util/vendor').name
, require('stf/page-visibility').name
, require('stf/browser-info').name
, require('stf/common-ui/nothing-to-show').name
, require('stf/screen/sequence').name
])
  .directive('deviceScreen', require('./screen-directive'))
  .controller('DeviceScreenCtrl', require('./screen-controller'))
