require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const speech = require('@google-cloud/speech')

const speechClient = new speech.SpeechClient()

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class GoogleSpeechRecogStream extends Writable {
    constructor(uuid, language) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

		this.last_digit_time = new Date()

        this.setup_speechrecog(language)
    }

    setup_speechrecog(language) {
        var config = {
            //encoding: "MULAW",
            encoding: "LINEAR16",
            sampleRateHertz: 8000,
            languageCode: language,
        }

        var request = {
            config,
            interimResults: false, 
            singleUtterance: true,
        }

        log(__line, 'debug', this.uuid, 'Creating RecognizeStream')

        this.recognizeStream = speechClient
            .streamingRecognize(request)
            .on('error', (error) => { 
                var err_msg = `recognizeStream error: ${error}`
                log(__line, 'error', this.uuid, err_msg)
                this.eventEmitter.emit('error', err_msg)
            })
            .on('data', data => {
                log(__line, 'info', this.uuid, `recognizeStream data: ${JSON.stringify(data)}`)

                var transcript = data.results && data.results[0] ? data.results[0].alternatives[0].transcript : ''
                var confidence = data.results && data.results[0] ? data.results[0].alternatives[0].confidence : 0

                if(!data.results) return

                if(!data.results[0]) return

                this.eventEmitter.emit('data', {
                    transcript: transcript,
                    confidence: confidence,
                })
            })
            .on('close', data => {
                var err_msg = `recognizeStream closed`
                log(__line, 'error', this.uuid, err_msg)
                this.eventEmitter.emit('error', err_msg)
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
        console.log(`_write got ${data.length}`)

        var res = this.recognizeStream.write(data)
        log(__line, 'debug', this.uuid, `recognizeStream.write() res=${res}`)
        
        callback()

        return true
    }

    _final(callback) {
        log(__line, 'info', this.uuid, '_final')

        if(this.recognizeStream) {
            this.recognizeStream.end()
            this.recognizeStream = null
        }

        callback()
    }

}

module.exports = GoogleSpeechRecogStream
