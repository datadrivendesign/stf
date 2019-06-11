var Promise = require('bluebird')
var request = require('request-promise')
var base64url = require('base64url')
var Gmail = require('node-gmail-api')
var MailParser = require('mailparser').MailParser
var streamToPromise = require('stream-to-promise')

var config = require('../../config')

var emailutil = module.exports = Object.create(null)

/**
 * Returns an OAuth access token for the Gmail account associated
 * with a serial, or an error msg.
 */
var getAccessToken = function(serial) {
  const loginInfo = config.loginInfo
  const account = loginInfo && loginInfo[serial] && loginInfo[serial].gmail
  const clientId = process.env.GMAIL_ID
  const clientSecret = process.env.GMAIL_SECRET
  const refreshToken = loginInfo[serial].gmail.refresh_token

  if (!account) {
    return Promise.reject('No mail account found for serial: ' + serial)
  }

  // Sends an auth request for a new access token.
  return request.post({
    url: 'https://accounts.google.com/o/oauth2/token'
    , form: {
      client_id: clientId
      , client_secret: clientSecret
      , refresh_token: refreshToken
      , grant_type: 'refresh_token'
    }
  }).then(function(body) {
    return JSON.parse(body).access_token
  }).catch(function() {
    return Promise.reject('Unable to authenticate email for serial: ' + serial + ': ' +
      refreshToken + ': ' + clientSecret + ': ' + clientId)
  })
}

/**
 * Returns a promise that resolves with an array of emails, or an error msg.
 * @param serial - The device serial to fetch mail for. Should match to an
 * entry in config.json.
 */
emailutil.getEmail = function(serial) {
  var toParse = []
  // Since Gmail has generous API limits, gets a new access token every time
  // for simplicity.
  return getAccessToken(serial).then(function(token) {
    var gmail = new Gmail(token)

      // Streams emails one at a time.
    var mailStream =
      gmail.messages('label:inbox', {format: 'raw', max: 20})
    mailStream.on('data', function(data) {
      // Sends email to be parsed asynchronously.
      toParse.push(new Promise(function(resolve, reject) {
        var mailparser = new MailParser()
        mailparser.write(base64url.decode(data.raw))
        mailparser.on('end', function(email) {
          resolve(email)
        })
          .end()
      }))
    })
    // Waits for all email to be streamed.
    return streamToPromise(mailStream)
  }).then(function() {
    // Waits for all email to be parsed.
    return Promise.all(toParse)
  })
}

