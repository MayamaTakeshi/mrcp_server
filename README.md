# mrcp_server

## Overview

This is an experimental Media Resource Control Protocol server that I'm writing in node.js for learning purposes.

Initial media platform will be Google Voice.

To test things so far:

Start the server:

```
  cd mrcp_server
  npm install
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials_file.json
  cp config/default.js.sample config/default.js
  vim config/default.js # adjust parameters if necessary
  node index.js
```

Then clone https://github.com/MayamaTakeshi/mrcp_client and follow its installation instructions.

Follow instructions there on how to perform tests and load tests.

## Development Details

We use the nact actor library to permit to better separate concern. We have the folling actors:
  - sip_server : waits for SIP INVITEs with SDP requesting access to speech resources
  - mrcp_server : waits for MRCP messages and distributes them to resource workers
  - speechsynter : resource worker for speechsynth
  - speechrecoger : resource worker for speechrecog

Basic operation:
  - on startup the sip_server preallocates all UDP ports in the range specified by rtp_lo_port and rtp_hi_port in the config file.
  - when a valid SIP INVITE arrives, sip_server allocates a rtp_session for it
  - then it uses the SIP Call-ID (uuid) to compose the channel-identifier: a=channel:${uuid}@${resource}
  - then it sends SESSION_CREATED to mrcp_server and adds the call to the registrar (uuid is the key)
  - mrcp_server creates a worker (speechsynther or speechrecoger) and sets it in the registrar for that uuid. This way, 
when MCRP messages arrive, mrcp_server will be able to send it to the proper worker




