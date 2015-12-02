/**
 * This intercepts control events received over WebSockets and writes them to the filesystem.
 * Assumes that folders for sessions are created beforehand.
 */
var fs = require('fs');
var path = require('path');

// var TAPP_DIR = '/Users/forrest/Documents/tapp';
var TAPP_DIR = '../../../../../tapp';
var config = require(path.join(TAPP_DIR, 'webapp/config/config');
var OUTPUT_DIR = path.resolve(config['OUTPUT_DIR']['EXPLORE_RECORDING']);

// Validate the path to the recording output directory.
if (!pathExists(OUTPUT_DIR)) {
	console.error('Could not find output directory', OUTPUT_DIR);
	process.exit();
}

var sessionToStream = {};



function pathExists (path) {
    try {
        fs.statSync(path);
        return true;
    } catch (e) {
        return false;
    }
}


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
	if (!pathExists) {
		return null;
	}

	var wstream = fs.createWriteStream('inputEvents.txt');
	sessionToStream[sessionId] = wstream;

	return wstream;
}


function eventDataToString (eventName, data) {
	var line = 'time:'+Date.now()+' event:'+eventName;
	for (var prop in data) {
		line += ' '+prop+':'+data[prop];
	}
	line += '\n';

	return line;
}


function receiveEvent (eventName, data) {
	// Write to the appropriate event stream.
	var wstream = getSessionEventStream(data.sessionId);
	if (!wstream){
		return;
	}

	var line = eventDataToString(eventName, data);
	wstream.write(line);
}



module.exports = {
	receiveEvent: receiveEvent
};
