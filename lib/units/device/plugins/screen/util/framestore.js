var util = require('util')
var path = require('path')
var fs = require('fs')
var mkdirp = require('mkdirp')

// Default to the global app root, otherwise fallback on the cwd.
var FINAL_SCREEN_SHOT_DIR = path.join(global.appRoot || '.', '/screen_shots/')
mkdirp.sync(FINAL_SCREEN_SHOT_DIR)

function FrameStore() {
  this.sessionImgCountMap = {}
}

FrameStore.prototype.getNextFileName = function(sessionId) {
  if (this.sessionImgCountMap[sessionId]) {
    this.sessionImgCountMap[sessionId] += 1
  }
 else {
    this.sessionImgCountMap[sessionId] = 1
  }
  var sessionImgNumber = this.sessionImgCountMap[sessionId]
  var fileName = util.format('%s_%s_%d.jpg', sessionId, sessionImgNumber, new Date())
  return fileName
}

FrameStore.prototype.storeFrame = function(frame, fileName) {
  var filePath = path.join(FINAL_SCREEN_SHOT_DIR, fileName)

  fs.writeFile(filePath, frame, function(err) {
    if (err) {
      console.log(err)
    }
  })
}

module.exports = FrameStore
