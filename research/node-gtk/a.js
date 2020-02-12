const gi = require('node-gtk')
const Gst = gi.require('Gst', '1.0')
const Gtk = gi.require('Gtk', '3.0')


gi.startLoop()
Gtk.init()
Gst.init()

const gstVersion = Gst.version()
console.log(`Gstreamer Version: ${gstVersion[0]}.${gstVersion[1]}.${gstVersion[2]}`)

var pipeline = new Gst.Pipeline("pipeline1")

pipeline.on('child-added', (element, name) => {
    console.log('child-added:', element, name)
})

var src = Gst.ElementFactory.make("filesrc", "src1")
src.location = "/root/tmp/yosemitesam.wav"
console.dir(src)

var sink = Gst.ElementFactory.make("filesink", "sink1")
sink.location = "/root/tmp/ys.wav"
console.dir(sink)

var wavparse = Gst.ElementFactory.make("wavparse")
var audioconvert = Gst.ElementFactory.make("audioconvert")

pipeline.add(src)
//pipeline.add(wavparse)
pipeline.add(sink)

src.link(sink)

console.log(src.getName(), wavparse.getName(), audioconvert.getName(), sink.getName())

pipeline.setState(Gst.State.PLAYING)

let pattern = true
setInterval(() => {
    // TODO Add support for setting unintrospectable properties like below
    // gi.setProperty(src, 'pattern', pattern ? 1 : 0)
    pattern = !pattern
}, 1000);

// TODO: fix so we don't need Gtk for the loop
Gtk.main()

// The above should be equivalent to:
// gst-launch-1.0 filesrc location=/root/tmp/yosemitesam.wav ! filesink location=/root/tmp/ys.wav
// but it doesnt' work on a non-desktop server (if we comment Gtk.init() it will run but file /root/tmp/ys.wav will not be created).


