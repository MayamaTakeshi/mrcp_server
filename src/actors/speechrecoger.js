const {spawn, dispatch, stop} = require('nact')
const mrcp = require('mrcp')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const google_sr_agent = require('./google_sr_agent.js')
const dtmf_sr_agent = require('./dtmf_sr_agent.js')

var send_start_of_input = (uuid, msg) => {
	logger.log('info', uuid, `${u.fn(__filename)} sending event START-OF-INPUT}`)
	var event = mrcp.builder.build_event('START-OF-INPUT', msg.data.request_id, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier'], 'input-type': 'speech'})
	u.safe_write(msg.conn, event)
}

var send_recognition_complete = (uuid, state, result, confidence) => {
	logger.log('info', uuid, `${u.fn(__filename)} sending event RECOGNITION-COMPLETE ${result}}`)
	var body = `<?xml version="1.0"?>
<result>
	<interpretation grammar="${state.session_string}" confidence="${confidence}">
		<instance>${result}</instance>
		<input mode="speech">${result}</input>
	</interpretation>
</result>`

	var event = mrcp.builder.build_event('RECOGNITION-COMPLETE', state.request_id, 'COMPLETE', {'channel-identifier': state.channel_identifier, 'completion-cause': '000 success', 'content-type': 'application/x-nlsml'}, body)
	u.safe_write(state.conn, event)
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', 'speechrecoger', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		//logger.log('info', 'speechrecoger', `${u.fn(__filename)} got ${msg.type}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
            const uuid = msg.data.uuid
			logger.log('info', uuid, JSON.stringify(msg.data))
			if(msg.data.method == 'DEFINE-GRAMMAR') {
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'completion-cause': '000 success'})
				u.safe_write(msg.conn, response)
			} else if(msg.data.method == 'RECOGNIZE') {
				if(!(uuid in registrar)) {
					var response = mrcp.builder.build_response(msg.data.request_id, 405, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
					u.safe_write(msg.conn, response)
					stop_myself(state, ctx)
					return
				}

				state.uuid = uuid
				state.session_string = msg.data.body

				state.channel_identifier = msg.data.headers['channel-identifier']
				state.request_id = msg.data.request_id
				state.conn = msg.conn

				if(state.agent) {
					dispatch(state.agent, {type: MT.TERMINATE})
				}

				if(msg.data.headers['speech-language'] == 'dtmf') {
					state.agent = dtmf_sr_agent(ctx.self, uuid)
				} else {
					state.agent = google_sr_agent(ctx.self, uuid)
				}

				dispatch(state.agent, {type: MT.START, data: msg.data})

				logger.log('info', uuid, `${u.fn(__filename)} sending reply 200 IN-PROGRESS`)
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(state.conn, response)

				send_start_of_input(uuid, msg)
			} else if(msg.data.method == 'STOP') {
				logger.log('info', uuid, `${u.fn(__filename)} sending reply 200 COMPLETE`)
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)

				if(state.agent) {
					dispatch(state.agent, {type: MT.TERMINATE})
				}
				state.agent = null

				stop(ctx.self)
			}
			return state
		} else if(msg.type == MT.TERMINATE) {
			if(state.agent) {
				dispatch(state.agent, {type: MT.TERMINATE})
			}
			state.agent = null

			stop(ctx.self)
			return
		} else if(msg.type == MT.RECOGNITION_COMPLETED) {
			send_recognition_complete(uuid, state, msg.data.transcript, msg.data.confidence)
			state.recognition_ongoing = false
			if(state.recognizeStream) {
				state.recognizeStream.end()
				state.recognizeStream = null
			}
			return state
		} else if(msg.type == MT.RECOGNITION_COMPLETED_WITH_ERROR) {
			send_recognition_complete(uuid, state, msg.data.transcript, msg.data.confidence)
			state.recognition_ongoing = false
			if(state.recognizeStream) {
				state.recognizeStream.end()
				state.recognizeStream = null
			}
			return state
		} else {
			logger.log('error', uuid, `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
