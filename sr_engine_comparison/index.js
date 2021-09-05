const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const io = new Server(server)

const RequestActor = require('./request_actor.js')

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

io.on('connection', (socket) => {
    console.log('a user connected')

    var ra = RequestActor({socket: socket}) 
    ra({type: 'init'})
})

server.listen(3000, () => {
    console.log('listening on *:3000')
})
