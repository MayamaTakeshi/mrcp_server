const {spawn, dispatch, stop} = require('nact')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const speech = require('@google-cloud/speech')

const speechClient = new speech.SpeechClient()

const stop_myself = (state, ctx) => {
	console.log("stop_myself")
	if(state.recognizeStream) {
		state.recognizeStream.end()
		state.recognizeStream = null
	}

	stop(ctx.self)
}

const setup_speechrecog = (msg, state, ctx, parent) => {
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



	if(!state.recognizeStream) {
		logger.log('debug', 'Creating RecognizeStream')
		state.recognizeStream = speechClient
			.streamingRecognize(request)
			.on('error', (error) => { 
				logger.log('error', `recognizeStream error: ${error}`)
				dispatch(parent, {
					type: MT.RECOGNITION_COMPLETED_WITH_ERROR,
					data: {
						transcript: '',
						confidence: 0,
					},
				})
			})
			.on('data', data => {
				logger.log('info', `${u.fn(__filename)} RecognizeStream on data: ${JSON.stringify(data)}`)

				var transcript = data.results && data.results[0] ? data.results[0].alternatives[0].transcript : ''
				var confidence = data.results && data.results[0] ? data.results[0].alternatives[0].confidence : 0

				/*
				if(data.speechEventType == "END_OF_SINGLE_UTTERANCE") {
					logger.log('error', 'Unexpected END_OF_SINGLE_UTTERANCE')

					dispatch(ctx.self, {
						type: MT.RECOGNITION_COMPLETED_WITH_ERROR,
						data: {
							transcript: transcript,
							confidence: confidence,
						},
					})
					return
				}
				*/

				if(!data.results) return

				if(!data.results[0]) return

				dispatch(parent, {
					type: MT.RECOGNITION_COMPLETED,
					data: {
						transcript: transcript,
						confidence: confidence,
					},
				})
			})
			.on('close', data => {
				logger.log('error', `${u.fn(__filename)} RecognizeStream closed`)
				dispatch(parent, {
					type: MT.RECOGNITION_COMPLETED_WITH_ERROR,
					data: {
						transcript: '',
						confidence: 0,
					},
				})
			})
	}
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		logger.log('info', `${u.fn(__filename)} got ${msg.type}`)
		if(msg.type == MT.START) {
			state.uuid = uuid

			setup_speechrecog(msg, state, ctx, parent)

			state.recognition_ongoing = true

			state.rtp_data_handler = data => {
				//console.log("rtp_session data")
				//console.log(data)
				if(state.recognizeStream) {
					var res = state.recognizeStream.write(data)
					//logger.log('debug', `${uuid} recognizeStream.write() res=${res}`)
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
