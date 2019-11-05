const config = require('../../config')
const mongoose = require('mongoose')
mongoose.Promise = require('bluebird')

const options = {
  host: config.database.host,
  ports: config.database.ports,
  db: config.database.db,
  rs: config.database.rs
}

let uriString = 'mongodb://'
options.ports.forEach((port) => {
  uriString = `${uriString}${options.host}:${port},`
})
// Remove trailing comma
uriString = uriString.slice(0, -1)
uriString = `${uriString}/${options.db}?replicaSet=${options.rs}`

// let apkSchema
const apkPromise = mongoose.connect(uriString, {
  autoIndex: false
}).then(() => {
  const gridfs = require('mongoose-gridfs')({
    collection: 'apks',
    model: 'Apk',
    mongooseConnection: mongoose.connection
  })

  const apkSchema = gridfs.schema
  apkSchema.add({
    metadata: mongoose.Schema.Types.Mixed
  })
  return gridfs
})
// Every instance of mongoose-gridfs is a new gridfs collection

const usersSchema = mongoose.Schema({
  createdAt: Date,
  email: String,
  forwards: Array,
  group: String,
  ip: String,
  lastLoggedInAt: Date,
  name: String,
  settings: mongoose.Schema.Types.Mixed,
  adbKeys: { type: [String], index: true }
})

const accessTokensSchema = mongoose.Schema({
  email: { type: String, index: true },
  id: String, // TODO: double check if this should be ObjectId
  title: String,
  jwt: String
})

const vncauthSchema = mongoose.Schema({
  password: String,
  response: { type: String, index: true },
  responsePerDevice: { type: String, index: true }
})

const devicesSchema = mongoose.Schema({
  abi: String,
  airplaneMode: String,
  battery: mongoose.Schema.Types.Mixed,
  browser: mongoose.Schema.Types.Mixed,
  channel: String,
  createdAt: Date,
  display: mongoose.Schema.Types.Mixed,
  manufacturer: String,
  model: String,
  network: mongoose.Schema.Types.Mixed,
  operator: String,
  owner: mongoose.Schema.Types.Mixed,
  phone: mongoose.Schema.Types.Mixed,
  platform: String,
  presenceChangedAt: Date,
  present: { type: Boolean, index: true },
  product: String,
  provider: mongoose.Schema.Types.Mixed,
  ready: Boolean,
  reverseForwards: Array,
  sdk: String,
  serial: String,
  status: Number,
  statusChangedAt: Date,
  usable: Boolean,
  using: Boolean,
  version: String
})

const logsSchema = mongoose.Schema({
  serial: String,
  timestamp: Date, // r.epochTime(entry.timestamp),
  priority: Number, // entry.priority,
  tag: String,
  pid: String,
  message: String
})

const deviceEventsSchema = mongoose.Schema({
  action: String,
  contact: Number,
  eventName: String,
  id: String, // TODO: give better name
  imgId: String,
  imgReceivedTime: Number,
  imgSentTime: Number,
  intermediateImgTimes: mongoose.Schema.Types.Mixed,
  key: String,
  pressure: Number,
  seq: Number,
  serial: String,
  serverXmlReceivedTimestamp: Number,
  serverXmlRequestedTimestamp: Number,
  sessionId: String,
  text: String,
  timestamp: Number,
  userEmail: { type: String, index: true }, // TODO: change? this is token i think
  userGroup: String,
  userIP: String,
  userLastLogin: String,
  userName: String,
  viewHierarchy: mongoose.Schema.Types.Mixed,
  viewHash: String,
  x: Number,
  y: Number
})

const screenshotsSchema = mongoose.Schema({
  appId: { type: String, index: true },
  token: { type: String, index: true },
  imgName: { type: String, index: true },
  filepath: { type: String, index: true },
  data: Buffer,
  metadata: {
    border: String,
    gestures: Array,
    elements: Array
  }
})

const transitionsSchema = mongoose.Schema({
  token: String,
  isDesignerToken: Boolean,
  source: String, // hash
  sourceVals: Array,
  sourceImg: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'screenshots'
  },
  dest: String, // hash
  destVals: Array,
  destImg: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'screenshots'
  }
})

const traceDetailsSchema = mongoose.Schema({
  androidId: String,
  appId: { type: String, index: true },
  token: { type: String, index: true },
  expiredTime: Number,
  numGestures: Number,
  timeTaken: Number,
  isDesignerToken: Boolean,
  isHidden: Boolean,
  completionOverride: String,
  images: Array,
  userEvents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'deviceEvents'
  }],
  rawImages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'screenshots'
  }],
  elements: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'screenshots'
  }],
  gestureImages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'screenshots'
  }],
  transitions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'transitions'
  }],
  response: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'responses'
  }
})

const tokensSchema = mongoose.Schema({
  androidId: String,
  appId: String,
  creationTime: Number,
  crowdService: String,
  expireMinutes: Number,
  expireTime: Number,
  replay: String,
  serial: String,
  status: String,
  task: mongoose.Schema.Types.Mixed,
  token: String,
  hitId: String,
  assignmentId: String,
  workerId: String,
  activeIP: String,
  activeTimeStart: Number,
  jwtOptions: mongoose.Schema.Types.Mixed,
  jwtToken: String,
  isDesignerToken: Boolean,
  isHidden: Boolean,
  response: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'responses'
  }
})

const kicksSchema = mongoose.Schema({
  androidId: String,
  appId: String,
  creationTime: Number,
  crowdService: String,
  expireMinutes: Number,
  expireTime: Number,
  replay: String,
  serial: String,
  status: String,
  task: mongoose.Schema.Types.Mixed,
  token: String,
  hitId: String,
  assignmentId: String,
  workerId: String,
  activeIP: String,
  activeStartTime: Number,
  jwtOptions: mongoose.Schema.Types.Mixed,
  jwtToken: String,
  isDesignerToken: Boolean
})

const tokenLogcatsSchema = mongoose.Schema({
  id: String,
  logcatDate: Number,
  logcatMessage: String,
  timestamp: Number,
  token: String
})

const deviceAppsSchema = mongoose.Schema({
  androidId: String,
  appId: String,
  title: String,
  apkIdx86: String,
  apkIdarm: String,
  crowdService: String,
  tokensLeft: Number,
  used: Boolean,
  updated: Number,
  task: mongoose.Schema.Types.Mixed,
  hitId: String,
  oldHitIds: Array,
  approved: Boolean,
  resultsEmailSent: Boolean,
  failures: Number,
  replay: String,
  iconUrl: String
})

const visualizationsSchema = mongoose.Schema({
  androidId: String,
  appId: String,
  creationTime: Number,
  crowdService: String,
  dirName: String,
  expireMinutes: Number,
  expiredTime: Number,
  logcats: Number,
  serial: String,
  task: mongoose.Schema.Types.Mixed,
  status: String,
  token: String,
  hitId: String,
  activeIP: String,
  activeStartTime: Number,
  jwtOptions: mongoose.Schema.Types.Mixed,
  jwtToken: String,
  uniqueActivities: Number,
  viewHierarchies: Number,
  viewHierarchyErrors: Number,
  assignmentId: String,
  workerId: String,
  isDesignerToken: Boolean
})

const smsSchema = mongoose.Schema({
  phoneNumber: { type: String, index: true },
  from: String,
  body: String,
  timeReceived: Date
})

const responsesSchema = mongoose.Schema({
  token: {
    type: String,
    index: true,
    unique: true,
    required: true
  },
  taskAnswer: String,
  feedback: Array
})

const leadsSchema = mongoose.Schema({
  apps: String,
  description: String,
  email: String,
  id: String,
  insights: String,
  name: String
})

const redactionsSchema = mongoose.Schema({
  x0: Number,
  y0: Number,
  x1: Number,
  y1: Number,
  width: Number,
  height: Number,
  screen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'screenshots'
  }
})

module.exports = {
  Apk: apkPromise,
  User: mongoose.model('users', usersSchema, 'users'),
  AccessToken: mongoose.model('accessTokens', accessTokensSchema, 'accessTokens'),
  VncAuth: mongoose.model('vncauth', vncauthSchema, 'vncauth'),
  Device: mongoose.model('devices', devicesSchema, 'devices'),
  Log: mongoose.model('logs', logsSchema, 'logs'),
  DeviceEvent: mongoose.model('deviceEvents', deviceEventsSchema, 'deviceEvents'),
  Screenshot: mongoose.model('screenshots', screenshotsSchema, 'screenshots'),
  Transitions: mongoose.model('transitions', transitionsSchema, 'transitions'),
  TraceDetails: mongoose.model('traceDetails', traceDetailsSchema, 'traceDetails'),
  Token: mongoose.model('tokens', tokensSchema, 'tokens'),
  Kick: mongoose.model('kicks', kicksSchema, 'kicks'),
  TokenLogcat: mongoose.model('tokenLogcats', tokenLogcatsSchema, 'tokenLogcats'),
  DeviceApp: mongoose.model('deviceApps', deviceAppsSchema, 'deviceApps'),
  Visualization: mongoose.model('visualizations', visualizationsSchema, 'visualizations'),
  Sms: mongoose.model('sms', smsSchema, 'sms'),
  Response: mongoose.model('responses', responsesSchema, 'responses'),
  Lead: mongoose.model('leads', leadsSchema, 'leads'),
  Redaction: mongoose.model('redactions', redactionsSchema, 'redactions')
}
