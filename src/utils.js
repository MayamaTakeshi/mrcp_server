require('magic-globals')
const path = require('path')
const assert = require('assert')

const dgram = require('dgram')
const RtpSession = require('./rtp-session.js')

async function alloc_rtp_sessions(port_numbers, addr) {
    var alloc_udp_port = (port_number, addr) => {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket('udp4')

            socket.once('error', (err) => {
                socket.close()
                reject(err)
            })

            socket.once('listening', () => {
                resolve(socket)
            })

            socket.bind(port_number, addr)
        })
    }

    return new Promise(async (resolve, reject) => {
        var rtp_sessions = []
        for (let i = 0; i < port_numbers.length; i++) {
            var port_number = port_numbers[i]
            console.log(i, port_number)
            // wait for the promise to resolve before advancing the for loop
            try {
                var socket = await alloc_udp_port(port_number, addr)
                console.log(`in socket: ${socket}`)
                rtp_sessions.push(new RtpSession(socket, i))
            } catch (err) {
                reject(`Could not allocate range. ${err}`)
                break
            }
        }
        resolve(rtp_sessions)
    })
}

var safe_write = (conn, msg) => {
	try {
		if(!conn.destroyed) {
			conn.write(msg)
		}
	} catch(e) {
		console.error("safe_write catched:")
		console.error(e)
	}
}

var gen_random_int = (max) => {
	return Math.floor(Math.random() * Math.floor(max));
}



// Original C code for linear2ulaw by:
//** Craig Reese: IDA/Supercomputing Research Center
//** Joe Campbell: Department of Defense
//** 29 September 1989
// http://www.speech.cs.cmu.edu/comp.speech/Section2/Q2.7.html

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


const ulaw2linear = (ulawbyte) => {
  var exp_lut = [0,132,396,924,1980,4092,8316,16764]
  var sign, exponent, mantissa, sample

  ulawbyte = ~ulawbyte
  sign = (ulawbyte & 0x80)
  exponent = (ulawbyte >> 4) & 0x07
  mantissa = ulawbyte & 0x0F
  sample = exp_lut[exponent] + (mantissa << (exponent + 3))
  if (sign != 0) sample = -sample

  return(sample)
}


module.exports = {
    alloc_rtp_sessions,

	filename: () => {
        var filepath = __stack[1].getFileName()
		return path.basename(filepath)
	},

	safe_write,

	gen_random_int,

	linear2ulaw,

	ulaw2linear,
}


