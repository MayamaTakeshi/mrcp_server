require('magic-globals')
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

const FILE = u.filename()

const log = (line, level, entity,msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log(__line, 'info', uuid, `got ${JSON.stringify(msg)}`)
		log(__line, 'info', uuid, `got ${msg.type}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
            const uuid = msg.data.uuid
            const req_id = msg.data.request_id

			log(__line, 'info', uuid, `got MRCP message ${JSON.stringify(msg.data)}`)
			if(msg.data.method == 'SPEAK') {
				state.conn = msg.conn

                var rs = 200
                var rr = 'IN-PROGRESS'
				var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
				log(__line, 'info', uuid, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
				var response = mrcp.builder.build_response(req_id, rs, rr, headers)
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
                var rs = 200
                var rr = 'COMPLETE'
				var headers =  {'channel-identifier': msg.data.headers['channel-identifier']}
				log(__line, 'info', uuid, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
				var response = mrcp.builder.build_response(req_id, rr, rs, headers)
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

            var req_id = msg.data.request_id
            var evt = 'SPEAK-COMPLETE'
            var req_state = 'COMPLETE'
            var headers = {'channel-identifier': msg.data.headers['channel-identifier'], 'Completion-Cause': cause}
            log(__line, 'info', uuid, `sending MRCP event ${evt} ${req_id} ${req_state}, ${JSON.stringify(headers)}`)
			var event = mrcp.builder.build_event(evt, req_id, req_state, headers)
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
			log(__line, 'error', uuid, `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
