require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const _ = require('lodash')

const WebSocket = require('ws')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class VoskSpeechRecogStream extends Writable {
    constructor(uuid, language, context, config) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        this.setup_speechrecog(language, context, config)

        this.start_of_input = false

        this.language = language

        this.src_encoding = config.src_encoding

        this.acc = []
    }

    setup_speechrecog(language, context, config) {
        const self = this

        const server = config[language].server

        self.ws = new WebSocket(server)

        self.ws.on('open', function open() {
            self.ws.send('{ "config" : { "sample_rate" : 8000 } }')

            self.eventEmitter.emit('ready')
        })

        self.ws.on('message', function message(data) {
            //console.log('ws message', data)
            var d = JSON.parse(data)

            if(d.result && !this.start_of_input) {
                self.eventEmitter.emit('start_of_input')
                this.start_of_input = true
            }

            if(d.text) {
                var transcript = d.text
                if(self.language == 'ja-JP') {
                    // remove spaces for japanese
                    //console.log('remove spaces for japanese')
                    transcript = transcript.split(" ").join("")
                }
                self.eventEmitter.emit('data', {
                    transcript: transcript,
                    confidence: 1.0,
                })
            }
        })
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _write(data, enc, callback) {
        //console.log(`_write got ${data.length}`)
        const self = this

        var buf
        var bufferArray

        if(this.src_encoding == 'l16') {
            buf = []

            for(var i=0 ; i<data.length/2 ; i++) {
                buf[i*2] = (data[i*2] << 8)
                buf[i*2+1] = data[i*2+1]
            }

            bufferArray = Array.prototype.slice.call(buf)
        } else {
            // Convert from ulaw to L16

            buf = []

            for(var i=0 ; i<data.length ; i++) {
                var l = u.ulaw2linear(data[i])
                buf[i*2] = l & 0xFF
                buf[i*2+1] = l >>> 8
            }

            bufferArray = Array.prototype.slice.call(buf)
        }

        if(this.acc.length < 10) {
            this.acc.push(Buffer.from(bufferArray))
        } else {
            //console.log('sending audio to vosk')
            var data = Buffer.concat(this.acc)
            //console.log(data)
            self.ws.send(data)
            this.acc = []
        }

        callback()

        return true
    }

    _final(callback) {
        log(__line, 'info', this.uuid, '_final')

        this.eventEmitter.removeAllListeners()
        if(this.srs) {
            this.srs.end()
            this.srs = null
        }

        callback()
    }
}

module.exports = VoskSpeechRecogStream
