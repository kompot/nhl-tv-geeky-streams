rem docker-compose build
rem docker run --name dev-nhltv -v %~dp0src:/app/src -v %~dp0tmp:/app/tmp -v %~dp0video:/app/video -v %~dp0yarn.lock:/app/yarn.lock -v %~dp0package.json:/app/package.json -it nhl-tv-geeky-streams_nhltv /bin/sh
docker run --name dev-nhltv -v %~dp0src:/app/src -v %~dp0tmp:/app/tmp -v %~dp0video:/app/video -it nhl-tv-geeky-streams_nhltv /bin/sh