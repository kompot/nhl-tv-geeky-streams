FROM node:10.11-alpine

RUN apk --no-cache add \
    build-base \
    ffmpeg \
    python3 \
    python-dev \
    libffi-dev \
    openssl-dev \
  && pip3 install streamlink \
  && pip3 install pycryptodome \
  && apk --no-cache del build-base

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN yarn install

COPY . /app/

CMD [ "yarn", "start" ]
USER node
