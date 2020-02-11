const {spawn, dispatch} = require('nact')
const mrcp = require('mrcp')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

module.exports = (parent) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
			if(msg.data.method == 'SPEAK') {
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)
				state.completion_timer = setTimeout(() => {
					var event = mrcp.builder.build_event('SPEAK-COMPLETE', msg.data.request_id, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'Completion-Cause': '000 normal'})
					u.safe_write(msg.conn, event)
					state.completion_timer = null
				}, 10000)
			} else if(msg.data.method == 'STOP') {
				if(state.completion_timer) {
					clearTimeout(state.completion_timer)	
				} else {
					logger.log('error', 'COMPLETION_TIMER NOT SET!!!')
				}

				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)
			}
			return state
		} else {
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
