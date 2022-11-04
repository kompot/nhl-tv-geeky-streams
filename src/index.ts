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
  ProviderGame,
  getGameId,
  ProcessedFeed,
  setLogTimings,
} from './geekyStreamsApi';
import {
  getBallyGameList,
} from "./ballyProvider";
import {
  getEspnGameList,
} from "./espnProvider";
import {
  getNhltvGameList,
} from "./nhltvProvider";
import {
  getNhltvCleengGameList,
} from "./nhltvCleengProvider";

import { chooseFeed } from "./chooseFeed";
import { chooseGame } from "./chooseGame";
import { chooseStream } from "./chooseStream";
import {
  calcRecordingOffset,
} from "./calcRecordingOffset";
import { getViaplayGameList } from "./viaplayProvider";

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

  const config = yaml.load(fs.readFileSync("./config.yaml", "utf-8")) as Config;
  // don't hide other teams if none are favourited
  const hasFavouriteTeams = !!(config.favouriteTeams && config.favouriteTeams.length);
  config.hideOtherTeams = hasFavouriteTeams && config.hideOtherTeams ||
                          argv.passive;
  setLogTimings(config.enableLogTimings);

  if (!startDate) {
    // will set timezone to somewhat central US so that we always get all matches
    // for current US day, even if you are actually in Asia
    startDate = luxon.DateTime.local().setZone(config.matchTimeZone);
  }
  let dateLastSelected = startDate;
  while (true) {
    const gameList = await getGameList(config, dateLastSelected);
    
    let processedGame: ProcessedGame | null = null;
    let processedFeed: ProcessedFeed | null = null;

    while (true) {
      processedGame = null;
      processedFeed = null;

      const gameSelection = await chooseGame(argv.passive, gameList);
      if (gameSelection.isDateChange) {
        dateLastSelected = gameSelection.newDate;
        break;
      } else if (gameSelection.cancelSelection) {
        return;
      }

      processedGame = gameSelection.processedGame;

      const feedSelection = await chooseFeed(config, argv.passive, processedGame);
      if (feedSelection.isGameChange) {
        continue;
      } else if (feedSelection.cancelSelection) {
        return;
      }

      processedFeed = feedSelection.processedFeed;

      break;
    }

    if (!processedGame || !processedFeed) {
      continue;
    }

    const streamList = await processedFeed.providerFeed.getStreamList(config, argv.passive);
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
    const feedInfo = processedFeed.info;

    const filename = [
      processedGame.gameDateTime
        .setZone(config.matchTimeZone)
        .toISODate(),
      sanitizeFeedInfoForFileName(processedGame.awayTeam.abbreviation),
      "at",
      sanitizeFeedInfoForFileName(processedGame.homeTeam.abbreviation),
      "(" + feedInfo.mediaFeedType + (feedInfo.callLetters && "_") + sanitizeFeedInfoForFileName(feedInfo.callLetters) + ")",
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
  const disableNhltv = !!config.disableLegacyNhltvGameStatus;
  const disableOtherProviders = !config.showOtherProviders && !!config.preferredProvider;
  const disableNhltvCleeng = disableOtherProviders && config.preferredProvider !== 'nhltv';
  const disableEspn = disableOtherProviders && config.preferredProvider !== 'espn';
  const disableBally = !config.enableExperimentalProviders || disableOtherProviders && config.preferredProvider !== 'bally';
  const disableViaplay = !config.enableExperimentalProviders || disableOtherProviders && config.preferredProvider !== 'viaplay.se';

  // Continue using legacy NHL.TV API to get the game's status.
  const nhltvGamesPromise = disableNhltv ? null : getNhltvGameList(config, date);
  const nhltvCleengGamesPromise = disableNhltvCleeng ? null : getNhltvCleengGameList(config, date);
  const espnGamesPromise = disableEspn ? null : getEspnGameList(config, date);
  const ballyGamesPromise = disableBally ? null : getBallyGameList(config, date);
  const viaplayGamesPromise = disableViaplay ? null : getViaplayGameList(config, date);
  const nhltvGames = await nhltvGamesPromise ?? [];
  const nhltvCleengGames = await nhltvCleengGamesPromise ?? [];
  const espnGames = await espnGamesPromise ?? [];
  const ballyGames = await ballyGamesPromise ?? [];
  const viaplayGames = await viaplayGamesPromise ?? [];
  
  const gamesById = new Map<string, ProviderGame[]>();
  const games: ProcessedGame[] = [];
  const hiddenGames: ProcessedGame[] = [];
  
  [...nhltvGames, ...nhltvCleengGames, ...espnGames, ...ballyGames, ...viaplayGames].forEach(providerGame => {
    const key = getGameId(providerGame.getGameDateTime(), providerGame.getAwayTeam(), providerGame.getHomeTeam());

    let collection = gamesById.get(key);
    if (!collection) {
      collection = [];
      gamesById.set(key, collection);
    }

    collection.push(providerGame);
  });

  gamesById.forEach(providerGames => {
    const providerGame = providerGames[0];
    const gameDateTime = providerGame.getGameDateTime();
    const awayTeam = providerGame.getAwayTeam();
    const homeTeam = providerGame.getHomeTeam();
    const isAwayTeamFavourite = isFavouriteTeam(awayTeam, config.favouriteTeams);
    const isHomeTeamFavourite = isFavouriteTeam(homeTeam, config.favouriteTeams);
    const hasFavouriteTeam = isAwayTeamFavourite || isHomeTeamFavourite;

    let providerFeeds = providerGame.getFeeds();
    for (let i = 1; i < providerGames.length; i++) {
      providerFeeds = providerFeeds.concat(providerGames[i].getFeeds());
    }

    let isArchiveTvStreamAvailable = false;
    let isLiveTvStreamAvailable = false;
    const feeds = providerFeeds.map(f => {
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
      gameDateTime,
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

const sanitizeFeedInfoForFileName = (s: string): string => {
  return s ? s.replace(/(\s|\.)+/g, "_").replace('+', 'plus') : s;
}

main();
