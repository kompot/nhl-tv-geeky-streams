import * as fs from "fs";
import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as luxon from "luxon";
import * as yargs from "yargs";

import {
  getGameList,
  getStreamList,
  Config,
} from './geekyStreamsApi';
import {
  MEDIA_STATE
} from "./nhlStatsApi";

import { chooseFeed } from "./chooseFeed";
import { chooseGame } from "./chooseGame";
import { chooseStream } from "./chooseStream";
import {
  calcRecordingOffset,
} from "./calcRecordingOffset";
import { download } from "./download";

interface CommandLineConfig {
  passive: boolean;
}

const main = async () => {
  const argv: CommandLineConfig = yargs.options({
    passive: {
      description: `Autoselect the game, feed, and stream to download.
Requires a favourite team and preferred stream quality.`,
      type: "boolean",
    },
  }).strict().argv;

  const config: Config = yaml.safeLoad(fs.readFileSync("./config.yaml"));
  // don't hide other teams if none are favourited
  const hasFavouriteTeams = !!(config.favouriteTeams && config.favouriteTeams.length);
  config.hideOtherTeams = hasFavouriteTeams && config.hideOtherTeams ||
                          argv.passive;

  // will set timezone to somewhat central US so that we always get all matches
  // for current US day, even if you are actually in Asia
  let dateLastSelected = luxon.DateTime.local().setZone(config.matchTimeZone);
  while (true) {
    const gameList = await getGameList(config, dateLastSelected);
    const gameSelection = await chooseGame(argv.passive, gameList);
    if (gameSelection.isDateChange) {
      dateLastSelected = gameSelection.newDate;
      continue;
    } else if (gameSelection.cancelSelection) {
      return;
    }

    const processedGame = gameSelection.processedGame;
    const game = processedGame.game;
    const feedSelection = await chooseFeed(argv.passive, processedGame.feedList);
    if (feedSelection.cancelSelection) {
      return;
    }
    const processedFeed = feedSelection.processedFeed;
    const feed = processedFeed.epgItem;
    
    const streamList = await getStreamList(config, processedFeed);  
    const streamSelection = await chooseStream(argv.passive, streamList);
    if (streamSelection.cancelSelection) {
      return;
    } else if (streamSelection.selectNewGame) {
      continue;
    }

    const filename = [
      luxon.DateTime.fromISO(game.gameDate)
        .setZone(config.matchTimeZone)
        .toISODate(),
      game.teams.away.team.abbreviation.replace(/\s+/g, "_"),
      "at",
      game.teams.home.team.abbreviation.replace(/\s+/g, "_"),
      "(" + feed.mediaFeedType + (feed.callLetters && "_") + feed.callLetters + ")",
      streamSelection.processedStream.resolution,
      feed.mediaState === MEDIA_STATE.ON ? "live" : "archive"
    ].join("_");
  
    const recordingOffset = calcRecordingOffset(
      filename,
      game,
      feed.mediaState,
      config
    );
  
    return download(
      filename,
      recordingOffset,
      streamList.auth,
      streamList.mediaAuth,
      streamSelection.processedStream,
      config.streamlinkExtraOptions
    );
  }
};

main();
