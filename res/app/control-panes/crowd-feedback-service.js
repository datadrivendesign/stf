module.exports = function CrowdFeedbackService($http) {
  var service = {}
  var metaDataPromise = null

  service.fetchTokenMetaData = function() {
    if (!metaDataPromise) {
      metaDataPromise = $http.get('/app/api/v1/token/~')
    }
    return metaDataPromise
  }

  service.expireSerial = function(serial) {
    if (!serial) {
      return
    }
    return $http.delete('/app/api/v1/token?serial=' + serial)
  }

  service.submitTaskAnswer = function(token, taskAnswer) {
    return $http.post('/app/api/v1/noauth/responses/' + token, taskAnswer)
  }

  return service
}
