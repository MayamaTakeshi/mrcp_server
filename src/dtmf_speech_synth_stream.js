require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const ToneStream = require('tone-stream')

const { Readable } = require('stream')

const { EventEmitter } = require('events')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class DtmfSpeechSynthStream extends Readable {
    constructor(uuid, data) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        var digits = data.body

        if(digits.match(/[^0-9a-fA-F\*\#]/)) {
            setTimeout(() => {
                this.eventEmitter.emit('error', `parse-failure: invalid DTMF sequence '${digits}'`)
            }, 0)

            return
        }
            
        const format = {
            sampleRate: 8000,
            bitDepth: 16,
            channels: 1,
        }

        this.toneStream = new ToneStream(format)

        this.toneStream.add([800, 's'])    // silence

        for(var i=0 ; i<digits.length ; i++) {
            this.toneStream.add([400, 's'])    // silence
            this.toneStream.add([800, 'DTMF:' + digits.charAt(i)]) 
        }

        this.toneStream.add([400, 's'])    // silence

        setTimeout(() => {
            this.eventEmitter.emit('ready')
        }, 0) 
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
