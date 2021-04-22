require('magic-globals')
const {spawn, dispatch} = require('nact')
const mrcp = require('mrcp')

const net = require('net');

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const speechsynther = require('../actors/speechsynther.js')
const speechrecoger = require('../actors/speechrecoger.js')

const registrar = require('../registrar.js')

const FILE = u.filename()

const log = (line, level, entity, msg) => {
    logger.log(level, entity, `(${FILE}:${line}) ${msg}`)
}

module.exports = (parent) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		log(__line, 'info', 'mrcp_server', `got ${JSON.stringify(msg)}`)
		if(msg.type == MT.START) {
			state.server = mrcp.createServer((conn) => {
				conn.on('data', data => {
		            //log(__line, 'info', 'mrcp_server', `got MRCP message ${JSON.stringify(data)}`)
					var uuid = data.headers['channel-identifier'].split("@")[0]
                    data.uuid = uuid

                    if(!registrar.hasOwnProperty(uuid)) {
                        log(__line, 'warning', uuid, `got unexpected MRCP message ${data} for unknown uuid`)
						var response = mrcp.builder.build_response(data.request_id, 405, 'COMPLETE', {'channel-identifier': data.headers['channel-identifier']})
						u.safe_write(conn, response)
						return
					}

					var call = registrar[uuid]
					if(!call) {
                        // if we reach here, it probably indicates a bug
						log(__line, 'error', uuid, `unexpected MRCP request for non existing call call=${call} ${JSON.stringify(data)}`)
                        process.exit(1)
					}

					var handler = call.handler
					if(!handler) {
                        // if we reach here, it probably indicates a bug
						log(__line, 'error', uuid, `unexpected MRCP request for non existing handler call=${call} handler=${handler} ${JSON.stringify(data)}`)
                        process.exit(1)
					}

					dispatch(handler, {type: MT.MRCP_MESSAGE, data: data, conn: conn})
				})

                conn.on('error', err => {
					log(__line, 'error', 'mrcp_server', `conn error: ${err}`)
                })
			})

			state.server.listen(config.mrcp_port, config.local_ip)
			return state
		} else if(msg.type == MT.SESSION_CREATED) {
            if(!registrar.hasOwnProperty(msg.data.uuid)) {
				log(__line, 'error', msg.data.uuid, `not in registrar (maybe SIP call ended). Ignorign SESSION_CREATED`)
                return
            }

			if(registrar[msg.data.uuid].handler) {
				log(__line, 'error', msg.data.uuid, `unexpected msg SESSION_CREATED for already existing uuid`)
                process.exit(1)
			}

			var handler
			if(msg.data.resource == 'speechsynth') {
				handler = speechsynther(ctx.self, msg.data.uuid)
			} else {
				handler = speechrecoger(ctx.self, msg.data.uuid)
			}

			log(__line, 'info', msg.data.uuid, `setting handler for ${msg.data.resource}`)

			registrar[msg.data.uuid].handler = handler
			dispatch(handler, {type: MT.START, data: msg.data})

            log(__line, 'info', msg.data.uuid, `sending SESSION_CREATED_ACK to ${JSON.stringify(msg.sender)}`)
			dispatch(msg.sender, {type: MT.SESSION_CREATED_ACK, data: {uuid: msg.data.uuid}})

			return state
		} else if(msg.type == MT.SESSION_TERMINATED) {
			var handler = msg.handler
            if(handler) {
	    	    dispatch(handler, {type: MT.TERMINATE})	
            }
			return state
		} else {
			log(__line, 'error', 'mrcp_server', `got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	},
	'mrcp_server'
)
