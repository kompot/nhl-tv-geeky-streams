FROM node:20.5-alpine3.18

RUN apk --no-cache add \
    build-base \
    python3 \
    python3-dev \
    libxml2-dev \
    libxslt-dev \
    cmd:pip3 \
    ffmpeg
RUN pip3 install wheel streamlink==6.0.*

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN chown -R node:node /app

USER node

RUN yarn install

CMD [ "yarn", "start" ]
