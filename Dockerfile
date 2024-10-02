FROM node:22.9-alpine3.20

RUN apk --no-cache add \
    build-base \
    python3 \
    python3-dev \
    libxml2-dev \
    libxslt-dev \
    cmd:pip3 \
    ffmpeg
RUN pip3 install --break-system-packages wheel streamlink==6.11.*

WORKDIR /app/
COPY package.json /app/
COPY yarn.lock /app/
RUN chown -R node:node /app

USER node

RUN yarn install

CMD [ "yarn", "start" ]
