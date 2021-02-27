require('magic-globals')
const {spawn, dispatch, stop} = require('nact')
const mrcp = require('mrcp')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const DtmfSpeechRecogStream = require('../dtmf_speech_recog_stream.js')
const GoogleSpeechRecogStream = require('../google_speech_recog_stream.js')

const FILE = u.filename()

const log = (line, level,entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

const stop_myself = (state, ctx) => {
    log(__line, 'info', state.uuid, 'stop_myself')

    if(state.stream) state.stream.close()
    state.ready = false

    stop(ctx.self)
}

const send_in_progress = (uuid, req_id, msg) => {
    var rs = 200
    var rr = 'IN-PROGRESS'
    var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
    log(__line, 'info', uuid, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
    var response = mrcp.builder.build_response(req_id, rs, rr, headers)
    u.safe_write(msg.conn, response)
}

var send_start_of_input = (uuid, msg) => {
    var evt = 'START-OF-INPUT'
	var req_id = msg.data.request_id
    var req_state = 'IN-PROGRESS'
    var headers = {'channel-identifier': msg.data.headers['channel-identifier'], 'input-type': 'speech'}

	log(__line, 'info', uuid, `sending MRCP event ${evt} ${req_id} ${req_state} ${JSON.stringify(headers)}`)
	var event = mrcp.builder.build_event(evt, req_id, req_state, headers)
	u.safe_write(msg.conn, event)
}

var send_stop_reply = (uuid, msg) => {
    var rs = 200
    var rr = 'COMPLETE'
    var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
    log(__line, 'info', uuid, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
    var response = mrcp.builder.build_response(req_id, rs, rr, headers)
    u.safe_write(msg.conn, response)
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

    log(__line, 'info', uuid, `sending MRCP event ${evt} ${req_id} ${req_state} ${JSON.stringify(headers)} ${body.replace(/\n/g, " ")}`)

	var event = mrcp.builder.build_event(evt, req_id, req_state, headers, body)
	u.safe_write(state.conn, event)
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log(__line, 'info', uuid, `got ${JSON.stringify(msg)}`)
		//log(__line, 'info', uuid, `got ${msg.type}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
            const uuid = msg.data.uuid
            const req_id = msg.data.request_id

			log(__line, 'info', uuid, `got MRCP message ${JSON.stringify(msg.data)}`)

			if(msg.data.method == 'DEFINE-GRAMMAR') {
                var rs = 200
                var rr = 'COMPLETE'
                var headers = {'channel-identifier': msg.data.headers['channel-identifier'], 'completion-cause': '000 success'}
                log(__line, 'info', uuid, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
				var response = mrcp.builder.build_response(req_id, rs, rr, headers)
				u.safe_write(msg.conn, response)
			} else if(msg.data.method == 'RECOGNIZE') {
                if(!registrar.hasOwnProperty(uuid)) {
                    var rs = 405
                    var rr = 'COMPLETE'
                    var headers = {'channel-identifier': msg.data.headers['channel-identifier']}
                    log(__line, 'info', uuid, `sending MRCP response ${req_id} ${rs} ${rr} ${JSON.stringify(headers)}`)
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

				var language = msg.data.headers['speech-language']

				if(language == 'dtmf') {
					state.stream = new DtmfSpeechRecogStream(uuid, language)
				} else {
				    state.stream = new GoogleSpeechRecogStream(uuid, language)
				}

                state.stream.on('ready', () => {
                    send_in_progress(uuid, req_id, msg)
				    send_start_of_input(uuid, msg)

                    state.ready = true

                    state.rtp_data_handler = data => {
                        log(__line, 'debug', uuid, "rtp_session data " + data.length)
                        if(state.ready) {
                            var res = state.stream.write(data)
                        }
                    }

                    registrar[uuid].rtp_session.on('data', state.rtp_data_handler)
                })

                state.stream.on('data', data => {
                    send_recognition_complete(uuid, state, data.transcript, data.confidence)
                    state.stream.end()
                    state.stream = null
                    state.ready = false
                })
			} else if(msg.data.method == 'STOP') {
                send_stop_reply(uuid, msg)

				stop_myself(state, ctx)
			}
			return state
		} else if(msg.type == MT.TERMINATE) {
			stop_myself(state, ctx)
			return state
		} else {
			log(__line, 'error', uuid, `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
