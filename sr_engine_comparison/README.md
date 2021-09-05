
# Speech Recognition Engine Comparison

## Overview
This is a web app that permits to do a quick comparison of performance of SR engines (currently we support google, olaris and julius).

It requires to run with HTTPS because media access will not be allowed unless you access the app at http://localhost

## Installation
Create key and cert files:
```
openssl req -nodes -new -x509 -keyout server.key -out server.cert
# set Common Name: localhost

npm install
```

## Start the app
```
node index.js
```



