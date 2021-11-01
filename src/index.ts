import * as fs from "fs";
import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as luxon from "luxon";

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

const config = yaml.load(fs.readFileSync("./src/config.yaml.local", "utf-8")) as Config;
// don't hide other teams if none are favourited
const hasFavouriteTeams = !!(config.favouriteTeams && config.favouriteTeams.length);
config.hideOtherTeams = hasFavouriteTeams && config.hideOtherTeams;

const main = async (
  // will set timezone to somewhat central US so that we always get all matches
  // for current US day, even if you are actually in Asia
  date: luxon.DateTime = luxon.DateTime.local().setZone(config.matchTimeZone)
): Promise<void> => {
  let dateLastSelected = date;
  while (true) {
    const gameList = await getGameList(config, dateLastSelected);
    const gameSelection = await chooseGame(gameList);
    if (gameSelection.isDateChange) {
      dateLastSelected = gameSelection.newDate;
      continue;
    }

    const processedGame = gameSelection.processedGame;
    const game = processedGame.game;
    const processedFeed = await chooseFeed(processedGame.feedList!);
    const feed = processedFeed.epgItem;
    
    const streamList = await getStreamList(config, processedFeed);
    if (!streamList.auth || !streamList.mediaAuth || streamList.unknownError) {
      throw new Error(streamList.unknownError);
    }

    const streamSelection = await chooseStream(streamList);
    if (streamSelection.selectNewGame) {
      continue;
    } else if (!streamSelection.processedStream) {
      return;
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
      streamSelection.auth,
      streamSelection.mediaAuth,
      streamSelection.processedStream,
      config.streamlinkExtraOptions
    );
  }
};

main();
