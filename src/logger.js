const m = require('moment')

module.exports = {
	log: (level, entity, msg) => {
		console.log(`${m().format("YYYY-MM-DD HH:mm:ss.SSS")} ${level}: ${entity} ${msg}`)
	}
}

