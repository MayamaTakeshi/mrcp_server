const {spawn, dispatch} = require('nact')
const mrcp = require('mrcp')

const fs = require('fs')

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const registrar = require('../registrar.js')

const setup_speechsynth = (ctx, uuid, data, conn) => {
	const textToSpeech = require('@google-cloud/text-to-speech');
	const fs = require('fs');
	const util = require('util');

	const client = new textToSpeech.TextToSpeechClient();

	const text = "Hello. Good Morning. Let's get some breakfast."
	const outputFile = `/root/tmp/${uuid}.l16`

	const request = {
		input: {
			text: text
		},
		voice: {
			languageCode: 'en-US',
			ssmlGender: 'FEMALE',
		},
		audioConfig: {
			audioEncoding: 'LINEAR16',
			sampleRateHertz: 8000,
		}
	}

	client.synthesizeSpeech(request, null, (err, response) => {
		if(err) {
			logger.log('error', `synthesizeSpeech error: ${err}`)
			return
		}
		fs.writeFile(outputFile, response.audioContent, null, (err) => {
			if(err) {
				logger.log('error', `Audio content failed to be written to file ${outputFile}. err=${err}`)
			} else {
				logger.log('info', `Audio content written to file: ${outputFile}`)
				dispatch(ctx.self, {type: MT.TTS_FILE_READY, data: data, conn: conn, path: outputFile})
			}
		})
	})
}

const exp_lut = [0,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3,
				 4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,
				 5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
				 5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
				 6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
				 6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
				 6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
				 6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
				 7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7]

const BIAS = 0x84   /* define the add-in bias for 16 bit samples */
const CLIP = 32635

const linear2ulaw = (sample) => {
	var sign, exponent, mantissa
	var ulawbyte

	/* Get the sample into sign-magnitude. */
	sign = (sample >> 8) & 0x80;		/* set aside the sign */
	if (sign != 0) sample = -sample;		/* get magnitude */
	if (sample > CLIP) sample = CLIP;		/* clip the magnitude */

	/* Convert from 16 bit linear to ulaw. */
	sample = sample + BIAS;
	exponent = exp_lut[(sample >> 7) & 0xFF];
	mantissa = (sample >> (exponent + 3)) & 0x0F;
	ulawbyte = ~(sign | (exponent << 4) | mantissa);

/*
//#ifdef ZEROTRAP
*/
	if (ulawbyte == 0) ulawbyte = 0x02;	// optional CCITT trap
/*
//#endif
*/

	return ulawbyte
}

module.exports = (parent, uuid) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		if(msg.type == MT.START) {
			return state
		} else if(msg.type == MT.MRCP_MESSAGE) {
			if(msg.data.method == 'SPEAK') {
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'IN-PROGRESS', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)

				setup_speechsynth(ctx, uuid, msg.data, msg.conn)
			} else if(msg.data.method == 'STOP') {
				var response = mrcp.builder.build_response(msg.data.request_id, 200, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier']})
				u.safe_write(msg.conn, response)
			}
			return state
		} else if(msg.type == 'TTS_FILE_READY') {
			if(!(uuid in registrar)) return

			fs.open(msg.path, 'r', (err, fd) => {
				if(err) {
					logger.log('error', `Failed to open ${msg.path}`)
					return
				}

				var buf = Buffer.alloc(320)
				var buf2 = Buffer.alloc(160)

				var tid = setInterval(() => {
					if(!(uuid in registrar)) {
						clearInterval(tid)
						return
					}

					fs.read(fd, buf, 0, 320, null, (err, len) => {
						if(err) {
							logger.log('error', `Reading ${msg.path} failed with ${err}`)
							clearInterval(tid)
							return
						}

						if(!(uuid in registrar)) {
							clearInterval(tid)
							return
						}

						var data = registrar[uuid]

						if(len == 0) {
							logger.log('info', `Reading ${msg.path} reached end of file`)
							var event = mrcp.builder.build_event('SPEAK-COMPLETE', msg.data.request_id, 'COMPLETE', {'channel-identifier': msg.data.headers['channel-identifier'], 'Completion-Cause': '000 normal'})
							u.safe_write(msg.conn, event)
							clearInterval(tid)
							return
						}

						for(var i=0 ; i<160 ; i++) {
							// L16 little-endian
							buf2[i] = linear2ulaw((buf[i*2+1] << 8) + buf[i*2])
						}
						
						registrar[uuid].rtp_session.send_payload(buf2)

						//registrar[uuid].rtp_session.send_payload(buf)
					})
				}, 19)
			})
			return state
		} else {
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	}
)
