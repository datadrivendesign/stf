module.exports = function DeviceScreenCtrl(
  $scope
, $rootScope
, ScalingService
, InstallService
, SequenceService
) {
  $scope.displayError = false
  $scope.ScalingService = ScalingService

  $scope.displayText = "Re-Launch App";

  $scope.installFile = function($files) {
    return InstallService.installFile($scope.control, $files)
  };

    $scope.$watch(
    function(scope) {
      var elem = document.getElementById("testing");
      var rect = elem.getBoundingClientRect();
      return {height: elem.scrollHeight,
              width: elem.scrollWidth,
              top: rect.top,
              left: rect.left,
              };
    },
    function(newValue, oldValue) {
      var elem = document.getElementById("back-to-app-btn")
      elem.style.position = "fixed";
      if (newValue.height > newValue.width){
        elem.style.left = (0.45 * newValue.width + newValue.left + 1) + 'px';
        elem.style.top = (0.935 * newValue.height + newValue.top) + 'px';
        elem.style.width = (0.55 * newValue.width) + 'px';
        elem.style.height = (0.065 * newValue.height)  + 'px';
        elem.classList.remove("rotate");
      }else{
        elem.style.height = (0.065 * newValue.width) + 'px';
        elem.style.width = (0.55 * newValue.height)  + 'px';
        elem.style.top = (newValue.top) + 'px';
        elem.style.left = (newValue.width + newValue.left - 0.55 * newValue.height - 0.065 * newValue.width) + 'px';
        elem.classList.add("rotate");
      }
    }, true
    )

    $scope.goBack = function(event){
      if ($scope.control) {
        $scope.control.returnToApp();
        $scope.control.gestureStart(SequenceService.next());
        $scope.control.gestureStop(SequenceService.next());
      }
      event.preventDefault();
      event.stopPropagation();
    };
}
