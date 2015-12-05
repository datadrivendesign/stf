module.exports = function SignInCtrl($scope, $http, $routeParams) {

  $scope.error = null
  console.log($scope, 's')
  console.log($routeParams, 'rp')
  console.log($http, 'http')

  $scope.submit = function () {
    var data = {
      name: $scope.signin.username.$modelValue
      , email: $scope.signin.email.$modelValue
    }
    $scope.invalid = false
    $http.post('/auth/api/v1/mock', data)
      .success(function (response) {
        $scope.error = null

        // ERIK: When the user is not authed, we will still have the redirect
        // stored on the url's hash.  If it exists, use this redirect instead
        // of the url OpenStf provides.
        var redirectOverride = decodeURIComponent(window.location.hash);
        if (redirectOverride) {
          location.replace(redirectOverride);
        } else {
          location.replace(response.redirect)
        }
      })
      .error(function (response) {
        switch (response.error) {
          case 'ValidationError':
            $scope.error = {
              $invalid: true
            }
            break
          case 'InvalidCredentialsError':
            $scope.error = {
              $incorrect: true
            }
            break
          default:
            $scope.error = {
              $server: true
            }
            break
        }
      })
  }
}
