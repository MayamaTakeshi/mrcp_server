
# Speech Recognition Engine Comparison

## Overview
This is a web app that permits to do a quick comparison of performance of SR engines (currently we support google, olaris olaris_v2 and julius).

It requires to run with HTTPS because media access will not be allowed unless you access the app at http://localhost

## Installation

1) First do installation of mrcp_server itself as this app uses some modules from it.
```
cd mrcp_server
npm install
cp config/default.js.sample config/defalut.js
vim config/default.js # set the entries 'julius' and 'olaris'
```

2) Create key and cert files and install node modules:
```
cd sr_engine_comparison

openssl req -nodes -new -x509 -keyout server.key -out server.cert

npm install
```

## Start the app
```
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials_file.json
node index.js
```

## Usage:

Go to https://IP_ADDRESS:3000/



