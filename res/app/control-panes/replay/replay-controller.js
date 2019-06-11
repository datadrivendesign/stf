module.exports = function ReplayController($scope, $http, CrowdFeedbackService) {
  CrowdFeedbackService.fetchTokenMetaData().then(function success(response) {
    var token = response.data.token;
    $scope.replayState = 'RECORDING';

    $scope.setStartPoint = function() {
      $scope.control.toggleInput(false);
      $scope.replayState = 'INSTALLING';
      $scope.control.reinstallApp().then(function() {
        $scope.replayState = 'REPLAYING';
        return $scope.control.replay(token);
      }).then(function() {
        $scope.replayState = 'FINISHED';
      }).catch(function() {
        console.log('Error');
      });
    }

    $scope.saveReplay = function() {
      return $http.post('/app/api/v1/replay/~').then(function() {
        $scope.replayState = 'SAVED';
      });
    }

    $scope.restart = function() {
      $scope.control.toggleInput(false);
      $http.delete('/app/api/v1/events/~').then(function() {
        $scope.replayState = 'INSTALLING';
        return $scope.control.reinstallApp();
      }).then(function() {
        if (response.data.replay) {
          $scope.replayState = 'REPLAYING';
          return $scope.control.replay(response.data.replay);
        } else {
          return true;
        }
      }).then(function() {
        $scope.control.toggleInput(true);
        $scope.replayState = 'RECORDING';
      });
    }
  });
};
