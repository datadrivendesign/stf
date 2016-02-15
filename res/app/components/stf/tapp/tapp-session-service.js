module.exports = function TappSessionServiceFactory(
  $rootScope
, socket
, AppState
, $http
) {
	var countMap;
	if (window.localStorage) {
		try {
			countMap = JSON.parse(localStorage('imgCounts') || '{}');
		} catch (e) {

		}
	}

  var service = {
  	serial		: null,
    sessionId	: null,
    imgCount	: 1,
    loadSession	: function (sessionId) {
    	// body...
    },
    countMap	: countMap,
    snapLog   : function () {
      var url = window.location.protocol+'//'+window.location.hostname+'/phone/snap-xml';
      var data = {
        sessionId: service.sessionId,
        serial: service.serial,
        imgCount: service.imgCount
      };
      return $http.get(url, {params: data})
    }
  }

  return service;
}
