FROM ubuntu:16.04

# install node
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

# install yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update && apt-get install -y yarn

# install livestreamer
RUN apt-get install -y python-pip
RUN pip install livestreamer
RUN pip install pycrypto

RUN mkdir /usr/src/app
WORKDIR /usr/src/app/

# Install dependencies
COPY package.json /usr/src/app/
COPY yarn.lock /usr/src/app/
RUN yarn install

ADD . /usr/src/app/

# EXPOSE 3000
CMD [ "yarn", "start" ]
