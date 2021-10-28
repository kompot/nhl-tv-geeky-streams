FROM node:16.12-alpine

RUN apk --no-cache add \
    build-base \
    ffmpeg \
    python3 \
    python3-dev \
    libffi-dev \
    openssl-dev \
    libxml2-dev \
    libxslt-dev \
    cmd:pip3 \
  && pip3 --disable-pip-version-check install streamlink==2.4.* \
  && pip3 --disable-pip-version-check install pycryptodome \
  && apk --no-cache del build-base

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN chown -R node:node /app

USER node

RUN yarn install

CMD [ "yarn", "start" ]
