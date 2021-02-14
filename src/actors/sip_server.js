require('magic-globals')
const {spawn, dispatch} = require('nact')

const sip = require('sip')
const uuid_v4 = require('uuid').v4
const Deque = require('collections/deque')
const _ = require('lodash')
const mrcp_utils = require('mrcp-utils')

const logger = require('../logger.js')
const u = require('../utils.js')

const MT = require('../message_types.js')

const registrar = require('../registrar.js')

const config = require('config')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

var rstring = () => {
	return Math.floor(Math.random()*1e6).toString()
};

var process_incoming_call = (uuid, state, req, actor_id) => {
	log(__line, 'info', uuid, 'got new call')

	if(!req.content || req.content == '') {
        var rs = 400
        var rr = 'No SDP (Delayed Media Not Acceptable)'
		state.sip_stack.send(sip.makeResponse(req, rs, rr))
		log(__line, 'info', uuid, `refused with ${rs} ${rr}`)
		return
    }

	var data = {
		uuid: uuid,
		sip_req: req,
	}

	var offer_sdp = mrcp_utils.parse_sdp(req.content)

	if(!mrcp_utils.offer_sdp_matcher(offer_sdp, data)) {
        var rs = 400
        var rr = 'Invalid SDP For Speech Service'
		state.sip_stack.send(sip.makeResponse(req, rs, rr))
		log(__line, 'info', uuid, `refused with ${rs} ${rr}`)
		return
	}
 
	if(!data.rtp_payloads.includes("0")) {
        // We currently only accept G.711 PCMU (payload_type=0)
        var rs = 415
        var rr = 'Unsupported Media Type (We Only Accept PCMU)'
		state.sip_stack.send(sip.makeResponse(req, rs, rr))
		log(__line, 'info', uuid, `refused with ${rs} ${rr}`)
		return
	}
 
	if(data.resource != 'speechsynth' && data.resource != 'speechrecog') {
        var rs = 415
        var rr = 'Unsupported Resource (We Only Accept speechsynth Or speechrecog)'
		state.sip_stack.send(sip.makeResponse(req, rs, rr))
		log(__line, 'info', uuid, `refused with ${rs} ${rr}`)
		return
	}

	var rtp_session_index = state.free_rtp_sessions.shift()

	if(rtp_session_index == undefined) {
        var rs = 500
        var rr = 'No RTP Port Available'
		state.sip_stack.send(sip.makeResponse(req, rs, rr))
		log(__line, 'info', uuid, `refused with ${rs} ${rr}`)
		return
	}

	log(__line, 'info', uuid, `allocated rtp_session ${rtp_session_index}`)

    var rtp_session = state.rtp_sessions[rtp_session_index]

    rtp_session.setup({
        remote_ip: data.remote_rtp_ip,
        remote_port: data.remote_rtp_port,
        payload_type: 0,
        ssrc: u.gen_random_int(0xffffffff),
    })

    data.local_ip = rtp_session.local_ip
    data.local_port = rtp_session.local_port
	data.rtp_session = rtp_session

	registrar[data.uuid] = data
    log(__line, 'info', uuid, `added to registrar`)

    var rs = 100
    var rr = 'Trying'
    state.sip_stack.send(sip.makeResponse(req, rs, rr))
    log(__line, 'info', uuid, `accepted with ${rs} ${rr}`)

	dispatch(state.mrcp_server, {type: MT.SESSION_CREATED, sender: actor_id, data: data})
}

var process_in_dialog_request = (uuid, state, req) => {
	if(req.method == 'ACK'){
		// nothing to do
		return
	}

	if(req.method != 'INVITE' && req.method != 'BYE') {
        var rs = 200
        var rr = 'OK'
		var res = sip.makeResponse(req, rs, rr)
		log(__line, 'info', uuid, `unexpected in-dialog ${req.method}. Sending default ${rs} ${rr} reply`)
		state.sip_stack.send(res)
		return
	}

	if(req.method == 'BYE') {
		log(__line, 'info', uuid, 'received BYE')

        var rs = 200
        var rr = 'OK'
		var res = sip.makeResponse(req, rs, rr)
		state.sip_stack.send(res)

        log(__line, 'info', uuid, `replied with ${rs} ${rr}`)

        var call = registrar[uuid]

        free_call(state, call, uuid)
		return
	}

	log(__line, 'error', uuid, "REINVITE SUPPORT IMPLEMENTATION PENDING")
	process.exit(1)
}

function create_sip_stack(state, actor_id) {
	var sip_stack = sip.create({
		address: config.local_ip,
		port: config.sip_port,
		publicAddress: config.local_ip,
	},
	function(req) {
		try {
	        const uuid = req.headers['call-id']
			log(__line, 'info', uuid, `got SIP request ${req.method}`);
			var to_tag = req.headers['to'].params.tag

			if(!to_tag && req.method != 'INVITE') {
                var rs = 200
                var rr = 'OK'
                var res = sip.makeResponse(req, rs, rr)

                if(req.method == 'CANCEL') {
                    log(__line, 'info', uuid, `Sending ${rs} ${rr} reply`)

                    var call = registrar[uuid]

                    free_call(state, call, uuid)
                    log(__line, 'info', uuid, `deallocated rtp_session ${call.rtp_session.id}`)
                } else {
                    log(__line, 'info', uuid, `unexpected out-of-dialog ${req.method}. Sending default ${rs} ${rr} reply`)
                }

				state.sip_stack.send(res)
				return
			}

			if(to_tag) {
				process_in_dialog_request(uuid, state, req)
				return
			}

			process_incoming_call(uuid, state, req, actor_id);
		} catch(err) {
			log(__line, 'error', 'sip_server', err)
			process.exit(1)
		}
	})
	return sip_stack
}


function free_call(state, call, uuid) {
    if(!call) return

    dispatch(state.mrcp_server, {type: MT.SESSION_TERMINATED, uuid: uuid, handler: call.handler})

    state.free_rtp_sessions.push(call.rtp_session.id)

    log(__line, 'info', uuid, `deallocated rtp_session ${call.rtp_session.id}`)

    delete registrar[uuid]
    log(__line, 'info', uuid, `removed from registrar`)
}


module.exports = (parent) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//log(__line, 'info', 'sip_server', `got ${JSON.stringify(msg)}`)
		log(__line, 'info', 'sip_server', `got ${msg.type}`)

		if(msg.type == MT.START) {
            state.mrcp_server = msg.data.mrcp_server

            var udp_ports = _.range(config.rtp_lo_port, config.rtp_hi_port, 2)

            state.free_rtp_sessions = new Deque()
            for(var i=0 ; i<udp_ports.length ; i++) {
                state.free_rtp_sessions.push(i)
            }

            u.alloc_rtp_sessions(udp_ports, config.local_ip)
            .then(rtp_sessions => {
				dispatch(ctx.self, {type: MT.PROCEED, data: {rtp_sessions: rtp_sessions}})
            })
            .catch(err => {
                console.error("CRITICAL: could not allocate RTP range. Terminating")
                process.exit(1)
            })
            return state
        } else if(msg.type == MT.PROCEED) { 
            state.rtp_sessions = msg.data.rtp_sessions

			state.sip_stack = create_sip_stack(state, ctx.self)

			state.rtpCheckTimer = setInterval(() => {
				var now = Date.now()
				Object.keys(registrar).forEach(uuid => {
					var call = registrar[uuid]

					if(now - call.rtp_session.activity_ts > config.rtp_timeout) {
						log(__line, 'warn', uuid, 'Terminating call due to RTP inactivity')

                        free_call(state, call, uuid)

                        if(call.sip_res) {
                            state.sip_stack.send({
                                method: 'BYE',
                                uri: call.sip_req.headers.contact ? call.sip_req.headers.contact[0].uri : call.sip_req.headers.from.uri,
                                headers: {
                                    to: call.sip_res.headers.from,
                                    from: call.sip_res.headers.to,
                                    'call-id': call.sip_req.headers['call-id'],
                                    cseq: {method: 'BYE', seq: call.sip_req.headers.cseq.seq + 1},
                                    via: []
                                }
                            }, (res) => {
                                    log(__line, 'info', uuid, `BYE for call got: ${res.status} ${res.reason}`)	
                            })
                        } else {
                            var rs = 480 
                            var rr = 'Temporarily Unavailable'
                            state.sip_stack.send(sip.makeResponse(call.sip_req, rs, rr))
                            log(__line, 'info', uuid, `refused with ${rs} ${rr}`)
                        }
					}
				})
			}, 1000)

			return state
        } else if(msg.type == MT.SESSION_CREATED_ACK) { 
            var uuid = msg.data.uuid

            if(!registrar.hasOwnProperty(uuid)) {
                log(__line, 'info', uuid, `not in registrar anymore`)
                return
            }

            var data = registrar[uuid]
            var rtp_session = data.rtp_session

            var answer_sdp = mrcp_utils.gen_answer_sdp(config.local_ip, config.mrcp_port, rtp_session.local_port, data.connection, data.uuid, data.resource)

            var rs = 200
            var rr = 'OK'
            var res = sip.makeResponse(data.sip_req, rs, rr)

            res.headers.to.params.tag = rstring()

            var req = data.sip_req

            res.headers['record-route'] = req.headers['record-route']
            res.headers.contact = [{uri: `sip:mrcp_server@${config.local_ip}:${config.sip_port}`}]
            res.headers['content-type'] = 'application/sdp'
            res.content = answer_sdp

            data.sip_res = res

            state.sip_stack.send(res,
                function(res) {
                    log(__line, 'info', uuid, 'got callback to res sent to out-of-dialog INVITE on sip stack')
                }
            )

            log(__line, 'info', uuid, `INVITE for ${data.resource} accepted with ${rs} ${rr}`)

            return state
		} else {
			log(__line, 'error', 'sip_server', `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	},
	'sip_server'
)
