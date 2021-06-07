require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const MorseDecodingStream = require('morse-decoding-stream')

const morse = require('morse-node').create("ITU")

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class MorseSpeechRecogStream extends Writable {
    constructor(uuid, language, context) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

		this.setup_speechrecog()

        this.acc = ""
		this.last_char_time = new Date()

        setTimeout(() => {
            this.eventEmitter.emit('ready')
        }, 0)
    }

    setup_speechrecog() {
        var format = {
            sampleRate: 8000,
            bitDepth: 16,
            channels: 1,
        }

        const opts = {
            threshold: 0.1,
            numSamples: 10,
            dotDuration: 30,
        }

        this.mds = new MorseDecodingStream(format, opts)

        this.mds.on('data', data => {
            if(this.acc == '') {
                this.eventEmitter.emit('start_of_input')
            }

            if(data == '/') {
                this.acc += " / "
            } else if(data == ' ') {
                this.acc += " "
            } else {
                this.acc += data
            }

            this.last_char_time = new Date()
        })

        this.timer_id = setInterval(() => {
            var now = new Date()
            var diff = now.getTime() - this.last_char_time.getTime()
            if(this.acc != "" && diff > 1000) {
                var decoded = morse.decode(this.acc).trim().toUpperCase()
                //log(__line, 'info', this.uuid, `Emitting data: now=${now} last_char_time=${this.last_char_time} diff=${diff} acc=${this.acc} decoded=${decoded}`)
                this.eventEmitter.emit('data', {
                    transcript: decoded,
                    confidence: 50.0,
                })
                clearInterval(this.timer_id)
                this.timer_id = null
            }
        }, 100)
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _write(data, enc, callback) {
        //console.log(`_write got ${data.length}`)

        // convert ulaw to L16 little-endian
        var buf = Buffer.alloc(data.length * 2)

        for(var i=0 ; i<data.length ; i++) {
            var l = u.ulaw2linear(data[i])
            buf[i*2] = l & 0xFF
            buf[i*2+1] = l >>> 8
        }

        var res = this.mds.write(buf)
        if(!res) {
            log(__line, 'info', this.uuid, `failed to write to stream`)
        }

        callback()

        return true
    }

    _final(callback) {
        log(__line, 'info', this.uuid, '_final')

        // For this stream, nothing needs to be done

        callback()

    }
}

module.exports = MorseSpeechRecogStream
