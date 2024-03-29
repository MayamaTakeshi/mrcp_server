require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const _ = require('lodash')

const SpeechRecogStream = require('speech-recog-stream')

const FILE = u.filename()


const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class JuliusSpeechRecogStream extends Writable {
    constructor(uuid, language, context, config) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        this.setup_speechrecog(language, context, config)

        this.start_of_input = false

        this.language = language

        this.src_encoding = config.src_encoding
    }

    setup_speechrecog(language, context, config) {
        const opts = {
            server_ip: config[language].server_ip,
            server_port: config[language].server_port,
        }

        this.srs = new SpeechRecogStream(opts)

        this.srs.on('data', data => {
            log(JSON.stringify(data))
            if(data.event == 'speech_start' && !this.start_of_input) {
                this.eventEmitter.emit('start_of_input')
                this.start_of_input = true
            } else if(data.event == 'result') {
                var transcript = data.text
                if(this.language == 'ja-JP') {
                    // remove spaces for japanese
                    transcript = transcript.split(" ").join("")
                }
                this.eventEmitter.emit('data', {
                    transcript: transcript,
                    confidence: 1.0,
                })
            }
        })

        this.srs.on('ready', () => {
            log('ready')
            this.eventEmitter.emit('ready')
        })

        this.srs.on('error', err => {
            this.eventEmitter.emit('error', err)
        })

        this.srs.on('close', () => {
            this.eventEmitter.emit('close')
        })
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _write(data, enc, callback) {
        //console.log(`_write got ${data.length}`)

        var buf

        if(this.src_encoding == 'l16') {
            // change from le to be and resample from 8000 to 16000

            buf = Buffer.alloc(data.length * 2)

            for(var i=0 ; i<data.length ; i+=2) {
                buf[i*2] = data[i+1]
                buf[i*2+1] = data[i]
                buf[i*2+2] = data[i+1]
                buf[i*2+3] = data[i]
            }

        } else {
            // Convert from ulaw to L16 big-endian and resample from 8000 to 16000

            buf = Buffer.alloc(data.length * 4)

            for(var i=0 ; i<data.length ; i++) {
                var l = u.ulaw2linear(data[i])
                buf[i*4] = l >>> 8
                buf[i*4+1] = l & 0xFF
                buf[i*4+2] = l >>> 8
                buf[i*4+3] = l & 0xFF
            }
        }

        //console.dir(buf)
        this.srs.write(buf)

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

module.exports = JuliusSpeechRecogStream
