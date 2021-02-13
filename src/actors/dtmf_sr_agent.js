require('magic-globals')
const {spawn, dispatch, stop} = require('nact')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const DtmfDetectionStream = require('dtmf-detection-stream')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

const stop_myself = (state, ctx) => {
	log(__line, 'info', state.uuid, "stop_myself")

	if(state.timer_id) {
		clearInterval(state.timer_id)
		state.timer_id = null
	}
	stop(ctx.self)
}

const setup_speechrecog = (msg, state, ctx, parent) => {
	var format = {
		sampleRate: 8000,
		bitDepth: 16,
		channels: 1,
	}

	state.dds = new DtmfDetectionStream(format, {numSamples: 1000})
	state.digits = ""

	state.dds.on('digit', digit => {
		state.digits += digit
		state.last_digit_time = new Date()
	})

	state.timer_id = setInterval(() => {
		var now = new Date()
		var diff = now.getTime() - state.last_digit_time.getTime()
		if(state.digits != "" && diff > 500) {
			dispatch(parent, {
				type: MT.RECOGNITION_COMPLETED,
				data: {
					transcript: state.digits,
					confidence: 100.0,
				},
			})
		}
	}, 100)
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log(__line, 'info', uuid, `got ${JSON.stringify(msg)}`)
		log(__line, 'info', uuid, `got ${msg.type}`)
		if(msg.type == MT.START) {
			state.uuid = uuid

			setup_speechrecog(msg, state, ctx, parent)

			state.last_digit_time = new Date()

			state.rtp_data_handler = data => {
				//log(__line, 'debug', uuid, "rtp_session data " + data)
				if(state.dds) {
					var buf = Buffer.alloc(data.length * 2)

					for(var i=0 ; i<data.length ; i++) {
						// convert ulaw to L16 little-endian
						var l = u.ulaw2linear(data[i])
						buf[i*2] = l & 0xFF
						buf[i*2+1] = l >>> 8
					}

					var res = state.dds.write(buf)
				}
			}

			registrar[uuid].rtp_session.on('data', state.rtp_data_handler)

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
