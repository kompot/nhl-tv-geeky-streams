import * as fs from "fs";
import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as luxon from "luxon";
import * as yargs from "yargs";

import {
  Config,
  ProcessedGame,
  ProcessedGameList,
  ProviderTeam,
  ProcessedFeedList,
} from './geekyStreamsApi';
import {
  getNhltvGameList,
} from "./nhltvProvider";

import { chooseFeed } from "./chooseFeed";
import { chooseGame } from "./chooseGame";
import { chooseStream } from "./chooseStream";
import {
  calcRecordingOffset,
} from "./calcRecordingOffset";

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
    const feedSelection = await chooseFeed(argv.passive, processedGame);
    if (feedSelection.cancelSelection) {
      return;
    }
    const processedFeed = feedSelection.processedFeed;
    const feedInfo = processedFeed.info;
    
    const streamList = await processedFeed.providerFeed.getStreamList(config);
    if (streamList.unknownError) {
      throw new Error(streamList.unknownError);
    }

    const streamSelection = await chooseStream(argv.passive, config.preferredStreamQuality, streamList);
    if (streamSelection.cancelSelection) {
      return;
    } else if (streamSelection.selectNewGame) {
      continue;
    }

    const providerStream = streamSelection.providerStream;
    const processedStream = providerStream.getStream();

    const filename = [
      processedGame.gameDateTime
        .setZone(config.matchTimeZone)
        .toISODate(),
      processedGame.awayTeam.abbreviation.replace(/\s+/g, "_"),
      "at",
      processedGame.homeTeam.abbreviation.replace(/\s+/g, "_"),
      "(" + feedInfo.mediaFeedType + (feedInfo.callLetters && "_") + feedInfo.callLetters.replace('+', 'plus') + ")",
      processedStream.resolution,
      processedFeed.isLiveTvStream ? "live" : "archive"
    ].join("_");
  
    const recordingOffset = calcRecordingOffset(
      filename,
      processedGame.gameDateTime,
      processedFeed.isLiveTvStream,
      config
    );

    return providerStream.download(
      filename,
      recordingOffset,
      config.streamlinkExtraOptions
    );
  }
};

const getGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProcessedGameList> => {
  const nhltvGames = await getNhltvGameList(config, date);
  
  const games: ProcessedGame[] = [];
  const hiddenGames: ProcessedGame[] = [];

  nhltvGames.forEach(providerGame => {
    const awayTeam = providerGame.getAwayTeam();
    const homeTeam = providerGame.getHomeTeam();
    const isAwayTeamFavourite = isFavouriteTeam(awayTeam, config.favouriteTeams);
    const isHomeTeamFavourite = isFavouriteTeam(homeTeam, config.favouriteTeams);
    const hasFavouriteTeam = isAwayTeamFavourite || isHomeTeamFavourite;

    let isArchiveTvStreamAvailable = false;
    let isLiveTvStreamAvailable = false;
    const feeds = providerGame.getFeeds().map(f => {
      const processedFeed = f.getFeed();
      isArchiveTvStreamAvailable = isArchiveTvStreamAvailable || processedFeed.isArchiveTvStream;
      isLiveTvStreamAvailable = isLiveTvStreamAvailable || processedFeed.isLiveTvStream;
      return processedFeed;
    });
    const feedList: ProcessedFeedList = {
      feeds,
      isArchiveTvStreamAvailable,
      isLiveTvStreamAvailable,
      isTvStreamAvailable: isArchiveTvStreamAvailable || isLiveTvStreamAvailable,
    };

    const processedGame: ProcessedGame = {
      feedList,
      awayTeam,
      homeTeam,
      status: providerGame.getStatus(),
      gameDateTime: providerGame.getGameDateTime(),
      hasFavouriteTeam,
      isAwayTeamFavourite,
      isHomeTeamFavourite,
    };

    const showGame = !config.hideOtherTeams || processedGame.hasFavouriteTeam;
    if (showGame) {
      games.push(processedGame);
    } else {
      hiddenGames.push(processedGame);
    }
  });

  return {
    games,
    hiddenGames,
    queryDate: date,
  };
};

const isFavouriteTeam = (
  team: ProviderTeam,
  favouriteTeamsAbbreviations: string[] | undefined
): boolean => !!favouriteTeamsAbbreviations && favouriteTeamsAbbreviations.indexOf(team.abbreviation) !== -1;

main();
