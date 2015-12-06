/**
 * This provides a BufferedEventProcessor data structure.  We want to block the
 * processing of input events so that we can fetch XML before a click is sent
 * to the phone, for example.  To do so, we buffer events while requests are
 * pending.
 */

var EVENT_STATE = {
    NEEDS_REQUEST: 1,
    AWAITING_RESPONSE: 2,
    FULFILLED: 3
};

function BufferedEventProcessor (options) {
    options = options || {};
    options.xmlTimeout = options.xmlTimeout || 1000;

    // List of events that have not yet been processed.
    this.queue = [];
}


// Consume as many events as possible.
BufferedEventProcessor.prototype.consumeEvents = function () {
    var self = this;
    while (this.queue.length) {
        var top = this.queue[0];

        // Make request, register a self-fulfilling callback on completion.
        if (top.state === EVENT_STATE.NEEDS_REQUEST) {
            top.state = EVENT_STATE.AWAITING_RESPONSE;
            top.request(function () {
                top.state = EVENT_STATE.FULFILLED;
                self.consumeEvents();
            });

        // Event should be fulfilled
        } else if (top.state === EVENT_STATE.FULFILLED) {
            top.signal();
            this.queue.splice(0, 1);

        // Event is awaiting response, no further events can be processed
        } else {
            // // If the XML times out, just pop it, process it and move on with the queue.
            // if (useTimeout && Date.now() - top.time > XML_TIMEOUT) {
            //     top.signal();
            //     queue.splice(0, 1);
            // } else {
            //     break
            // }
            break;
        }
    }
};


// Sends signal immediately, or buffers it.
BufferedEventProcessor.prototype.produceEvent = function (evt) {
    this.queue.push(evt);
    this.consumeEvents();

    // setTimeout(updateEventBuffer, XML_TIMEOUT);
};



module.exports = {
    BufferedEventProcessor  : BufferedEventProcessor,
    EVENT_STATE             : EVENT_STATE
};
