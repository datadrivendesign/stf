/**
 * This intercepts control events received over WebSockets and writes them to the filesystem.
 * Assumes that folders for sessions are created beforehand.
 */
var fs = require('fs');
var path = require('path');
var pathExists = require('./utils').pathExists;
var OUTPUT_DIR;

// Holds a map from sessionIds to writeable streams.
var sessionToStream = {};


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

	return line;
}


// Handles processing of new events; writes to the appropriate event stream.
function receiveEvent (eventName, data) {
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



module.exports = function (options) {
	OUTPUT_DIR = options.dir;

	return {
		receiveEvent: receiveEvent
	}
}
