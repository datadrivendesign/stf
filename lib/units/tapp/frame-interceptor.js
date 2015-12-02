/**
 * This intercepts frames / screencaps of a device and saves them to the filesystem.
 */
var fs = require('fs');
var path = require('path');
var OUTPUT_DIR;

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

	var sessionDir = path.join(OUTPUT_DIR, 'session_'+sessionId);
	sessionToCounter[sessionId] = sessionToCounter[sessionId] || 1;
	var count = sessionToCounter[sessionId]++;
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



module.exports = function (options) {
	OUTPUT_DIR = options.dir;

	return {
		receiveFrame: receiveFrame
	}
}
