/**
 * This intercepts control events received over WebSockets and writes them to the filesystem.
 */
var fs = require('fs');
var wstream = fs.createWriteStream('eventTest.txt');

// wstream.end();

function receiveEvent (eventName, data) {
	var line = 'time:'+Date.now()+' event:'+eventName;
	for (var prop in data) {
		line += ' '+prop+':'+data[prop];
	}
	line += '\n';
	wstream.write(line);
}

module.exports = {
	receiveEvent: receiveEvent
};
