FROM alphacep/kaldi-vosk-server:latest

ENV MODEL_VERSION 0.22
RUN mkdir /opt/vosk-model-small-ja \
   && cd /opt/vosk-model-small-ja \
   && wget -q http://alphacephei.com/vosk/models/vosk-model-small-ja-${MODEL_VERSION}.zip \
   && unzip vosk-model-small-ja-${MODEL_VERSION}.zip \
   && mv vosk-model-small-ja-${MODEL_VERSION} model \
   && rm -rf vosk-model-small-ja-${MODEL_VERSION}.zip

EXPOSE 2700
WORKDIR /opt/vosk-server/websocket
CMD [ "python3", "./asr_server.py", "/opt/vosk-model-small-ja/model" ]
