const express = require('express')
const app = express()

const fs = require('fs')

const httpsServer = require('https').createServer({
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert'),
}, app);

const io = require('socket.io')(httpsServer, {})

const RequestActor = require('./request_actor.js')

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

io.on('connection', (socket) => {
    console.log('a user connected')

    var ra = RequestActor({socket: socket}) 
    ra({type: 'init'})
})

httpsServer.listen(3000, () => {
    console.log('listening on *:3000')
})
