const mongoose = require('mongoose')
mongoose.Promise = require('bluebird')
const logger = require('../util/logger')
const log = logger.createLogger('db:mongoCreate')

module.exports = {
  connect: () => {

    const options = {
      host: config.database.host,
      ports: config.database.ports,
      db: config.database.db,
      rs: config.database.rs
    }

    let uriString = 'mongodb://'
    options.ports.forEach((port) => {
      uriString = `${uriString}${options.host}:${port},`
    })
    // Remove trailing comma
    uriString = uriString.slice(0, -1)
    uriString = `${uriString}/${options.db}?replicaSet=${options.rs}`

    if (mongoose.connection.readyState === 0) {
      mongoose.connect(uriString, {autoIndex: false}).then(() => {
        log.info('Mongo connection created.')
      })
    }
  }
}
