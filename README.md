# mrcp_server

## Overview

This is a Media Resource Control Protocol (v2) server that I'm writing in node.js for learning purposes.

It currently supports:
  - Google Speech Recog/Synth
  - DTMF and MORSE Speech Recog/Synth (use languages 'dtmf' and 'morse')
  - Julius Speech Recognition using our [julius_server](https://github.com/MayamaTakeshi/julius_server)
  - Olaris Speech Recognition using olaris API (japanese language only)
  - Vosk Speech Recognition (there is a Dockerfile in vosk_server_small_ja to build a server for japanese testing)

To test things so far:

Start the server:

```
  cd mrcp_server
  npm install

  # if you have a google credentials file with support for SpeechSynth and/or SpeechRecog export:
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials_file.json
  # if you don't have it, it is OK. You can still test it by using language='dtmf' or language='morse'

  cp config/default.js.sample config/default.js
  vim config/default.js # adjust parameters if necessary
  node index.js
```

If 'npm install' fails, try upgrading it (works with nvm v. 7.21.1):
```
npm install -g npm@7.21.1
```

Then clone https://github.com/MayamaTakeshi/mrcp_client and follow its installation instructions.

Follow instructions there on how to perform tests and load tests.

## Development Details

We use the [nact actor library](https://nact.io/) to permit to better separate concerns. We have the following actors:
  - sip_server : waits for SIP INVITEs with SDP requesting access to speech resources
  - mrcp_server : waits for MRCP messages and distributes them to resource workers
  - speechsynther : resource worker for speechsynth
  - speechrecoger : resource worker for speechrecog

Basic operation:
  - on startup the sip_server preallocates all UDP ports in the range specified by rtp_lo_port and rtp_hi_port in the config file.
  - when a valid SIP INVITE arrives from a client, sip_server allocates an rtp_session for it and replies with '100 Trying'
  - then sip_server uses the SIP Call-ID (uuid) to compose the channel-identifier: ${uuid}@${resource}
  - then sip_server adds the call to the registrar (uuid is the key) and sends SESSION_CREATED to mrcp_server (obs: registrar is a common object to store existing calls (it is not a SIP Registrar).
  - mrcp_server creates a worker (speechsynther or speechrecoger) and sets it in the registrar for that uuid.
  - mrcp_server sends SESSION_CREATED_ACK
  - sip_server send '200 OK' to client
  - the client creates a TCP connection with mrcp_server and starts exchanging MRCP messages
  - when MCRP messages arrive, mrcp_server send them to the correct resource worker based on channel-identifier
  - the resource workers receive MCRP requests like SPEAK and RECOGNIZE and process them.

