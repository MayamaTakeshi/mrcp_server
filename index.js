const { start, dispatch, stop } = require('nact');
const system = start();

const logger = require('./src/logger.js')
const u = require('./src/utils.js')
const MT = require('./src/message_types.js')

const config = require('config')

const fs = require('fs')

// create directory for temporary speechsynth files
if (!fs.existsSync('./tmp')){
	fs.mkdirSync('./tmp');
}

const sip_server = require('./src/actors/sip_server.js')(system)
const mrcp_server = require('./src/actors/mrcp_server.js')(system)

dispatch(sip_server, {type: MT.START, data: {mrcp_server: mrcp_server}})
dispatch(mrcp_server, {type: MT.START})

