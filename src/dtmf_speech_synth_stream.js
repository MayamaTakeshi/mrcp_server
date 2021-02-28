require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const { ToneStream, utils} = require('tone-stream')

const { Readable } = require('stream')

const { EventEmitter } = require('events')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

const SAMPLE_RATE = 8000

const DEFAULT_DIGIT_DURATION = "50ms"

class DtmfSpeechSynthStream extends Readable {
    constructor(uuid, data, elements) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        var digits = data.body
            
        const format = {
            sampleRate: SAMPLE_RATE,
            bitDepth: 16,
            channels: 1,
        }

        this.toneStream = new ToneStream(format)

        if(typeof elements === 'string') {
            elements = [
                {
                    "type": "text",
                    "text": elements,
                },
            ]
        }

        try {
            this.toneStream.add([800, 's']) // initial silence
            this.process_elements(elements)
            this.toneStream.add([800, 's']) // final silence
        } catch (err) {
            setTimeout(() => {
                this.eventEmitter.emit('error', err)
            }, 0)
            return
        }
        
        setTimeout(() => {
            this.eventEmitter.emit('ready')
        }, 0) 
    }

    parse_duration(duration) {
        if(duration.endsWith("ms")) {
            return parseInt(duration) 
        } else if(duration.endsWith("s")) {
            return parseInt(duration) * 1000
        } else {
            throw `parse-failure: invalid duration ${duration}`
        }
    }
    
    push_silence(duration) {
        var milliseconds = this.parse_duration(duration)
        var samples = Math.round(SAMPLE_RATE / 1000 * milliseconds)
        this.toneStream.add([samples, 's'])
    }

    push_digits(digits, duration) {
        var milliseconds = this.parse_duration(duration)

        if(digits.match(/[^0-9a-fA-F\*\#]/)) {
            throw `parse-failure: invalid DTMF sequence '${digits}'`
        }

        this.toneStream.concat(utils.gen_dtmf_tones(digits, milliseconds, milliseconds, SAMPLE_RATE))
    }

    process_elements(elements) {
        var res
        for(var i=0 ; i<elements.length ; i++) {
            var e = elements[i]
            if(e.type == 'text') {
                this.push_digits(e.text, DEFAULT_DIGIT_DURATION)
            } else if(e.type == 'element' && e.name == 'prosody'
                  && e.attributes.rate
                  && e.elements && e.elements[0] && e.elements[0].type == 'text') {
                this.push_digits(e.elements[0].text, e.attributes.rate)
            } else if(e.type == 'element' && e.name == 'break'
                  && typeof e.attributes.time == 'string') {
                this.push_silence(e.attributes.time)
            } else {
                throw(`parse-failure: invalid SSML element ${JSON.stringify(e)}`)
            }
        }
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _read(size) {
        //console.log(`dtmf_generation_stream.read(${size})`)
        // we ignore size and always process it as 320 (we could set it as a parameter in the constructor). This is OK:
        // The _read function will also get a provisional size parameter as its first argument that specifies how many bytes the consumer wants to read, but your readable stream can ignore the size if it wants.
        // Ref: https://github.com/substack/stream-handbook
        // However, this is actually not necessary. See: gss_generation_stream.js.
        // We are doing this as a workaround as it seems if we get size=16384 and call this.toneStream(size) we get null.
        // This is probably a bug in tone-stream so we will solve it this way till correction

        var n = 320

        var buf = this.toneStream.read(n)
        if(!buf) {
            log(__line, 'info', this.uuid, `end of toneStream`)
            this.push(null)
            return
        }

        var buf2 = Buffer.alloc(n / 2)

        for(var i=0 ; i<n/2 ; i++) {
            // L16 little-endian
            //var val = ((buf[i*2+1] << 8) + buf[i*2])
            //buf2[i] = u.linear2ulaw(val) 

            buf2[i] = u.linear2ulaw((buf[i*2+1] << 8) + buf[i*2])
        }

        //console.log(`dtmf_generation_stream.read(${size}) pushing ${buf2.length}`)
        this.push(buf2)
    }
}

module.exports = DtmfSpeechSynthStream
