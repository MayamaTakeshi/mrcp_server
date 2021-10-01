const dgram = require("dgram")

const u = require('./utils.js')
console.dir(u)

class RtpSession {
    constructor(socket, id) {
        this._socket = socket
        this.id = id

        const address = this._socket.address()
        this.local_ip = address.address
        this.local_port = address.port

        this._socket.on('message', (msg, rinfo) => {
             //console.log(`RtpSession(${this.local_ip}:${this.local_port}) got packet from ${rinfo.address}:${rinfo.port}`)
            if(rinfo.address != this.remote_ip || rinfo.port != this.remote_port) {
                console.log(`Ignoring packet out of RTP session from ${rinfo.address}:${rinfo.port}`)
                return
            }

            // TODO: must check if message is really an RTP packet

            var data = msg.slice(12) // assume 12 bytes header for now

            this._socket.emit('data', data) 

            this.activity_ts = Date.now()
        })
    }

    setup(opts) {
        this.remote_ip = opts.remote_ip ? opts.remote_ip : '127.0.0.1'
        this.remote_port = opts.remote_port
        this.payload_type = opts.payload_type ? opts.payload_type : 0
        this.ssrc = opts.ssrc ? opts.ssrc : 0x1234678
        this.seq_num = 1
        this.time_stamp = 160
        this.activity_ts = Date.now()

        var version = 2
        var padding = 0
        var extension = 0
        var csrc_count = 0
        var marker = 0

        this._hdr = Buffer.alloc(12)

        this._hdr[0] = (version << 6 | padding << 5 | extension << 4 | csrc_count)
        this._hdr[1] = (marker << 7 | this.payload_type)
        this._hdr[2] = 0   // seq_num MSB
        this._hdr[3] = 0   // seq_num LSB
        this._hdr[4] = 0   // timestamp MSB
        this._hdr[5] = 0   // timestamp 
        this._hdr[6] = 0   // timestamp
        this._hdr[7] = 1   // timestamp LSB
        this._hdr[8] = this.ssrc >>> 24
        this._hdr[9] = this.ssrc >>> 16 & 0xFF
        this._hdr[10] = this.ssrc >>> 8 & 0xFF
        this._hdr[11] = this.ssrc & 0xFF
    }

    send_payload(payload, marker_bit, payload_type) {
        var buf = Buffer.concat([this._hdr, payload])

        //buf[1] = (marker_bit ? marker_bit : 0) << 7 | (payload_type ? payload_type : this.payload_type)
        buf[1] = (this.seq_num ? 1 : 0) << 7 | (payload_type ? payload_type : this.payload_type)

        var seq_num = this.seq_num
        buf[2] = seq_num >>> 8
        buf[3] = seq_num & 0xFF
        this.seq_num++

        var time_stamp = this.time_stamp
        this.time_stamp += payload.length

        buf[4] = time_stamp >>> 24
        buf[5] = time_stamp >>> 16 & 0xFF
        buf[6] = time_stamp >>> 8 & 0xFF
        buf[7] = time_stamp & 0xFF
    
        this._socket.send(buf, 0, buf.length, this.remote_port, this.remote_ip)

        this.activity_ts = Date.now()
    }

    remove_all_listeners() {
        this._socket.removeAllListeners() 
    }

    close() {
        this._socket.close()
    }

    on(evt, cb) {
        this._socket.on(evt, cb)
    }
}

module.exports = RtpSession

