Best way to download NHL.TV games to your Mac, PC or Linux. NHL.TV account **is required**.
You need [Docker](https://www.docker.com/community-edition#/download) installed to run this.

Blackouts are not worked around in any way (and everything will probably just fail, have not tested it). You need a VPN connection if you'd like to watch all games.

# Usage

1. Edit `config.yaml` to set email and password (these are not stored anywhere else and used _only_ to login to official NHL sites). Explore other options available.
2. Run


```
docker-compose run --rm nhltv
```

3. Wait for several minutes for image to be built.
4. Select game and stream type.
5. Video will be downloaded to `./video` folder. This location can be customized in `.env` file.

# Credits

Loosely based on

* https://github.com/timewasted/xbmc-nhl-gamecenter
* https://github.com/eracknaphobia/plugin.video.nhlgcl
* https://github.com/cmaxwe/dl-nhltv

Special credit to [StevensNJD4](https://github.com/StevensNJD4) and his awesome [LazyMan](https://github.com/StevensNJD4/LazyMan) app.
