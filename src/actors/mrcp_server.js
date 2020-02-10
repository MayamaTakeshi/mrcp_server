const {spawn, dispatch} = require('nact')
const mrcp = require('mrcp')

const net = require('net');

const logger = require('../logger.js')
const u = require('../utils.js')
const MT = require('../message_types.js')

const config = require('config')

const mrcp_connection_handler = require('../actors/mrcp_connection_handler.js')

const registrar = require('../registrar.js')

module.exports = (parent) => spawn(
	parent,
	(state = {}, msg, ctx) => {
		//logger.log('info', `${u.fn(__filename)} got ${JSON.stringify(msg)}`)
		if(msg.type == MT.START) {
			state.server = mrcp.createServer((conn) => {
				var handler = mrcp_connection_handler(ctx.self, conn)
				dispatch(handler, {type: MT.START})
			})

			state.server.listen(config.mrcp_port, config.local_ip_address)
			return state
		} else {
			logger.log('error', `${u.fn(__filename)} got unexpected message ${JSON.stringify(msg)}`)
			return state
		}
	},
	'mrcp_server'
)
