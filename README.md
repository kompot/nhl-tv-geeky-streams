Best way to download NHL.TV games to your Mac, PC or Linux.
You need Docker installed to run this

100% working but hardly usable **alpha** quality prototype.

Loosely based on
- https://github.com/timewasted/xbmc-nhl-gamecenter
- https://github.com/eracknaphobia/plugin.video.nhlgcl
- https://github.com/cmaxwe/dl-nhltv

Usage:
=====
```
docker-compose run -e email=NhlTvEmail -e password=NhlTvPassword --rm nhltv
```

select game and stream type; video will be downloaded to `./video` folder.
