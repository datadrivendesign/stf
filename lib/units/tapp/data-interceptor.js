/**
 * This intercepts frames / screenshots of a device and saves them to the filesystem.
 */
var fs = require('fs');
var path = require('path');
var utils = require('./utils');
var request = require('request');
var pathExists = utils.pathExists;
var processorModule = require('./buffered-event-processor');
var BufferedEventProcessor = processorModule.BufferedEventProcessor;
var EVENT_STATE = processorModule.EVENT_STATE;
var OUTPUT_DIR = utils.OUTPUT_DIR;
var TAPP_PORT = utils.TAPP_PORT;
var EVT_NAME = {
	GESTURESTART 	: 'input.gestureStart',
	TYPE 			: 'input.type'
};

// Holds a map from sessionIds to writeable streams.
var sessionToStream = {};
var sessionToCounter = {};

// Gets the writeable stream associated with the session, or null if the 
// provided sessionId does not have a folder.
function getSessionEventStream (sessionId) {
	if (!sessionId) {
		return null;
	}

	// Get the stream if it exists.
	if (sessionToStream[sessionId]) {
		return sessionToStream[sessionId];
	}

	// Otherwise try to create a new stream.
	var sessionDir = path.join(OUTPUT_DIR, 'session_'+sessionId);
	// if (!pathExists(sessionDir)) {
	// 	return null;
	// }

	var inputStreamFile = path.join(sessionDir, 'frames.txt');
	var wstream = fs.createWriteStream(inputStreamFile);
	sessionToStream[sessionId] = wstream;
	sessionToCounter[sessionId] = 1;

	return wstream;
}

var shown = false;
// Handles processing of new events; writes to the appropriate event stream.
function receiveFrame (frame, sessionId) {
	if (!sessionId) {
		return;
	}

	// console.log('joining', OUTPUT_DIR, 'session_'+sessionId)
	var sessionDir = path.join(OUTPUT_DIR, 'session_'+sessionId);

	sessionToCounter[sessionId] = sessionToCounter[sessionId] || 0;
	sessionToCounter[sessionId]++;
	// console.log('frame increment!', sessionToCounter)
	module.exports.sessionToCounter = sessionToCounter;
	var count = sessionToCounter[sessionId];
	var inputStreamFile = path.join(sessionDir, 'img', 'frame_'+count+'_'+Date.now()+'_.png');
	fs.writeFile(inputStreamFile, frame, function (err) {
		if (err) {
			console.log(err);
		}
	});

	// Write to file.
	// var wstream = getSessionEventStream(sessionId);
	// if (!wstream) {
	// 	return;
	// }
	// wstream.write(frame);
}

function getImgCount (sessionId) {
	return sessionToCounter[sessionId];
}


// Holds a map from sessionIds to writeable streams.
var sessionToStream = {};
var sessionToEventProcessor = {};
var sessionToLastEventName = {};


// Gets the writeable stream associated with the session, or null if the 
// provided sessionId does not have a folder.
function getSessionEventStream (sessionId) {
	if (!sessionId) {
		return null;
	}

	// Get the stream if it exists.
	if (sessionToStream[sessionId]) {
		return sessionToStream[sessionId];
	}

	// Otherwise try to create a new stream.
	var sessionDir = path.join(OUTPUT_DIR, 'session_'+sessionId);
	// if (!pathExists(sessionDir)) {
	// 	return null;
	// }

	var inputStreamFile = path.join(sessionDir, 'inputEvents.txt');
	var wstream = fs.createWriteStream(inputStreamFile);
	sessionToStream[sessionId] = wstream;

	return wstream;
}


// Given an event, returns the formatted string to be written.
function eventDataToString (eventName, data) {
	var line = 'time:'+Date.now()+' event:'+eventName;
	for (var prop in data) {
		line += ' '+prop+':'+data[prop];
	}
	line += '\n';

	console.log(line)

	return line;
}


// Adds a line to inputEvents.txt for a given event.
function writeEventToFile (eventName, data) {
	if (!data.sessionId) {
		return;
	}
	
	var wstream = getSessionEventStream(data.sessionId);
	if (!wstream){
		return;
	}

	var line = eventDataToString(eventName, data);
	wstream.write(line);
}


/**
 * XML requests and buffered event processing.
 * TODO(Erik): Right now, this is a very awkward setup.  Phone management and
 * port forwarding is currently setup in tapp, while event bindings need to be
 * placed in openSTF.  All of this interception logic should be close together,
 * in one repo ideally.
 *
 * The requests for XML, as well as event stream write destination, both 
 * currently rely on the fact that openSTF and Tapp are running on the same
 * server, in sibling directories.  Not good...
 */
function snapXML (sessionToCounter, sessionId, callback) {
	console.log(this)
	console.log(sessionToCounter)
	var imgCount = sessionToCounter[sessionId];
	var query = { sessionId: sessionId, imgCount: imgCount };
	console.log('snapping for img', imgCount)
	request.get({url: 'http://localhost:'+TAPP_PORT+'/snap-xml', qs: query}, function (err, response, body) {
		if (err) {
			console.error('Unable to snap XML for session', sessionId);
		}
		if (typeof callback === 'function') {
			callback();
		}
	});
}
var snapXMLBound = snapXML.bind(this);


function getEventProcessor (sessionId) {
	if (!sessionToEventProcessor[sessionId]) {
		sessionToEventProcessor[sessionId] = new BufferedEventProcessor();
	}
	return sessionToEventProcessor[sessionId];
}


// Handles processing of a new event, making requests for XML as needed.
function receiveEvent (eventName, data, signal) {
	// If not tied to a session, just let the signal pass through.
	var sessionId = data.sessionId;
	var lastEventName = sessionToLastEventName[sessionId];
	if (!sessionId) {
		return signal();
	}

	// Build the event with a signal that logs itself.
	var evt = {
		state			: EVENT_STATE.FULFILLED,
		registeredTime	: Date.now(),
		signal			: function () {
			writeEventToFile(eventName, data, signal);
			signal();
		}
	}

	if (eventName === EVT_NAME.GESTURESTART) {
		evt.state = EVENT_STATE.NEEDS_REQUEST;
		console.log('passing in', sessionToCounter)
		console.log('exports', module.exports.sessionToCounter)
		evt.request = function (callback) {
			snapXMLBound(sessionToCounter, sessionId, callback);
		}.bind(this)

	} else if (eventName === EVT_NAME.TYPE && lastEventName === eventName) {
		evt.state = EVENT_STATE.NEEDS_REQUEST;
		evt.request = function (callback) {
			snapXMLBound(sessionToCounter, sessionId, callback);
		}
	}

	// Remember this event name so we don't repeat XML requests for type events.
	sessionToLastEventName[sessionId] = eventName;

	// Send event to its session's processor.
	var processor = getEventProcessor(sessionId);
	processor.produceEvent(evt);
}



module.exports = {
	receiveEvent	: receiveEvent,
	receiveFrame	: receiveFrame,
	getImgCount		: getImgCount,
	sessionToCounter: sessionToCounter
}
