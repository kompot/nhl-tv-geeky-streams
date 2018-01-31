FROM node:alpine

RUN apk --no-cache add \
    build-base \
    ffmpeg \
    py-pip \
    python \
  && pip install streamlink \
  && pip install pycryptodome \
  && apk --no-cache del build-base

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN yarn install

COPY . /app/

CMD [ "yarn", "start" ]
USER node
