var _ = require('lodash')

module.exports = function DeviceControlCtrl($scope, DeviceService, GroupService,
  $location, $timeout, $window, $rootScope, TappSessionService, $http) {
  $scope.showScreen = true
  $rootScope.menuShow = false;
  $scope.groupTracker = DeviceService.trackGroup($scope)
  $scope.signupClicked = false;
  $scope.loginClicked = false;
  $scope.hideModal = false;

  $scope.groupDevices = $scope.groupTracker.devices


  var PHONE_DICT= {
        "ZX1G22JQ5X" : "1",
        "ZX1G22JPNS" : "2",
        "ZX1G228FCS" : "3",
        "ZX1G22NBLH" : "4",
        "ZX1G22NPV9" : "5",
        "ZX1G22NC5F" : "6"
  };

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

  $scope.currentRotation = 'portrait';
 
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

  $scope.fullScreen = function() {  
    console.log("Tried");
    document.documentElement.webkitRequestFullscreen();
    $scope.hideOverlay = true;
  }

  // Tapp related session functions
  $scope.startExploring = function () {
    var ip = window.location.hostname;
    ip = '127.0.0.1:5000'; // Forrest
    ip = window.location.host;
    if (ip.indexOf(":") != -1) {
      ip = ip.split(":")[0] + ":5000";
    }
    var url = window.location.protocol+'//'+ ip +'/phone/start-exploring';
    console.log(url)
    var data = {
      sessionId: TappSessionService.sessionId,
      serial: TappSessionService.serial
    };
    return $http.get(url, {params: data}).then(function () {
      $scope.waitingForDone = false;
    }, function (res) {
      alert('Sorry, something went wrong when starting the XML capture service :(  Please tell somebody!' + res.data)
    });
    convertPhoneName(TappSessionService.serial);
  };

  function snapLog () {
    var ip = window.location.hostname;
    ip = '127.0.0.1:5000'; // Forrest
    ip = window.location.host;
    if (ip.indexOf(":") != -1) {
      ip = ip.split(":")[0] + ":5000";
    }
    var url = window.location.protocol+'//'+ ip +'/phone/snap-xml';
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
    // .then(function () { TappSessionService.snapLog() })

  $scope.showBlockingBar = function () {
    return !!TappSessionService.sessionId;
  }

//'/cleaning-discard'
  $scope.discardSession = function(){
    $scope.waitingForDone = true;

    // Try to take a final XML, then submit the session.
    TappSessionService.snapLog()
    .then(discardSessionHelper, discardSessionHelper);
  };

  function discardSessionHelper (){
    var ip = window.location.hostname;
    ip = '127.0.0.1:5000'; // Forrest
    ip = window.location.host;
    if (ip.indexOf(":") != -1) {
      ip = ip.split(":")[0] + ":5000";
    }
    var url = window.location.protocol+'//'+ ip +'/phone/snap-xml';
      console.log("Sent Image was: " + TappSessionService.imgCount);
    var data = {
      sessionId: TappSessionService.sessionId,
      imgCount: TappSessionService.imgCount,
      serial: TappSessionService.serial
    };
    $http.get(url, {params: data}).then(function (result) {
      console.log(result);
    });
   
   // var ip = window.location.hostname;
    //ip = '127.0.0.1:5000'; // Forrest
    var url = window.location.protocol+'//' + ip + '/phone/discard-exploring';
    var redirectUrl = window.location.protocol+'//'+ ip +'/exact-app';
    var data = {
      sessionId: TappSessionService.sessionId,
      serial: TappSessionService.serial,
      isBadApp: $scope.isBadApp,
      isGreatApp : $scope.isGreatApp,
      isExpertUser: $scope.isExpertUser,
      loginImgCount : loginPageImgCount,
      signupImgCount : signupPageImgCount,
      searchImgCount : searchPageImgCount
    };
    $http.get(url, {params: data}).then(function () {
      alert('Done!');
      window.location = redirectUrl;
    }, function () {
      $scope.waitingForDone = false;
    });
  }
  $scope.doneExploring = function () {
    $scope.waitingForDone = true;

    // Try to take a final XML, then submit the session.
    TappSessionService.snapLog()
    .then(submitSession, submitSession);
  };
  //TODO(Stefanus): have a way to remember where the button was clicked, save it in some kind of seesion pass in 
  //would also be a good idea
  function submitSession () {
    var ip = window.location.hostname;
    ip = '127.0.0.1:5000'; // Forrest
    ip = window.location.host;
    if (ip.indexOf(":") != -1) {
      ip = ip.split(":")[0] + ":5000";
    }
    var url = window.location.protocol+'//'+ ip +'/phone/snap-xml';
   
    console.log("Sent Image was: " + TappSessionService.imgCount);
    var data = {
      sessionId: TappSessionService.sessionId,
      imgCount: TappSessionService.imgCount,
      serial: TappSessionService.serial
    };
    $http.get(url, {params: data}).then(function (result) {
      console.log(result);
    });
    var ip = window.location.host;
    if (ip.indexOf(":") != -1) {
      ip = ip.split(":")[0] + ":5000";
    }
   // ip = '127.0.0.1:5000'; // Forrest
   
    var url = window.location.protocol+'//'+ ip +'/phone/done-exploring';
    var redirectUrl = window.location.protocol+'//'+ ip +'/exact-app';
    var data = {
      sessionId: TappSessionService.sessionId,
      serial: TappSessionService.serial,
      isBadApp: $scope.isBadApp,
      isGreatApp : $scope.isGreatApp,
      isExpertUser: $scope.isExpertUser,
      loginImgCount : loginPageImgCount,
      signupImgCount : signupPageImgCount,
      searchImgCount : searchPageImgCount
    };
    $http.get(url, {params: data}).then(function () {
      alert('Done!');
      window.location = redirectUrl;
    }, function () {
      $scope.waitingForDone = false;
    });
  }
  $scope.phoneName ="Phone ";

  $scope.loginPageFoundHandler = function(){
    $scope.loginClicked = true;
      loginPageImgCount = TappSessionService.imgCount;
      console.log("image count: "+ loginPageImgCount);
      alert('Page login is logged');
  }
   $scope.signupPageFoundHandler = function(){
    $scope.signupClicked = true;
      signupPageImgCount = TappSessionService.imgCount;
      console.log("image count: "+ signupPageImgCount);
      alert('Signup Page is logged');
  }
  $scope.searchPageFoundHandler = function(){

      searchPageImgCount.push(TappSessionService.imgCount);
      console.log(searchPageImgCount);
      alert('Search Page is logged');
  }

  var convertPhoneName= function(serial){
      console.log('Serial '+serial);
      if(!serial)
          return "Null serial"
      $scope.phoneName+= PHONE_DICT[serial];
  }
  convertPhoneName(TappSessionService.serial);
  var loginPageImgCount = null;
  var signupPageImgCount = null;
  var searchPageImgCount = [];

  $scope.done = function(){
    if(!$scope.discard)
      $scope.doneExploring();
    else
      $scope.discardSession();
  }
  var h2 = document.getElementsByTagName('p')[0],
    start = document.getElementById('start'),
    stop = document.getElementById('stop'),
    clear = document.getElementById('clear'),
    seconds = 0, minutes = 0, hours = 0,
    t;

function add() {
    seconds++;
    if (seconds >= 60) {
        seconds = 0;
        minutes++;
        if (minutes >= 60) {
            minutes = 0;
            hours++;
        }
    }
    
    h2.textContent = (hours ? (hours > 9 ? hours : "0" + hours) : "00") + ":" + (minutes ? (minutes > 9 ? minutes : "0" + minutes) : "00") + ":" + (seconds > 9 ? seconds : "0" + seconds);

    timer();
}
function timer() {
    t = setTimeout(add, 1000);
}
timer();

}
