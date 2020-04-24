# mrcp_server

THIS IS A WORK IN PROGRESS.

This is an experimental Media Resource Control Protocol server that I'm writing for node.js for learning purposes.


Initial media platform will be Google Voice.

To test things so far:

Start the server:

```
  cd mrcp_server
  npm install
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials_file.json
  cp config/default.js.sample config/default.js
  vim config/default.js # ajdust parameters as necessary (minimally, set the local_ip)
  node index.js
```

Then on another machine, clone https://github.com/MayamaTakeshi/mrcp_client and do:

```
  cd mrcp_client
  apt/yum install sox
  npm install
  cp config/default.js.sample config/default.js
  vim config/default.js # ajdust parameters as necessary (minimally, set the local_ip)
```

To test speechsynth:

```
  node speechsynth_client.js IP_ADDRES_OF_SERVER SIP_PORT_OF_SERVER en-US en-US-Wavenet-E "Hello World!"
```

To test speechrecog:

````
  node speechrecog_client.js IP_ADDRESS_OF_SERVER SIP_PORT_OF_SERVER ja-JP artifacts/ohayou_gozaimasu.wav
```

