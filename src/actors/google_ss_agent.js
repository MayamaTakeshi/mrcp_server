require('magic-globals')
const {spawn, dispatch, stop} = require('nact')

const fs = require('fs')

const wav = require('wav')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const stream = require('stream')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

const stop_myself = (state, ctx) => {
	stop_speak(state)
	stop(ctx.self)
}

const setup_speechsynth = (ctx, uuid, data, state) => {
	const textToSpeech = require('@google-cloud/text-to-speech');
	const fs = require('fs');
	const util = require('util');

	const client = new textToSpeech.TextToSpeechClient();

	const outputFile = `./tmp/${uuid}.l16`

	const request = {
		input: data.headers['content-type'] == 'application/ssml+xml' ? { ssml: data.body } : { text: data.body },
		voice: {
			languageCode: data.headers['speech-language'],
			name: data.headers['voice-name'],
		},
		audioConfig: {
			audioEncoding: 'LINEAR16',
			sampleRateHertz: 8000,
		}
	}

	console.dir(request)

	client.synthesizeSpeech(request, null, (err, response) => {
		if(state.aborted) return

		if(err) {
			log(__line, 'error', uuid, `synthesizeSpeech error: ${err}`)
			return
		}

		var bufferStream = new stream.PassThrough()

		bufferStream.end(response.audioContent)

		var writeStream = fs.createWriteStream(outputFile)
		var wavReader = new wav.Reader()

		wavReader.on('format', (format) => {
			if(state.aborted) return

			wavReader.pipe(writeStream)	
		})

		writeStream.on('error', (err) => {
			if(state.aborted) return

			if(err) {
				log(__line, 'error', uuid, `audio content failed to be written to file ${outputFile}. err=${err}`)
				return
			}
		})

		writeStream.on('finish', () => {
			if(state.aborted) return

			log(__line, 'info', uuid, `audio content written to file: ${outputFile}`)
			dispatch(ctx.self, {type: MT.TTS_FILE_READY, data: data, path: outputFile})

			client.close()
			.then(res => {
				log(__line, 'info', uuid, `text-to-speech client closed successfully}`)
			})
			.catch(err => {
				log(__line, 'error', uuid, `text-to-speech client closure failed: ${err}`)
			})
		})

		bufferStream.pipe(wavReader)
	})
}

var stop_speak = (state) => {
	if(state.path) {
		fs.unlink(state.path, () => {})
		state.path = null
	}
	if(state.timer_id) {
		clearInterval(state.timer_id)
		state.timer_id = null
	}
	state.aborted = true
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log(__line, 'info', uuid, `got ${JSON.stringify(msg)}`)
		log(__line, 'info', uuid, `got ${msg.type}`)
		if(msg.type == MT.START) {
			setup_speechsynth(ctx, uuid, msg.data, state)
			return state
		} else if(msg.type == 'TTS_FILE_READY') {
			if(state.aborted) return

            if(!registrar.hasOwnProperty(uuid)) return 

			state.path = msg.path

			fs.open(msg.path, 'r', (err, fd) => {
				if(state.aborted) return

				if(err) {
					log(__line, 'error', uuid, `failed to open ${msg.path}`)
					return
				}

				var buf = Buffer.alloc(320)
				var buf2 = Buffer.alloc(160)

				state.timer_id = setInterval(() => {
					if(state.aborted) return

                    if(!registrar.hasOwnProperty(uuid)) {
						stop_speak(state)
						return
					}

					fs.read(fd, buf, 0, 320, null, (err, len) => {
						if(state.aborted) return
						
						if(err) {
							log(__line, 'error', uuid, `reading ${msg.path} failed with ${err}`)
							stop_speak(state)
							return
						}

                        if(!registrar.hasOwnProperty(uuid)) { 
							stop_speak(state)
							return
						}

						var data = registrar[uuid]

						if(len == 0) {
							log(__line, 'info', uuid, `reading ${msg.path} reached end of file`)
								
							dispatch(parent, {type: MT.MEDIA_OPERATION_COMPLETED, data: msg.data})
							stop_myself(state, ctx)
							return
						}

						for(var i=0 ; i<160 ; i++) {
							// L16 little-endian
							buf2[i] = u.linear2ulaw((buf[i*2+1] << 8) + buf[i*2])
						}
						
						registrar[uuid].rtp_session.send_payload(buf2)
					})
				}, 19) // ptime=20ms (so we will use 19ms to minimize lag)
			})
			return state
		} else if(msg.type == MT.TERMINATE) {
			stop_myself(state, ctx)
			return
		} else {
			log(__line, 'error', uuid, `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
