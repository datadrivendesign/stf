const util = require('util')
const Promise = require('bluebird');
const wireutil = require('../wire/util')
const logger = require('../util/logger')
const log = logger.createLogger('db:setup')
const models = require('./models')
const dbapi = Object.create(null)

const MIN_TOKEN_LEN = 20;

models.Kick.watch([], { fullDocument: 'updateLookup' }).on('change', (changeEvent) => {
  if (dbapi.kickCallback) {
    dbapi.kickCallback(changeEvent.fullDocument)
  }
})

dbapi.setKickCallback = function (callback) {
  dbapi.kickCallback = callback
}

dbapi.DuplicateSecondaryIndexError = function DuplicateSecondaryIndexError() {
  Error.call(this)
  this.name = 'DuplicateSecondaryIndexError'
  Error.captureStackTrace(this, DuplicateSecondaryIndexError)
}

util.inherits(dbapi.DuplicateSecondaryIndexError, Error)

dbapi.close = function (options) {
  return db.close(options)
}

dbapi.saveUserAfterLogin = function (user) {
  const now = new Date()
  const query = {
    email: user.email
  };
  const toInsert = {
    email: user.email,
    name: user.name,
    ip: user.ip,
    group: wireutil.makePrivateChannel(),
    lastLoggedInAt: now,
    createdAt: now,
    forwards: [],
    settings: {}
  }
  return models.User.findOneAndUpdate(query, toInsert, {
    upsert: true
  }).exec()
}

dbapi.loadUser = function (email) {
  return models.User.findOne({
    email
  }).exec()
}

dbapi.deleteUser = function (email) {
  return models.User.deleteOne({
    email
  }).exec()
}

dbapi.updateUserSettings = function (email, settings) {
  return models.User.findOneAndUpdate({
    email
  }, {
    settings
  }).exec()
}

dbapi.resetUserSettings = function (email) {
  return models.User.findOneAndUpdate({
    email
  }, {
    settings: {}
  }).exec()
}

dbapi.insertUserAdbKey = function (email, key) {
  return models.User.findOneAndUpdate({
    email
  }, {
    $push: {
      'adbKeys': {
        title: key.title,
        fingerprint: key.fingerprint
      }
    }
  }).exec()
}

dbapi.deleteUserAdbKey = function (email, fingerprint) {
  return models.User.findOneAndUpdate({
    email
  }, {
    $pull: {
      adbKeys: {
        fingerprint
      }
    }
  }).exec()
}

//TODO: this used to use an index, but this collection is small
dbapi.lookupUsersByAdbKey = function (fingerprint) {
  return models.User.find({
    adbKeys: {
      $elemMatch: {
        fingerprint
      }
    }
  }).exec()
}

dbapi.lookupUserByAdbFingerprint = function (fingerprint) {
  return models.User.find({
    adbKeys: {
      $elemMatch: {
        fingerprint
      }
    }
  }, {
    email: true,
    name: true,
    group: true
  }).exec().then(function (groups) {
    switch (groups.length) {
      case 1:
      return groups[0]
      case 0:
      return null
      default:
      throw new Error('Found multiple users for same ADB fingerprint')
    }
  })
}

// skipped because I was a little confused by this query
// and not even sure if this table is used
dbapi.lookupUserByVncAuthResponse = function (response, serial) {
  throw new Error('Not yet implemented')
}

dbapi.loadGroup = function (email) {
  return models.Device.find({
    email
  }).exec()
}

// Note: The rethink version used 'soft' durability meaning that writes
// are acknowledged immediately after being stored in memory
dbapi.saveDeviceLog = function (serial, entry) {
  return models.Log.create({
    serial: entry.serial,
    timestamp: new Date(entry.timestamp),
    priority: entry.priority,
    tag: entry.tag,
    pid: entry.pid,
    message: entry.message
  })
}

/**
* Persists android device events
* @example
*   dbapi.saveDeviceEvent(eventObj)
*   .then(function(result) {
*     console.log("Saved", result.inserted, "device events");
*   })
*   .catch(function(err){
*     throw err;
*   })
* @returns {Promise} Returns a promise with result
*/
dbapi.saveDeviceEvent = function (deviceEvent) {
  return models.DeviceEvent.create(deviceEvent)
}

// Note: the rethink version returned a val but it was never used in the resulting then()
dbapi.saveDeviceInitialState = function (serial, device) {
  const data = {
    present: false,
    presenceChangedAt: new Date(),
    provider: device.provider,
    owner: null,
    status: device.status,
    statusChangedAt: new Date(),
    ready: false,
    reverseForwards: []
  }
  return models.Device.findOne({
    serial
  }).exec().then(result => {
    if (result) {
      return models.Device.findOneAndUpdate({
        serial
      }, data).exec()
    } else {
      data.serial = serial
      data.createdAt = new Date()
      return models.Device.create(data)
    }
  })
}

dbapi.saveDeviceStatus = function (serial, status) {
  return models.Device.findOneAndUpdate({
    serial
  }, {
    status,
    statusChangedAt: new Date()
  }).exec()
}

// nothing is done with the return of this func, so fine that it doesn't
// always return a promise
dbapi.saveLogcat = function (serial, date, logcatMessage) {
  return models.Device.findOne({
    serial
  }).exec().then(device => {
    if (device && device.owner && device.owner.email) {
      var token = device.owner.email;
      if (token && token.length > MIN_TOKEN_LEN) {
        return models.TokenLogcat.create({
          token: token,
          logcatMessage: logcatMessage,
          logcatDate: date,
          timestamp: new Date()
        })
      }
    }
  })
}

dbapi.getDeviceBySerial = function (serial) {
  return models.Device.findOne({ serial }).exec()
}

dbapi.setDeviceOwner = function (serial, owner) {
  return models.Device.findOneAndUpdate(
    { serial },
    { owner }
  ).exec()
}

dbapi.unsetDeviceOwner = function (serial) {
  return models.Device.findOneAndUpdate(
    { serial },
    { owner: {} }
  ).exec()
}

dbapi.publishKickedToken = function (tokenObj) {
  // Need to delete mongo metadata to avoid issues
  // TODO: investigate whether we really need this Kick model (answer: no, q: how much work?)
  var clone = Object.assign({}, tokenObj._doc, {_id: undefined, __v: undefined })
  delete clone._id
  delete clone.__v
  return models.Kick.create(clone)
}

dbapi.setDevicePresent = function (serial) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      present: true,
      presenceChangedAt: new Date()
    }
  ).exec()
}

dbapi.setDeviceAbsent = function (serial) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      present: false,
      presenceChangedAt: new Date()
    }
  ).exec()
}

dbapi.setDeviceAirplaneMode = function (serial, enabled) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      airplaneMode: enabled
    }
  ).exec()
}

dbapi.setDeviceBattery = function (serial, battery) {
  return models.Device.findOneAndUpdate(
    { serial },
    { battery: { ...battery } }
  ).exec()
}

dbapi.setDeviceBrowser = function (serial, { selected, apps }) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      selected,
      apps
    }
  ).exec()
}


dbapi.setDeviceConnectivity = function (serial, connectivity) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      network: {
        connected: connectivity.connected,
        type: connectivity.type,
        subtype: connectivity.subtype,
        failover: !!connectivity.failover,
        roaming: !!connectivity.roaming
      }
    }
  ).exec()
}

dbapi.setDevicePhoneState = function (serial, state) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      network: {
        ...state
      }
    }
  ).exec()
}

dbapi.setDeviceRotation = function (serial, rotation) {
  return models.Device.findOneAndUpdate(
    { serial },
    { display: { rotation } }
  ).exec()
}

dbapi.setDeviceNote = function (serial, notes) {
  return models.Device.findOneAndUpdate(
    { serial },
    { notes }
  ).exec()
}

dbapi.setDeviceReverseForwards = function (serial, forwards) {
  return models.Device.findOneAndUpdate(
    { serial },
    { reverseForwards: forwards }
  ).exec()
}

dbapi.setDeviceReady = function (serial, channel) {
  return models.Device.findOneAndUpdate(
    { serial },
    {
      channel,
      ready: true,
      owner: null,
      reverseForwards: []
    }
  ).exec()
}

dbapi.saveDeviceIdentity = function (serial, identity) {
  return models.Device.findOneAndUpdate(
    { serial },
    { ...identity }
  ).exec()
}

dbapi.loadDevices = function () {
  return models.Device.find().exec()
}

dbapi.loadPresentDevices = function () {
  return models.Device.find(
    { present: true }
  ).exec()
}

dbapi.loadDevice = function (serial) {
  return models.Device.findOne(
    { serial }
  ).exec()
}

dbapi.saveUserAccessToken = function (email, token) {
  return models.AccessToken.create(
    {
      email,
      ...token
    }
  )
}

// TODO: need to change all references to the token as email to token
// TODO: verify this should be deleteOne and not deleteMany
dbapi.removeUserAccessToken = function (email, title) {
  return models.AccessToken.deleteOne(
    {
      email,
      title
    }
  ).exec()
}

dbapi.loadAccessTokens = function (email) {
  return models.AccessToken.find({ email }).exec()
}

dbapi.getToken = function (token) {
  return models.Token.findOne({ token }).exec()
}

// TODO: this should return a promise
dbapi.getAppIdBySerial = function (serial, callback) {
  return models.Token.findOne(
    { serial }
  ).sort({
    creationTime: 'desc'
  }).exec().then(result => {
    if (!result) {
      callback('Error fetching app from serial.')
    }
    callback(null, result.appId);
  }).catch(err => {
    callback('Error fetching app from serial.')
  })
}

dbapi.updateToken = function (tokenObj) {
  return models.Token.findOneAndUpdate(
    { token: tokenObj.token },
    tokenObj
  ).exec()
}

dbapi.expireToken = function (token) {
  let serial, tokenObj;

  return models.Token.findOne({token}).exec().then(_tokenObj => {
    tokenObj = _tokenObj
    if (!tokenObj) {
      console.log('Could not expire token ' + token + ': Does not exist');
      return Promise.resolve();
    }
    if (tokenObj.status !== 'expired') {
      serial = tokenObj.serial
      tokenObj.status = "expired"
      tokenObj.expiredTime = Date.now()
      return tokenObj.save()
    }
  }).then(() => {
    return dbapi.deleteUser(token)
  }).then(function () {
    if (serial) {
      return dbapi.publishKickedToken(tokenObj);
    } else {
      // End the chain early.
      return Promise.resolve();
    }
  }).then(function () {
    if (serial) {
      return dbapi.unsetDeviceOwner(serial);
    } else {
      // End the chain.
      return Promise.resolve();
    }
  })
}

/**
* @param {String} from - the phone number of the sender
* @param {String} to - the phone number receiving the sms
* @param {String} body - the body of the SMS message
*/
dbapi.saveSms = function (from, to, body) {
  return models.Sms.create({
    phoneNumber: to,
    from,
    body,
    timeReceived: new Date()
  })
}

/**
* @param {String} phoneNumber - the phone number to fetch SMS messages for
* @param {Date} since - if specified, only returns messages received after
* this time.
*/
dbapi.getSms = function (phoneNumber, since) {
  return models.Sms.find({ phoneNumber }).gt('timeReceived', since).exec()
}

dbapi.saveTask = function (task) {
  task.dateSubmitted = new Date()
  return models.Task.create(task)
}

dbapi.hasResponse = function (token) {
  return models.Response.findOne({ token }).exec().then(response => {
    if (response !== null) {
      return response.feedback.length !== 0;
    }
    return false;
  })
}

/**
* Fetches an ordered list of input events for the trace associated with
* the given token.
*/
dbapi.getInputEvents = function (token) {
  return models.DeviceEvent.find(
    { token }
  ).orderBy({
    timestamp: 'asc',
    seq: 'asc'
  }).exec().then(function (events) {
    events.forEach(function (event) {
      if (event.viewHierarchy) {
        try {
          event.viewHierarchy = JSON.parse(event.viewHierarchy)
        } catch (e) {
          event.viewHierarchy = null
        }
      }
    })
    return events
  })
}

// TODO: If this becomes slow, add an index for token
dbapi.getLogcatMessages = function (token) {
  return models.TokenLogcat.find(
    { token },
    { logcatMessage: true }
  ).sort({
    timestamp: 'asc'
  }).exec()
}

dbapi.getScreenDimensions = function (serial) {
  return models.Device.findOne(
    { serial },
    {
      'display.width': true,
      'display.heigh': true
    }
  ).exec().then(function (displayInfo) {
    return displayInfo.display
  });
}

dbapi.saveReplay = function (appId, token, viewHash) {
  return models.DeviceApp.findOneAndUpdate(
    { appId },
    { replay: token }
  ).exec().then(() => {
    return models.Token.findOneAndUpdate(
      { token },
      { viewHash }
    ).exec()
  })
}

dbapi.getApp = function (appId) {
  return models.DeviceApp.findOne({ appId }).exec()
}

dbapi.deleteInputEvents = function (token) {
  return models.DeviceEvent.deleteMany({ userEmail: token }).exec().then(() => {
    return models.TokenLogcat.deleteMany({ token }).exec()
  })
}

dbapi.getRedactMode = async function (token) {
  return models.Token.find({ token: token }).exec()
}

// ZIPT task response is saved here
dbapi.saveResponse = async function (response) {
  const token = response.token
  if (response.taskAnswer && response.taskAnswer.toUpperCase() === 'N/A') {
    response.taskAnswer = 'N/A'
  }
  await models.Token.findOneAndUpdate({ token }, { expiredTime: +new Date()})
  if (!response.feedback) {
    return models.Response.findOneAndUpdate(
      { token },
      { ...response },
      { upsert: true }
    ).exec()
  } else {
    const responseWithId = await models.Response.findOne({ token }, { _id: 1 })
    const id = responseWithId._id
    await models.TraceDetails.findOneAndUpdate(
      { token },
      {
        response: id
      }
    )
    return models.Response.findByIdAndUpdate(
      id,
      { ...response },
      { upsert: true }
    ).exec()
  }
}

dbapi.unsetDeviceUsage = function(serial) {}

module.exports = dbapi
