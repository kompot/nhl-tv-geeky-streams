Best way to download NHL.TV games to your Mac, PC or Linux.
You need [Docker](https://www.docker.com/community-edition#/download) installed to run this.

Loosely based on
- https://github.com/timewasted/xbmc-nhl-gamecenter
- https://github.com/eracknaphobia/plugin.video.nhlgcl
- https://github.com/cmaxwe/dl-nhltv

Blackouts are not worked around in any way. You need a VPN connection if you'd like to watch all games.

Usage:
=====

1. Edit `config.yaml` to set email and password (these are not stored anywhere else and used _only_ to login to official NHL sites).
2. Run
  ```
  docker-compose run --rm nhltv
  ```
3. Select game and stream type.
4. Video will be downloaded to `./video` folder.
