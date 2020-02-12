const {spawn, dispatch} = require('nact')
const mrcp = require('mrcp')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const speech = require('@google-cloud/speech');

var send_start_of_input = (msg) => {
	var event = mrcp.builder.build_event('START-OF-INPUT', msg.data.request_id, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier'], 'input-type': 'speech'})
	u.safe_write(msg.conn, event)
}

var send_recognition_complete = (msg, session_string, result) => {
	var body = `<?xml version="1.0"?>
<result>
	<interpretation grammar="${session_string}" confidence="0.96">
		<instance>${result}</instance>
		<input mode="speech">${result}</input>
	</interpretation>
</result>`

	var content_length = body.length

	var event = mrcp.builder.build_event('RECOGNITION-COMPLETE', msg.data.request_id, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'completion-cause': '000 success', 'content-type': 'application/x-nlsml', 'content-length': content_length}, body)
	u.safe_write(msg.conn, event)
}

var setup_speechrecog = (msg, session_string) => {
	var config = {
		encoding: "MULAW",
		sampleRateHertz: 8000,
		languageCode: msg.data.headers['speech-language'],
	}

	var request = {
		config,
		interimResults: false, //Get interim results from stream
	}

	const client = new speech.SpeechClient()

	const recognizeStream = client
		.streamingRecognize(request)
		.on('error', (error) => { console.error(`recognizeStream error: ${error}`); process.exit(1) })
		.on('data', data => {
			send_recognition_complete(msg, session_string, data.results[0])
		})

	return recognizeStream
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
			if(msg.data.method == 'DEFINE-GRAMMAR') {
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'completion-cause': '000 success'})
				u.safe_write(msg.conn, response)
			} else if(msg.data.method == 'RECOGNIZE') {
				if(! uuid in registrar) {
					var response = mrcp.builder.build_response(msg.data.request_id, 405, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
					u.safe_write(msg.conn, response)
					return
				}

				var session_string = msg.data.body
				var recognizeStream = setup_speechrecog(msg, session_string)

				registrar[uuid].rtp_socket.on('data', data => {
					recognizeStream.write(data.payload)
				})

				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)

			} else if(msg.data.method == 'STOP') {
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
