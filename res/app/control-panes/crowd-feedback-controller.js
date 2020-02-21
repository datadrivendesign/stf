var MILLIS_PER_SEC = 1000
var SECS_PER_MIN = 60
var MILLIS_PER_MIN = SECS_PER_MIN * MILLIS_PER_SEC
const config = require('../../../config')

module.exports = function($scope, $sce, $interval, $timeout, CrowdFeedbackService, SequenceService) {
  var serial, tokenId
  var hashArr = window.location.hash.split('/')
  if (hashArr.length >= 3) {
    serial = hashArr[2]
  }
  $scope.loginInfo = window.stfConfig.loginInfo[serial] || {}
  $scope.contactEmail = window.stfConfig.contactEmail
  $scope.showSpinner = false
  // $scope.recordInput = false

  // $scope.toggleRecordInput = function() {
  //   $scope.recordInput = !$scope.recordInput
  //   $scope.control.toggleRecordInput()
  // }

  $scope.submitAnswer = function(taskAnswer) {
    if ($scope.submittingAnswer) {
      return
    }
    $scope.submittingAnswer = true
    $scope.control.recordLastVH(SequenceService.next(), SequenceService.next())
    $timeout(function() {
      var ans = { taskAnswer }
      CrowdFeedbackService.submitTaskAnswer(tokenId, ans)
      $scope.exitSession()
      },
      config.viewHierarchyTimeout
    )
  }

  $scope.exitSession = function() {
    $scope.showSpinner = true
    if (serial) {
      CrowdFeedbackService.expireSerial(serial)
    } else {
      console.error('Missing serial for expiration.')
    }
  }

  CrowdFeedbackService.fetchTokenMetaData().then(function success(response) {
    var token = response.data
    if (!token) {
      console.error('Failed to load token metadata.')
      return
    }
    tokenId = token.token
    $scope.appId = token.appId
    $scope.isDesignerToken = token.isDesignerToken
    $scope.appTask = 'Test'
    $scope.hasTask = false

    if (token.task) {
      $scope.hasTask = true
      $scope.taskDesc = token.task.description
      $scope.descIsQuestion = token.task.descriptionIsQuestion
      $scope.submissionInstructionalText =
        $scope.descIsQuestion ?
          'Please enter your answer below and click Submit:' :
          'Please click Submit when you are finished.'
    }

    var expireMinutes = token.expireMinutes
    var activeTimeStart = token.activeTimeStart
    var endTS = token.activeTimeStart + token.expireMinutes * MILLIS_PER_MIN
    if (activeTimeStart) {
      // Continuously update minutes and seconds until token expires.
      $interval(function() {
        var nowTS = Date.now()
        var diffSecs = Math.floor((endTS - nowTS) / MILLIS_PER_SEC)
        $scope.seconds = diffSecs % SECS_PER_MIN
        $scope.minutes = (diffSecs - $scope.seconds) / SECS_PER_MIN
        if ($scope.seconds < 0) {
          $scope.seconds = 0
        }
        if ($scope.minutes < 0) {
          $scope.minutes = 0
        }
      }.bind(this), MILLIS_PER_SEC)
    }
  }, function err(err) {
    console.error('Error fetching tokens', err)
  })
}
