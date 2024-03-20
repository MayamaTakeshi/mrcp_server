require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const speech = require('@google-cloud/speech')

const speechClient = new speech.SpeechClient()

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const _ = require('lodash')

const FILE = u.filename()


const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class GoogleSpeechRecogStream extends Writable {
    constructor(uuid, language, context, config) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        this.last_digit_time = new Date()

        this.setup_speechrecog(language, context)

        this.start_of_input = false

        this.src_encoding = config.src_encoding
    }

    setup_speechrecog(language, context) {
        var config = {
            //encoding: "MULAW",
            encoding: "LINEAR16",
            sampleRateHertz: 8000,
            languageCode: language,
        }

        if(context) {
            console.log(context)
            if(context.elements[0].elements) {
                var phrases = _.map(context.elements[0].elements, e => e.elements[0].text)

                config.speechContexts = [{
                    phrases: phrases,
                    boost: 2,
                }]
            } 
        }

        var request = {
            config,
            interimResults: false,
            singleUtterance: true,
        }

        log(__line, 'debug', this.uuid, `Creating RecognizeStream with ${JSON.stringify(request)}`)

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

                log(__line, 'info', this.uuid, `transcript=${transcript}`)

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
        //console.log(`_write got data.length=${data.length} src_encoding=${this.src_encoding}`)

        var buf
        if(this.src_encoding == 'l16') {
            buf = data
        } else {
            // convert ulaw to L16 little-endian
            buf = Buffer.alloc(data.length * 2)

            for(var i=0 ; i<data.length ; i++) {
                var l = u.ulaw2linear(data[i])
                buf[i*2] = l & 0xFF
                buf[i*2+1] = l >>> 8
            }
        }

        //console.dir(buf)

        var res = this.recognizeStream.write(buf)
        //log(__line, 'debug', this.uuid, `recognizeStream.write() res=${res}`)
        
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
