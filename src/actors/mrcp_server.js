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

module.exports = (parent) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		if(msg.type == MT.START) {
			state.server = mrcp.createServer((conn) => {
				conn.on('data', data => {
					var uuid = data.headers['channel-identifier'].split("@")[0]

					if(! uuid in registrar) {
                        logger.log('warning', `${u.fn(__filename)} ${uuid} got unexpected MRCP message ${data}`)
						var response = mrcp.builder.build_response(data.request_id, 405, 'COMPLETE', {'channel-identifier': data.headers['channel-identifier']})
						u.safe_write(conn, response)
						return
					}

					var handler = registrar[uuid].handler
					if(!handler) {
                        // if we reach here, it probably indicates a bug
						logger.log('error', `${u.fn(__filename)} ${uuid} unexpected MRCP request for non existing handler`)
                        process.exit(1)
					}

					dispatch(handler, {type: MT.MRCP_MESSAGE, data: data, conn: conn})
				})
                conn.on('error', err => {
					logger.log('error', `${u.fn(__filename)} conn error: ${err}`)
                })
			})

			state.server.listen(config.mrcp_port, config.local_ip)
			return state
		} else if(msg.type == MT.SESSION_CREATED) {
			if(!msg.data.uuid in registrar) return

			if(registrar[msg.data.uuid].handler) {
				logger.log('error', `${u.fn(__filename)} unexpected msg SESSION_CREATED for already existing uuid=${msg.data.uuid}`)
                process.exit(1)
			}

			var handler
			if(msg.data.resource == 'speechsynth') {
				handler = speechsynther(ctx.self, msg.data.uuid)
			} else {
				handler = speechrecoger(ctx.self, msg.data.uuid)
			}
			registrar[msg.data.uuid].handler = handler
			dispatch(handler, {type: MT.START, data: msg.data})

			return state
		} else if(msg.type == MT.SESSION_TERMINATED) {
			var handler = msg.handler
            if(handler) {
	    	    dispatch(handler, {type: MT.TERMINATE})	
            }
			return state
		} else {
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	},
	'mrcp_server'
)
