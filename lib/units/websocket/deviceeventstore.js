var dbapi = require('../../db/api');
var _ = require('lodash')
var log = require('../../util/logger').createLogger('websocket:event:store');

function DeviceEventStore() {
}

DeviceEventStore.prototype.storeEvent = function(eventName, eventData) {
  if (!eventData || !eventData.imgId || !eventData.userEmail) {
    log.error('Missing critical event data, ignoring save event on %s:%s',
        eventName,
        JSON.stringify(eventData));
    return;
  }

  // if (!eventData.record) {
  //   return
  // }

  var intermediateImgTimes = {};
  _.each(eventData.intermediateImgTimes,(function(v, k) {
    intermediateImgTimes[k.split("_")[1]] = {
      sentTime: parseInt(k.split("_")[2].split(".")[0]),
      receivedTime: v
    }
  }));
  // Transform attribute names for db and convert undefined's to nulls.
  // Strictly check numeric undefined's.
  var deviceEvent = {
    action: eventData.action === undefined ? null : eventData.action,
    serial: eventData.serial,
    sessionId: eventData.wsId,
    eventName: eventName,
    imgId: eventData.imgId,
    imgSentTime: parseInt(eventData.imgId.split("_")[2].split(".")[0]),
    imgReceivedTime: eventData.imgReceivedTime,
    intermediateImgTimes: intermediateImgTimes,
    timestamp: eventData.timestamp,
    serverXmlRequestedTimestamp: eventData.serverXmlRequestedTimestamp,
    serverXmlReceivedTimestamp: new Date().getTime(),
    userEmail: eventData.userEmail,
    userGroup: eventData.userGroup,
    userIP: eventData.userIP,
    userLastLogin: eventData.userLastLogin,
    userName: eventData.userName,
    seq: eventData.seq === undefined ? null : eventData.seq,
    x: eventData.x === undefined ? null : eventData.x,
    y: eventData.y === undefined ? null : eventData.y,
    pressure: eventData.pressure === undefined ? null : eventData.pressure,
    viewHierarchy: eventData.viewHierarchy ? eventData.viewHierarchy : null,
    key: eventData.key ? eventData.key : null,
    text: eventData.text ? eventData.text : null,
    contact: eventData.contact === undefined ? null : eventData.contact
  };

  dbapi.saveDeviceEvent(deviceEvent).catch(function(err) {
    log.error('Failed save attempt on %s:%s',
        eventName,
        JSON.stringify(eventData), err);
  });

};

module.exports = DeviceEventStore;
