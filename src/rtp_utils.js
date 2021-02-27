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

module.exports = {
    alloc_rtp_sessions,
}


