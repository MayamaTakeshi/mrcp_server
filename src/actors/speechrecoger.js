require('magic-globals')
const {spawn, dispatch, stop} = require('nact')
const mrcp = require('mrcp')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const google_sr_agent = require('./google_sr_agent.js')
const dtmf_sr_agent = require('./dtmf_sr_agent.js')

const FILE = u.filename()

const log = (level, entity, line, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

var send_start_of_input = (uuid, msg) => {
    var evt = 'START-OF-INPUT'
	var req_id = msg.data.request_id
    var req_state = 'IN-PROGRESS'
    var headers = {'channel-identifier': msg.data.headers['channel-identifier'], 'input-type': 'speech'}

	log('info', uuid, __line, `sending MRCP event ${evt} ${req_id} ${req_state} ${JSON.stringify(headers)}`)
	var event = mrcp.builder.build_event(evt, req_id, req_state, headers)
	u.safe_write(msg.conn, event)
}

var send_recognition_complete = (uuid, state, result, confidence) => {
    var evt = 'RECOGNITION-COMPLETE'
    var req_id = state.request_id
    var req_state = 'COMPLETE'
	var headers = {'channel-identifier': state.channel_identifier, 'completion-cause': '000 success', 'content-type': 'application/x-nlsml'}
	var body = `<?xml version="1.0"?>
<result>
	<interpretation grammar="${state.session_string}" confidence="${confidence}">
		<instance>${result}</instance>
		<input mode="speech">${result}</input>
	</interpretation>
</result>`

    log('info', uuid, __line, `sending MRCP event ${evt} ${req_id} ${req_state} ${JSON.stringify(headers)} ${body.replace(/\n/g, " ")}`)

	var event = mrcp.builder.build_event(evt, req_id, req_state, headers, body)
	u.safe_write(state.conn, event)
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log('info', uuid, __line, `got ${JSON.stringify(msg)}`)
		//log('info', uuid, __line, `got ${msg.type}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
            const uuid = msg.data.uuid
            const req_id = msg.data.request_id

			log('info', uuid, __line, `got MRCP message ${JSON.stringify(msg.data)}`)

			if(msg.data.method == 'DEFINE-GRAMMAR') {
                var rs = 200
                var rr = 'COMPLETE'
                var headers = {'channel-identifier': msg.data.headers['channel-identifier'], 'completion-cause': '000 success'}
                log('info', uuid, __line, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
				var response = mrcp.builder.build_response(req_id, rs, rr, headers)
				u.safe_write(msg.conn, response)
			} else if(msg.data.method == 'RECOGNIZE') {
				if(!(uuid in registrar)) {
                    var rs = 405
                    var rr = 'COMPLETE'
                    var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
                    log('info', uuid, __line, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
					var response = mrcp.builder.build_response(req_id, rs, rr, headers)
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

                var rs = 200
                var rr = 'IN-PROGRESS'
                var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
                log('info', uuid, __line, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
				var response = mrcp.builder.build_response(req_id, rs, rr, headers)
				u.safe_write(state.conn, response)

				send_start_of_input(uuid, msg)
			} else if(msg.data.method == 'STOP') {
                var rs = 200
                var rr = 'COMPLETE'
                var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
                log('info', uuid, __line, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
				var response = mrcp.builder.build_response(req_id, rs, rr, headers)
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
			log('error', uuid, __line, `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
