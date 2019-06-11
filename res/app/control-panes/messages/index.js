require('./email.css');
require('angular-sanitize');
require('ui-bootstrap');

module.exports = angular.module('stf.email', [
	'ngSanitize',
	'ui.bootstrap'
])
  .run(['$templateCache', function($templateCache) {
      $templateCache.put('control-panes/messages/email.pug', require('./email.pug'));
      $templateCache.put('control-panes/messages/sms.pug', require('./sms.pug'));
  }])
  .controller('MessagesCtrl', require('./messages-controller'));
