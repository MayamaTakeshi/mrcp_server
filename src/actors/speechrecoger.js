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

	if(state.speechClient) {
		state.speechClient.close()
		state.speechClient = null
	}

	stop(ctx.self)
}

var send_start_of_input = (msg) => {
	logger.log('info', `${u.fn(__filename)} sending event START-OF-INPUT}`)
	var event = mrcp.builder.build_event('START-OF-INPUT', msg.data.request_id, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier'], 'input-type': 'speech'})
	u.safe_write(msg.conn, event)
}

var send_recognition_complete = (state, result, confidence) => {
	logger.log('info', `${u.fn(__filename)} sending event RECOGNITION-COMPLETE ${result}}`)
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

	state.speechClient = new speech.SpeechClient()

	const recognizeStream = state.speechClient
		.streamingRecognize(request)
		.on('error', (error) => { 
			console.error(`recognizeStream error: ${error}`)
			dispatch(ctx.self, {
				type: MT.RECOGNITION_COMPLETED,
				data: {
					transcript: '',
					confidence: 0,
				},
			})
		})
		.on('data', data => {
			console.log(`RecognizeStream on data: ${JSON.stringify(data)}`)

			if(data.speechEventType == "END_OF_SINGLE_UTTERANCE" && !data.results) return

			if(!data.results[0]) return

			dispatch(ctx.self, {
				type: MT.RECOGNITION_COMPLETED,
				data: {
					transcript: data.results[0] ? data.results[0].alternatives[0].transcript : '',
					confidence: data.results[0] ? data.results[0].alternatives[0].confidence : 0,
				},
			})
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
			logger.log('info', JSON.stringify(msg.data))
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

				state.session_string = msg.data.body
				state.recognizeStream = setup_speechrecog(msg, state.session_string, state, ctx)
				state.channel_identifier = msg.data.headers['channel-identifier']
				state.request_id = msg.data.request_id
				state.conn = msg.conn

				registrar[uuid].rtp_session.on('data', data => {
					//console.log("rtp_session data")
					//console.log(data)
					if(state.recognizeStream) {
						state.recognizeStream.write(data)
					}
				})

				logger.log('info', `${u.fn(__filename)} sending reply 200 IN-PROGRESS}`)
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)

			} else if(msg.data.method == 'STOP') {
				logger.log('info', `${u.fn(__filename)} sending reply 200 COMPLETE}`)
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)
				if(state.recognizeStream) {
					state.recognizeStream.end()
					state.recognizeStream = null
				}
				return
			}
			return state
		} else if(msg.type == MT.TERMINATE) {
			stop_myself(state, ctx)
			return
		} else if(msg.type == MT.RECOGNITION_COMPLETED) {
			send_recognition_complete(state, msg.data.transcript, msg.data.confidence)
			stop_myself(state, ctx)
			return
		} else {
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
