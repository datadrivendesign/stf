var EventEmitter = require('events')
const Token = require('../db/models').Token

var emitter = new EventEmitter()

Token.watch([], { fullDocument: 'updateLookup' }).on('change', (changeEvent) => {
  if (
    changeEvent.operationType === 'update'
    && changeEvent.updateDescription.updatedFields.status
    && changeEvent.updateDescription.updatedFields.status === 'expired'
  ) {
    emitter.emit('expired', changeEvent.fullDocument)
  }
})

module.exports = emitter
