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
  vim config/default.js # ajdust parameters if necessary
  node index.js
```

Then clone https://github.com/MayamaTakeshi/mrcp_client and do:

```
  cd mrcp_client
  apt/yum install sox
  npm install
  cp config/default.js.sample config/default.js
  vim config/default.js # ajdust parameters if necessary
```

To test speechsynth:

```
  node speechsynth_client.js 127.0.0.1 8070 en-US en-US-Wavenet-E "Hello World!"

  node speechsynth_client.js 127.0.0.1 8070 ja-JP ja-JP-Wavenet-A "おはようございます."
```

To test speechrecog:

````
  node speechrecog_client.js 127.0.0.1 8070 ja-JP artifacts/ohayou_gozaimasu.wav
```

If you don't have Google Credentials you can test using DTMF:
```
  node speechsynth_client.js 127.0.0.1 8070 dtmf dtmf 1234567890abcd*#

  node speechrecog_client.js 127.0.0.1 8070 dtmf artifacts/dtmf.0123456789ABCDEF.16000hz.wav artifacts/grammar.xml
```

