FROM node:10.11-alpine

RUN apk --no-cache add \
    build-base \
    ffmpeg \
    git \
    python3 \
    python-dev \
    libffi-dev \
    openssl-dev \
  && pip3 install pycryptodome \
  && apk --no-cache del build-base

# TODO rollback to `pip3 install streamlink` once it supports download progress again.
# Until then, build it from source from a fork with that capability.
WORKDIR /usr/src
RUN git clone https://github.com/rseanhall/streamlink -b 1.2.0-custom
WORKDIR /usr/src/streamlink
RUN python3 setup.py install

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN yarn install

COPY . /app/

CMD [ "yarn", "start" ]
USER node
