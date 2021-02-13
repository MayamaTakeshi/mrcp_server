require('magic-globals')
const {spawn, dispatch, stop} = require('nact')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const ToneStream = require('tone-stream')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

const stop_myself = (state, ctx) => {
    log(__line, 'info', state.uuid, 'stop_myself')
	stop_speak(state)
	stop(ctx.self)
}

var stop_speak = (state) => {
	if(state.timer_id) {
		clearInterval(state.timer_id)
		state.timer_id = null
	}
	state.aborted = true
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log(__line, 'info', uuid, `got ${JSON.stringify(msg)}`)
		log(__line, 'info', uuid, `got ${msg.type}`)
		if(msg.type == MT.START) {
            state.uuid = uuid

            if(!registrar.hasOwnProperty(uuid)) return

			const format = {
				sampleRate: 8000,
				bitDepth: 16,
				channels: 1
			}

			state.tone_stream = new ToneStream(format)

            var tones = msg.data.body
            if(tones.match(/[^0-9a-fA-F\*\#]/)) {
                msg.data.headers['completion-cause'] = '002 parse-failure'
                dispatch(parent, {type: MT.MEDIA_OPERATION_COMPLETED, data: msg.data})
                stop_myself(state, ctx)
                return
            }

			for(var i=0 ; i<tones.length ; i++) {
				state.tone_stream.add([400, 's'])    // silence
				state.tone_stream.add([800, 'DTMF:' + tones.charAt(i)]) 
			}

			state.tone_stream.add([400, 's'])    // silence

			state.timer_id = setInterval(() => {
				if(state.aborted) return

                if(!registrar.hasOwnProperty(uuid)) {
					stop_speak(state)
					return
				}

				var buf = state.tone_stream.read(320)
				if(!buf) {
						dispatch(parent, {type: MT.MEDIA_OPERATION_COMPLETED, data: msg.data})
						stop_myself(state, ctx)
						return
				}

				var buf2 = Buffer.alloc(160)

				for(var i=0 ; i<160 ; i++) {
					// L16 little-endian
					var val = ((buf[i*2+1] << 8) + buf[i*2])

					buf2[i] = u.linear2ulaw(val) 
				}

				registrar[uuid].rtp_session.send_payload(buf2)
			}, 19) // ptime=20ms (so we will use 19ms to minimize lag)
			return state
		} else if(msg.type == MT.TERMINATE) {
			stop_myself(state, ctx)
			return
		} else {
			log(__line, 'error', uuid, `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
