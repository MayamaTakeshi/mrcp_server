'use strict';

const fs = require('fs')

const encoding = 'MULAW';
const sampleRateHertz = 8000;
const languageCode = 'en-US';

function fileStream() {
  // Imports the Google Cloud client library
  const speech = require('@google-cloud/speech');

  const config = {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
  };

  const request = {
    config,
    interimResults: false, //Get interim results from stream
  };

  // Creates a client
  const client = new speech.SpeechClient();

  // Create a recognize stream
  const recognizeStream = client
    .streamingRecognize(request)
    .on('error', console.error)
    .on('data', data =>
      process.stdout.write(
        data.results[0] && data.results[0].alternatives[0]
          ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
          : `\n\nReached transcription time limit, press Ctrl+C\n`
      )
    );

  const rs = fs.createReadStream('./audio-t.raw-r.8000-e.mu-law-b.8.-c.1.raw')
  // rs.pipe(recognizeStream)

  var tid= setInterval(() => {
	var data = rs.read(160)
	if(data) {
	  console.log(`data ok :${data}`)
	  recognizeStream.write(data)
	} else {
	  console.log(`data ng (sending silence)`)
	  //recognizeStream.write(Buffer.alloc(160, 0xFF))
	  recognizeStream.write(Buffer.alloc(160, 0x7F))
	}
  }, 20)
}

fileStream()
