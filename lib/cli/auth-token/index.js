module.exports.command = 'auth-token'

// Start the service for token-based authentication.
// Hard coded values follow OpenSTF pattern.

module.exports.builder = function(yargs) {
  return yargs
    .strict()
    .option('port', {
      alias: 'p'
    , describe: 'port (or $PORT).'
    , type: 'number'
    , default: process.env.PORT || 7120
    })
    .option('secret', {
      alias: 's'
    , describe: 'secret (or $SECRET).'
    , type: 'string'
    , default: process.env.SECRET
    })
    .option('ssid', {
      alias: 'i'
    , describe: 'Session SSID (or $SSID).'
    , type: 'string'
    , default: process.env.SSID || 'ssid'
    })
    .option('app-url', {
      alias: 'a'
    , describe: 'URL to app.'
    , type: 'string'
    , demand: true
    })
    .option('use-basic-auth', {
      describe: 'Use basic authentication for login.'
    , type: 'boolean'
    })
    .option('basic-auth-username', {
      describe: 'Basic Auth Username (or $BASIC_AUTH_USERNAME).'
    , type: 'string'
    , default: process.env.BASIC_AUTH_USERNAME || 'username'
    })
    .option('basic-auth-password', {
      describe: 'Basic Auth Password (or $BASIC_AUTH_PASSWORD).'
    , type: 'string'
    , default: process.env.BASIC_AUTH_PASSWORD || 'password'
    })
}
module.exports.handler = function(argv) {
  return require('../../units/auth/token')({
    port: argv.port,
    secret: argv.secret,
    ssid: argv.ssid,
    appUrl: argv.appUrl,
    mock: {
      useBasicAuth: argv.useBasicAuth,
      basicAuth: {
        username: argv.basicAuthUsername,
        password: argv.basicAuthPassword
      }
    }
  })
}
