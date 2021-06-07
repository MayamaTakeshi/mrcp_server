require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const _ = require('lodash')

const net = require('net')

const config = require('config')

const FILE = u.filename()


const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class JuliusSpeechRecogStream extends Writable {
    constructor(uuid, language, context) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        this.setup_speechrecog(language, context)

        this.start_of_input = false
    }

    setup_speechrecog(language, context) {
        log(__line, 'debug', this.uuid, `Creating TCP Client to Julius Server`)

        this.client = new net.Socket();
        this.client.connect(config.julius_server_port, config.julius_server_ip, function() {
            log(__line, 'debug', this.uuid, `TCP Client connected`)
        })

        this.client.on('data', function(data) {
            log(__line, 'debug', this.uuid, `TCP Client received ${data}`)
        })

        this.client.on('close', function() {
            log(__line, 'debug', this.uuid, `TCP Client closed`)
        })

        setTimeout(() => {
            this.eventEmitter.emit('ready')
        }, 0)           
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _write(data, enc, callback) {
        //console.log(`_write got ${data.length}`)

        // Convert from ulaw to L16 big-endian and resample from 8000 to 16000

        var buf = Buffer.alloc(data.length * 4)

        for(var i=0 ; i<data.length ; i++) {
            var l = u.ulaw2linear(data[i])
            buf[i*4] = l >>> 8
            buf[i*4+1] = l & 0xFF
            buf[i*4+2] = l >>> 8
            buf[i*4+3] = l & 0xFF
        }

        this.client.write(buf)

        callback()

        return true
    }

    _final(callback) {
        log(__line, 'info', this.uuid, '_final')

        // TODO: must remove listeners
        this.client.end()
        this.client = null

        callback()
    }

}

module.exports = JuliusSpeechRecogStream
