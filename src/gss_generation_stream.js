require('magic-globals')

const wav = require('wav')
const textToSpeech = require('@google-cloud/text-to-speech')
const fs = require('fs')
const util = require('util')

const logger = require('./logger.js')
const u = require('./utils.js')

const ToneStream = require('tone-stream')

const stream = require('stream')

const { Readable } = require('stream')

const { EventEmitter } = require('events')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

class GssGenerationStream extends Readable {
    constructor(uuid, data) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        this.setup_speechsynth(data)
    }

    setup_speechsynth(data) {
        const client = new textToSpeech.TextToSpeechClient();

        this.outputFile = `./tmp/${this.uuid}.l16`

        const request = {
            input: data.headers['content-type'] == 'application/ssml+xml' ? { ssml: data.body } : { text: data.body },
            voice: {
                languageCode: data.headers['speech-language'],
                name: data.headers['voice-name'],
            },
            audioConfig: {
                audioEncoding: 'LINEAR16',
                sampleRateHertz: 8000,
            }
        }

        client.synthesizeSpeech(request, null, (err, response) => {
            if(err) {
                log(__line, 'error', this.uuid, `synthesizeSpeech error: ${err}`)
                this.eventEmitter.emit('error', `error: ${err}`)
                return
            }

            var bufferStream = new stream.PassThrough()

            bufferStream.end(response.audioContent)

            var writeStream = fs.createWriteStream(this.outputFile)
            var wavReader = new wav.Reader()

            wavReader.on('format', (format) => {
                wavReader.pipe(writeStream)	
            })

            writeStream.on('error', (err) => {
                if(err) {
                    var err_msg = `audio content failed to be written to file ${this.outputFile}. err=${err}`
                    log(__line, 'error', this.uuid, err_msg)
                    this.eventEmitter.emit('error', `error: ${err_msg}`)
                    return
                }
            })

            writeStream.on('finish', () => {
                log(__line, 'info', this.uuid, `audio content written to file: ${this.outputFile}`)

                fs.open(this.outputFile, 'r', (err, fd) => {
                    if(err) {
                        var err_msg = `failed to open ${msg.path}`
                        log(__line, 'error', this.uuid, err_msg)
                        this.eventEmitter.emit('error', `error: ${err_msg}`)
                        return
                    }

                    this.fd = fd

                    this.eventEmitter.emit('ready')
                })

                client.close()
                .then(res => {
                    log(__line, 'info', this.uuid, `text-to-speech client closed successfully`)
                })
                .catch(err => {
                    log(__line, 'error', this.uuid, `text-to-speech client closure failed: ${err}`)
                })

                return
            })

            bufferStream.pipe(wavReader)
        })
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _read(size) {
        console.log(`gss_generation_stream.read(${size})`)
        // we ignore size and always process it as 320 (we could set it as a parameter in the constructor). This is OK:
        // The _read function will also get a provisional size parameter as its first argument that specifies how many bytes the consumer wants to read, but your readable stream can ignore the size if it wants.
        // Ref: https://github.com/substack/stream-handbook

        var n = 320

        var buf = Buffer.alloc(n)
        var buf2 = Buffer.alloc(n/2)

        fs.read(this.fd, buf, 0, n, null, (err, len) => {
            if(err) {
                var err_msg = `reading ${msg.path} failed with ${err}`
                log(__line, 'error', this.uuid, err_msg)
                this.eventEmitter.emit('error', `error: ${err_msg}`)
                return
            }

            if(len == 0) {
                log(__line, 'info', this.uuid, `reading ${this.outputFile} reached end of file`)
                    
                this.push(null)
                return
            }

            for(var i=0 ; i<n/2 ; i++) {
                // L16 little-endian
                buf2[i] = u.linear2ulaw((buf[i*2+1] << 8) + buf[i*2])
            }

            console.log(`gss_generation_stream.read(${size}) pushing ${buf2.length}`)
            this.push(buf2)
        })
    }
}

module.exports = GssGenerationStream
