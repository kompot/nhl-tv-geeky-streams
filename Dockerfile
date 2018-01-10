FROM ubuntu:17.10

# install node
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

# install yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update && apt-get install -y yarn

# install streamlink
# TODO rollback to `pip install streamlink` right after 0.10.0 is released
# and `hls-start-offset` option is supported in stable release
RUN apt-get install -y python-pip git
# RUN pip install streamlink
WORKDIR /usr/src
RUN git clone https://github.com/streamlink/streamlink
WORKDIR /usr/src/streamlink
RUN python setup.py install
RUN pip install pycryptodome

# install ffmpeg
RUN apt-get install -y ffmpeg

RUN mkdir /usr/src/app
WORKDIR /usr/src/app/

# Install dependencies
COPY package.json /usr/src/app/
COPY yarn.lock /usr/src/app/
RUN yarn install

ADD . /usr/src/app/

CMD [ "yarn", "start" ]
