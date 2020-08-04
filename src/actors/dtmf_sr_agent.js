const {spawn, dispatch, stop} = require('nact')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const DtmfDetectionStream = require('dtmf-detection-stream')

const stop_myself = (state, ctx) => {
	console.log("stop_myself")

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

	state.dds = new DtmfDetectionStream(format)
	state.digits = ""

	state.dds.on('digit', digit => {
		state.digits += digit
	})

	state.timer_id = setInterval(() => {
		var timeDiff = 300
		if(state.digits != "" && timeDiff > 200) {
			dispatch(parent, {
				type: MT.RECOGNITION_COMPLETED,
				data: {
					transcript: state.digits,
					confidence: 100.0,
				},
			})
		}
	}, 50)
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		logger.log('info', `${u.fn(__filename)} got ${msg.type}`)
		if(msg.type == MT.START) {
			state.uuid = uuid

			setup_speechrecog(msg, state, ctx, parent)

			state.rtp_data_handler = data => {
				console.log("rtp_session data")
				console.log(data)
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
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
