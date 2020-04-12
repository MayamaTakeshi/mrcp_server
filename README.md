# mrcp_server

THIS IS A WORK IN PROGRESS.

This is an experimental Media Resource Control Protocol server that I'm writing for node.js for learning purposes.


Initial media platform will be Google Voice.

To test things so far:
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials_file.json
  cp config/default.js.sample config/default.js
  node index.js

Then on another shell, clone https://github.com/MayamaTakeshi/mrcp_client and do:
  cd mrcp_client
  node index.js speechsynth 127.0.0.1 8060

