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
  startDate?: string;
}

const main = async (): Promise<void> => {
  const yargv = await yargs.options({
    passive: {
      description: `Autoselect the game, feed, and stream to download.
Requires a favourite team and preferred stream quality.`,
      type: "boolean",
    },
    startDate: {
      description: "Set the initial date to find games.",
      requiresArg: true,
      type: "string",
    },
  }).strict().argv;
  const argv: CommandLineConfig = {
    passive: !!yargv.passive,
    startDate: yargv.startDate,
  };

  let startDate: luxon.DateTime | undefined;
  try {
    if (argv.startDate) {
      const isoString = new Date(argv.startDate).toISOString();
      startDate = luxon.DateTime.fromISO(isoString);
    }
  } catch { }

  const config = yaml.load(fs.readFileSync("./src/config.yaml.local", "utf-8")) as Config;
  // don't hide other teams if none are favourited
  const hasFavouriteTeams = !!(config.favouriteTeams && config.favouriteTeams.length);
  config.hideOtherTeams = hasFavouriteTeams && config.hideOtherTeams ||
                          argv.passive;

  if (!startDate) {
    // will set timezone to somewhat central US so that we always get all matches
    // for current US day, even if you are actually in Asia
    startDate = luxon.DateTime.local().setZone(config.matchTimeZone);
  }
  let dateLastSelected = startDate;
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
    const feedSelection = await chooseFeed(argv.passive, processedGame.feedList!);
    if (feedSelection.cancelSelection) {
      return;
    }
    const processedFeed = feedSelection.processedFeed;
    const feed = processedFeed.epgItem;
    
    const streamList = await getStreamList(config, processedFeed);
    if (!streamList.auth || !streamList.mediaAuth || streamList.unknownError) {
      throw new Error(streamList.unknownError);
    }

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
