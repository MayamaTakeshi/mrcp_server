require('magic-globals')

const logger = require('./logger.js')
const u = require('./utils.js')

const { Writable } = require('stream')

const { EventEmitter } = require('events')

const _ = require('lodash')

const SpeechRecogStream = require('speech-recog-stream')

const WebSocket = require('ws')

const FILE = u.filename()


const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

// issue_one_time_token
async function issueToken(config) {
  const options = {
    method: 'POST',
    uri: `https://${config.api_base}/v1/issue_token/`,
    headers: {
      'accept': 'text/html',
      'Authorization': `Bearer ${config.api_key}`,
      'Content-type': 'application/json'
    },
    body: {
      product_name: config.product_name,
      organization_id: config.organization_id,
      user_id: config.user_id
    },
    json: true
  }
  let token = null
  const rp = require('request-promise')
  await rp(options)
    .then(res => {
      token = res
    })
    .catch(err => {
      console.error(err)
    })
  return token
}


class OlarisSpeechRecogStream extends Writable {
    constructor(uuid, language, context, config) {
        super()

        this.uuid = uuid

        this.eventEmitter = new EventEmitter()

        this.setup_speechrecog(language, context, config)

        this.start_of_input = false

        this.language = language

        this.src_encoding = config.src_encoding
    }

    async setup_speechrecog(language, context, config) {
        const self = this

        const accessToken = await issueToken(config)
        if (accessToken === null) {
            setTimeout(() => {
                self.eventEmitter.emit('error', 'could_not_obtain_token')
            }, 0)
            return
        }

        try {
            const ws = new WebSocket(`wss://${config.api_base}/ws/`)
            self.ws = ws


            ws.onopen = function() {
                let msg = {
                    access_token: accessToken,
                    type: 'start',
                    sampling_rate: 8000,
                    product_name: config.product_name,
                    organization_id: config.organization_id,
                    model_alias: 'MODEL_JA_BUSINESS',
                }

                if(context) {
                    console.log(context)
                    if(context.elements[0].elements) {
                        var phrases = _.map(context.elements[0].elements, e => e.elements[0].text)

                        msg.words = phrases
                    }
                }

                console.log(msg)
                
                ws.send(JSON.stringify(msg))

                self.eventEmitter.emit('ready')
            }

            ws.onmessage = function (event) {
                const res = JSON.parse(event.data)
                if (res.type === 'end') {
                    console.log(res.result)

                    self.eventEmitter.emit('data', {
                        transcript: res.result,
                        confidence: 1.0,
                    })
                }
            }
        } catch (err) {
            log(__line, 'error', self.uuid, err) 
            setTimeout(() => {
                self.eventEmitter('error', 'failed_to_establish_websocket_connection')
            }, 0)

            return
        }
    }

    on(evt, cb) {
        super.on(evt, cb)

        this.eventEmitter.on(evt, cb)
    }

    _write(data, enc, callback) {
        //console.log(`_write got ${data.length}`)

        var buf
        var bufferArray

        if(this.src_encoding == 'l16') {
            buf = []

            for(var i=0 ; i<data.length/2 ; i++) {
                buf[i] = (data[i*2+1] << 8) + data[i*2]
            }

            bufferArray = Array.prototype.slice.call(buf)
        } else {
            // Convert from ulaw to L16 little-endian 

            buf = []

            for(var i=0 ; i<data.length ; i++) {
                buf[i] = u.ulaw2linear(data[i])
            }
            bufferArray =  Array.prototype.slice.call(buf)
        }

        var msg = {
            type: 'streamAudio',
            stream: bufferArray
        }
        //console.log(bufferArray)
        this.ws.send(JSON.stringify(msg))

        callback()

        return true
    }

    _final(callback) {
        log(__line, 'info', this.uuid, '_final')

        this.eventEmitter.removeAllListeners()
        if(this.ws) {
            this.ws.close()
            this.ws = null
        }

        callback()
    }
}

module.exports = OlarisSpeechRecogStream
