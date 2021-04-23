require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const DtmfDetectionStream = require('dtmf-detection-stream')

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class DtmfSpeechRecogStream extends Writable {
    constructor(uuid, language) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

		this.setup_speechrecog()

		this.last_digit_time = new Date()

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

        this.dds = new DtmfDetectionStream(format, {numSamples: 1000})
        this.digits = ""

        this.dds.on('digit', digit => {
            if(this.digits == "") {
                this.eventEmitter.emit('start_of_input')
            }
            this.digits += digit
            this.last_digit_time = new Date()
        })

        this.timer_id = setInterval(() => {
            var now = new Date()
            var diff = now.getTime() - this.last_digit_time.getTime()
            if(this.digits != "" && diff > 500) {
                this.eventEmitter.emit('data', {
                    transcript: this.digits,
                    confidence: 100.0,
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

        var res = this.dds.write(data)
        if(!res) {
            log(__line, 'info', this.uuid, `failed to write to stream`)
        }

        callback()

        return true
    }

    _final(callback) {
        log(__line, 'info', this.uuid, '_final')

        if(this.timer_id) {
            clearInterval(this.timer_id)
            this.timer_id = null
        }

        callback()

    }

}

module.exports = DtmfSpeechRecogStream
