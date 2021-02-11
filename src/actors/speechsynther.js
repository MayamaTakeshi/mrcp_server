const {spawn, dispatch, stop} = require('nact')
const mrcp = require('mrcp')

const fs = require('fs')

const wav = require('wav')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const google_ss_agent = require('./google_ss_agent.js')
const dtmf_ss_agent = require('./dtmf_ss_agent.js')

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		logger.log('info', `${u.fn(__filename)} got ${msg.type}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
			logger.log('info', JSON.stringify(msg.data))
			if(msg.data.method == 'SPEAK') {
				logger.log('info', `${u.fn(__filename)} sending reply 200 IN-PROGRESS`)
				state.conn = msg.conn
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(state.conn, response)

				if(state.agent) {
					dispatch(state.agent, {type: MT.TERMINATE})
				}

				if(msg.data.headers['speech-language'] == 'dtmf') {
					state.agent = dtmf_ss_agent(ctx.self, uuid)
				} else {
					state.agent = google_ss_agent(ctx.self, uuid)
				}
				dispatch(state.agent, {type: MT.START, data: msg.data})
			} else if(msg.data.method == 'STOP') {
				logger.log('info', `${u.fn(__filename)} sending reply 200 COMPLETE`)
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)

				if(state.agent) {
					dispatch(state.agent, {type: MT.TERMINATE})
				}
				state.agent = null

				stop(ctx.self)
			}
			return state
		} else if(msg.type == MT.MEDIA_OPERATION_COMPLETED) {
            var cause = msg.data.headers['completion-cause']
            if(!cause) {
                cause = '000 normal'
            }
			var event = mrcp.builder.build_event('SPEAK-COMPLETE', msg.data.request_id, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'Completion-Cause': cause})
			u.safe_write(state.conn, event)
			state.agent = null
			return state
		} else if(msg.type == MT.TERMINATE) {
			if(state.agent) {
				dispatch(state.agent, {type: MT.TERMINATE})
			}
			state.agent = null

			stop(ctx.self)
			return
		} else {
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
