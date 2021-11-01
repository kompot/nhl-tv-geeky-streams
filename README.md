Best way to download NHL.TV games (both live and archive) to your Mac, PC
or Linux. NHL.TV account **is required**. You should be familiar with terminal.

Blackouts are not worked around in any way. `This game is blacked out in your region. Try using VPN or select another game.` message will be displayed in that case.

# Demo

<a href="https://asciinema.org/a/157500" target="_blank"><img src="https://asciinema.org/a/157500.png" /></a>

# Usage

Copy `config.yaml` to `src/config.yaml.local`.

Edit `src/config.yaml.local` to set email and password (these are not stored anywhere else and used _only_ to login to NHL.TV). Explore other options available.

Video will be downloaded to `./video` folder. This location can be customized in `.env` file.

[Download](https://github.com/kompot/nhl-tv-geeky-streams/archive/master.zip) latest version of this repository and unzip it anywhere.

## With [Docker](https://www.docker.com/community-edition#/download)

- Run `docker-compose run --rm nhltv` in the directory where you've unzipped code to.
- You can also run `docker-compose run --rm nhltv yarn start --help` for info on command line options.

## Without Docker, much less resource hungry, instructions for macOS

- Install dependencies with `brew install yarn streamlink ffmpeg`.
- Run `yarn install` in the directory where you've unzipped code to.
- Run `yarn start` in the directory where you've unzipped code to.
- You can also run `yarn start --help` for info on command line options.

# Credits

Loosely based on

* https://github.com/timewasted/xbmc-nhl-gamecenter
* https://github.com/eracknaphobia/plugin.video.nhlgcl
* https://github.com/cmaxwe/dl-nhltv

Special credit to [StevensNJD4](https://github.com/StevensNJD4) and his awesome [LazyMan](https://github.com/StevensNJD4/LazyMan) app.
