# mrcp_server

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

Then follow instructions there on how to perform tests and load tests.

