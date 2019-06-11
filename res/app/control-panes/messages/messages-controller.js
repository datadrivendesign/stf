var _ = require('lodash');

module.exports = function MessagesCtrl(
  $scope,
  $http
) {
    $scope.emails = [];
    $scope.smsMessages = [];
    $scope.error = false;
    $scope.fetching = false;

    var isSms = function(email) {
      return email.from[0].address.indexOf('@txt.voice.google.com') !== -1;
    };

    $scope.refresh = function() {
      $scope.error = false;
      $scope.fetching = true;
      $http.get('/app/api/v1/messages/~')
        .then(function success(response) {
          var allMail = response.data.emails;
          var emails = allMail.filter(_.negate(isSms));

          if (emails.length > $scope.emails.length) {
            $scope.emails = emails;
          }

          // var smsMessages = response.data.smsMessages;
          var smsMessages = allMail.filter(isSms);
          if (smsMessages.length > $scope.smsMessages.length) {
            $scope.smsMessages = smsMessages;
          }
          $scope.fetching = false;
        }, function error() {
          $scope.fetching = false;
          $scope.error = true;
        });
    };
    $scope.refresh();

  $scope.countUnreadEmails = function() {
    return _.filter($scope.emails, function(email) {
      return !email.read;
    }).length;
  };
  $scope.countUnreadSms = function() {
    return _.filter($scope.smsMessages, function(sms) {
      return !sms.read;
    }).length;
  };

    // Refreshes once every 20s.
    setInterval($scope.refresh, 20000);
};
