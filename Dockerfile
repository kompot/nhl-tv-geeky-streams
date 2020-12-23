FROM node:14.15-alpine

RUN apk --no-cache add \
    build-base \
    ffmpeg \
    python3 \
    python-dev \
    libffi-dev \
    openssl-dev \
  && pip3 --disable-pip-version-check install streamlink==2.0.* \
  && pip3 --disable-pip-version-check install pycryptodome \
  && apk --no-cache del build-base

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN chown -R node:node /app

USER node

RUN yarn install

CMD [ "yarn", "start" ]
