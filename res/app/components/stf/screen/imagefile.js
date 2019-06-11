function ImageFile() {
  this.nextImgId = ""
  this.nextImgIdTime = ""
  this.imgTimes = {}
  this.deviceSerial = ""
}

ImageFile.prototype.getNextImgId = function() {
  return this.nextImgId;
}

ImageFile.prototype.setNextImgIdTime = function(nextImgIdTime) {
	this.nextImgIdTime = nextImgIdTime;
	this.imgTimes[this.nextImgId] = nextImgIdTime;
}

ImageFile.prototype.getImgTimes = function() {
	var retVal = this.imgTimes;
	this.imgTimes = {};
	return retVal;
}

ImageFile.prototype.getNextImgIdTime = function() {
	return this.nextImgIdTime;
}

ImageFile.prototype.setNextImgId = function(nextImgId) {
  this.nextImgId = nextImgId;
}

ImageFile.prototype.getCurrentDeviceSerial = function() {
  return this.deviceSerial;
}

ImageFile.prototype.setCurrentDeviceSerial = function(deviceSerial) {
  this.deviceSerial = deviceSerial;
}

module.exports = new ImageFile()
