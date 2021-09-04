const uuid_v4 = require('uuid').v4
const _ = require('lodash')

const convert = require('pcm-convert')

const GoogleSpeechRecogStream = require('../src/google_speech_recog_stream.js')
const JuliusSpeechRecogStream = require('../src/julius_speech_recog_stream.js')
const OlarisSpeechRecogStream = require('../src/olaris_speech_recog_stream.js')

function close_speech_recog_streams(self, state) {
    if(!state.sr_streams) return
    for([key, stream] of Object.entries(state.sr_streams)) {
        console.log(`Closing stream ${key}`)
        stream.removeAllListeners()
        stream.end()
        delete state.sr_streams[key]
    }
}

const float32ToInt16 = f => {
  const multiplier = f < 0 ? 0x8000 : 0x7fff; // 16-bit signed range is -32768 to 32767
  return f * multiplier;
}


function write_to_streams(self, state, data) {
    /*
    let buff = convert(data.data, 'float32', 'uint16')
    console.log("----")
    console.log(data.data)
    console.log(Buffer.from(buff))
    */

   var buff = new Uint16Array(data.data.length)
    for (let i = 0; i < data.data.length; i++) {
      buff[i] = float32ToUInt16(data.data[i])
    }

    console.log(buff)
    console.log(Buffer.from(buff))
    

    for([key, stream] of Object.entries(state.sr_streams)) {
        stream.write(Buffer.from(buff))
    }
}

function prepare_speech_recog_streams(self, state) {
    close_speech_recog_streams(self, state)

    var streams = {}

    var stream = new GoogleSpeechRecogStream(uuid_v4(), 'ja-JP', null, null)
    streams['google'] = stream

    stream.on('ready', () => {
        self({type: 'sr_ready', engine: 'google'})
    })

    stream.on('data', data => {
        self({type: 'sr_data', engine: 'google', data: data})
    })

    stream.on('error', err => {
        self({type: 'sr_error', engine: 'google', error: err})
    })
 
    stream.on('close', () => {
        self({type: 'sr_close', engine: 'google'})
    })

    state.sr_streams = streams
    state.sr_streams_pending = Object.keys(streams).length

    state.results = {'google': null}
}

module.exports = function (state) {
    var self = function (msg) {
        console.log(`request_actor got ${JSON.stringify(msg)}`)
        switch(msg.type) {
        case 'init':
            state.socket.on('start', function() {
                prepare_speech_recog_streams(self, state)
            })
            state.socket.on('audio', data => {
                //console.log(`state.socket.on audio got ${JSON.stringify(data)}`)
                if(!state.sr_streams || state.st_streams_pending > 0) return

                write_to_streams(self, state, data)
            })
            console.log("init done")
            break
        case 'sr_ready':
            state.sr_streams_pending--
            console.log(state.sr_streams_pending)
            if(state.sr_streams_pending == 0) {
                state.socket.emit('started')
            } 
            break
        case "sr_error":
            close_speech_recog_streams(self, state)
            state.socket.emit("error", msg.error)
            break
        case 'sr_data':
            state.results[msg.engine] = msg.data            
            if(_.every(state.results, x => x == null)) {
                state.socker.emit('final', state.results)
                close_speech_recog_streams(self, state)
            } else {
                state.socker.emit('partial', state.results)
            }
            break
        case 'stop':
            close_speech_recog_streams(self, state)
            state.socket.emit('stopped')
            break
        case 'terminate':
            close_speech_recog_streams(self, state)
            break
        default:
            console.error(`Unexpected msg: ${JSON.stringify(msg)}`)
        }
    }

    return self
}
