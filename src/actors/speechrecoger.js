const {spawn, dispatch, stop} = require('nact')
const mrcp = require('mrcp')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const speech = require('@google-cloud/speech')

const stop_myself = (state, ctx) => {
	if(state.recognizeStream) {
		state.recognizeStream.end()
		state.recognizeStream = null
	}

	stop(ctx.self)
}

var send_start_of_input = (msg) => {
	var event = mrcp.builder.build_event('START-OF-INPUT', msg.data.request_id, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier'], 'input-type': 'speech'})
	u.safe_write(msg.conn, event)
}

var send_recognition_complete = (msg, session_string, result, confidence) => {
	var body = `<?xml version="1.0"?>
<result>
	<interpretation grammar="${session_string}" confidence="${confidence}">
		<instance>${result}</instance>
		<input mode="speech">${result}</input>
	</interpretation>
</result>`

	var event = mrcp.builder.build_event('RECOGNITION-COMPLETE', msg.data.request_id, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'completion-cause': '000 success', 'content-type': 'application/x-nlsml'}, body)
	u.safe_write(msg.conn, event)
}

const setup_speechrecog = (msg, session_string, state, ctx) => {
	var config = {
		encoding: "MULAW",
		sampleRateHertz: 8000,
		languageCode: msg.data.headers['speech-language'],
		//languageCode: 'en-US', 
	}

	var request = {
		config,
		interimResults: false, 
		singleUtterance: true,
	}

	const client = new speech.SpeechClient()

	const recognizeStream = client
		.streamingRecognize(request)
		.on('error', (error) => { 
			console.error(`recognizeStream error: ${error}`)
			if(state.recognizeStream) {
				state.recognizeStream.end()
			}
			
			send_recognition_complete(msg, session_string, '', 0)
		})
		.on('data', data => {
			console.log(`RecognizeStream on data: ${JSON.stringify(data)}`)

			if(data.speechEventType == "END_OF_SINGLE_UTTERANCE" && !data.results) return

			if(!data.results[0]) return

			var transcript = data.results[0] ? data.results[0].alternatives[0].transcript : ''
			var confidence = data.results[0] ? data.results[0].alternatives[0].confidence : 0
			send_recognition_complete(msg, session_string, transcript, confidence)
		})

	return recognizeStream
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		logger.log('info', `${u.fn(__filename)} got ${msg.type}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
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

				var session_string = msg.data.body
				state.recognizeStream = setup_speechrecog(msg, session_string, state, ctx)

				registrar[uuid].rtp_session.on('data', data => {
					console.log("rtp_session data")
					console.log(data)
					if(state.recognizeStream) {
						state.recognizeStream.write(data)
					}
				})

				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)

			} else if(msg.data.method == 'STOP') {
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)
				return
			}
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
