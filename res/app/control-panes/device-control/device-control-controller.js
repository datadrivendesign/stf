var _ = require('lodash')

module.exports = function DeviceControlCtrl($scope, DeviceService, GroupService,
  $location, $timeout, $window, $rootScope, TappSessionService, $http) {

  $scope.showScreen = true

  $scope.groupTracker = DeviceService.trackGroup($scope)

  $scope.groupDevices = $scope.groupTracker.devices

  $scope.kickDevice = function (device) {

    if (!device || !$scope.device) {
      alert('No device found')
      return
    }

    try {
      // If we're trying to kick current device
      if (device.serial === $scope.device.serial) {

        // If there is more than one device left
        if ($scope.groupDevices.length > 1) {

          // Control first free device first
          var firstFreeDevice = _.find($scope.groupDevices, function (dev) {
            return dev.serial !== $scope.device.serial
          })
          $scope.controlDevice(firstFreeDevice)

          // Then kick the old device
          GroupService.kick(device).then(function () {
            $scope.$digest()
          })
        } else {
          // Kick the device
          GroupService.kick(device).then(function () {
            $scope.$digest()
          })
          $location.path('/devices/')
        }
      } else {
        GroupService.kick(device).then(function () {
          $scope.$digest()
        })
      }
    } catch (e) {
      alert(e.message)
    }
  }

  $scope.controlDevice = function (device) {
    $location.path('/control/' + device.serial)
  }

  function isPortrait(value) {
    if (typeof value === 'undefined' && $scope.device) {
      value = $scope.device.display.rotation
    }
    return (value === 0 || value === 180)
  }

  function isLandscape(value) {
    if (typeof value === 'undefined' && $scope.device) {
      value = $scope.device.display.rotation
    }
    return (value === 90 || value === 270)
  }

  $scope.tryToRotate = function (rotation) {
    if (rotation === 'portrait') {
      $scope.control.rotate(0)
      $timeout(function () {
        if (isLandscape()) {
          $scope.currentRotation = 'landscape'
        }
      }, 400)
    } else if (rotation === 'landscape') {
      $scope.control.rotate(90)
      $timeout(function () {
        if (isPortrait()) {
          $scope.currentRotation = 'portrait'
        }
      }, 400)
    }
  }

  $scope.currentRotation = 'portrait'

  $scope.$watch('device.display.rotation', function (newValue) {
    if (isPortrait(newValue)) {
      $scope.currentRotation = 'portrait'
    } else if (isLandscape(newValue)) {
      $scope.currentRotation = 'landscape'
    }
  })

  // TODO: Refactor this inside control and server-side
  $scope.rotateLeft = function () {
    var angle = 0
    if ($scope.device && $scope.device.display) {
      angle = $scope.device.display.rotation
    }
    if (angle === 0) {
      angle = 270
    } else {
      angle -= 90
    }
    $scope.control.rotate(angle)

    if ($rootScope.standalone) {
      $window.resizeTo($window.outerHeight, $window.outerWidth)
    }
  }

  $scope.rotateRight = function () {
    var angle = 0
    if ($scope.device && $scope.device.display) {
      angle = $scope.device.display.rotation
    }
    if (angle === 270) {
      angle = 0
    } else {
      angle += 90
    }
    $scope.control.rotate(angle)

    if ($rootScope.standalone) {
      $window.resizeTo($window.outerHeight, $window.outerWidth)
    }
  }


  console.log('$scope!', $scope)

  // Tapp related session functions
  $scope.startExploring = function () {
    var url = window.location.protocol+'//'+window.location.hostname+'/phone/start-exploring';
    var data = {
      sessionId: TappSessionService.sessionId,
      serial: TappSessionService.serial
    };
    return $http.get(url, {params: data}).then(function () {
      $scope.waitingForDone = false;
    }, function () {
      alert('Sorry, something went wrong when starting the XML capture service :(  Please tell somebody!')
    });
  };

  function snapLog () {
    var url = window.location.protocol+'//'+window.location.hostname+'/phone/snap-xml';
    var data = {
      sessionId: TappSessionService.sessionId,
      serial: TappSessionService.serial
    };
    return $http.get(url, {params: data}).then(function (result) {
      console.log(result);
    })
  }

  // Whether or not to disable the done button.
  $scope.waitingForDone = true;

  // Perform an initial setup and XML capture.
  $scope.startExploring()
    .then(function () {
      TappSessionService.snapLog();
    })

  $scope.doneExploring = function () {
    var url = window.location.protocol+'//'+window.location.hostname+'/phone/done-exploring';
    var redirectUrl = window.location.protocol+'//'+window.location.hostname+'/explore';
    var data = {
      sessionId: TappSessionService.sessionId,
      serial: TappSessionService.serial
    };
    $scope.waitingForDone = true;
    $http.get(url, {params: data}).then(function () {
      alert('Done!');
      window.location = redirectUrl;
    }, function () {
      $scope.waitingForDone = false;
    });
  };

}
