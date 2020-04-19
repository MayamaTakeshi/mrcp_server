const m = require('moment')

module.exports = {
	log: (level, msg) => {
		console.log(`${m().format("YYYY-MM-DD HH:mm:ss.SSS")} ${level}: ${msg}`)
	}
}

