import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import {
  EpgItem,
  EpgTitle,
  Game,
  MatchDay,
  MEDIA_STATE,
  MediaFeedType,
  NhlStatsApi,
  NhlStatsApiBaseUrl,
  Team,
} from "./nhlStatsApi";

const gamesFile = "./tmp/games.json";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});

export interface Config {
  email: string;
  password: string;
  matchTimeZone: string;
  playLiveGamesFromStart?: boolean;
  favouriteTeams?: string[];
  streamlinkExtraOptions?: string[];
  hideOtherTeams?: boolean;
  preferredStreamQuality?: string;
  startDownloadingIfSingleGameFound: true;
}

export interface ProcessedFeed {
  displayName: string;
  epgItem: EpgItem;
  isArchiveTvStream: boolean;
  isForFavouriteTeam: boolean;
  isLiveTvStream: boolean;
}

export interface ProcessedFeedList {
  feeds: ProcessedFeed[];
  isArchiveTvStreamAvailable: boolean;
  isLiveTvStreamAvailable: boolean;
  isTvStreamAvailable: boolean;
}

export interface ProcessedGame {
  disableReason: string;
  displayName: string;
  feedList: ProcessedFeedList;
  game: Game;
  hasFavouriteTeam: boolean;
  isAwayTeamFavourite: boolean;
  isHomeTeamFavourite: boolean;
}

export interface ProcessedGameList {
  allGamesHaveTvStreamsAvailable: boolean;
  games: ProcessedGame[];
  hiddenGames: ProcessedGame[];
  matchDay: MatchDay;
  queryDate: luxon.DateTime;
}

export interface ProcessedStream {
  bandwidth: number;
  bitrate: string;
  displayName: string;
  downloadUrl: string;
  resolution: string;
}

export interface GameSelection {
  isDateChange: boolean;
  newDate?: luxon.DateTime;
  processedGame?: ProcessedGame;
}

const processFeeds = (
  processedGame: ProcessedGame,
): ProcessedFeedList => {
  let isArchiveTvStreamAvailable = false;
  let isLiveTvStreamAvailable = false;
  const feeds = processedGame.game.content.media.epg
    .find(e => e.title === EpgTitle.NHLTV)
    .items.map(epgItem => {
      const isArchiveTvStream = epgItem.mediaState === MEDIA_STATE.ARCHIVE;
      const isLiveTvStream = epgItem.mediaState === MEDIA_STATE.ON;
      const isForFavouriteTeam = epgItem.mediaFeedType === MediaFeedType.National && processedGame.hasFavouriteTeam ||
                                 epgItem.mediaFeedType === MediaFeedType.Away && processedGame.isAwayTeamFavourite ||
                                 epgItem.mediaFeedType === MediaFeedType.Home && processedGame.isHomeTeamFavourite;
      const processedFeed: ProcessedFeed = {
        displayName: null,
        epgItem,
        isArchiveTvStream,
        isForFavouriteTeam,
        isLiveTvStream,
      };
      isArchiveTvStreamAvailable = isArchiveTvStreamAvailable || isArchiveTvStream;
      isLiveTvStreamAvailable = isLiveTvStreamAvailable || isLiveTvStream;
      return processedFeed;
    });

  return {
    feeds,
    isArchiveTvStreamAvailable,
    isLiveTvStreamAvailable,
    isTvStreamAvailable: isArchiveTvStreamAvailable || isLiveTvStreamAvailable,
  };
};

const isFavouriteTeam = (
  team: Team,
  favouriteTeamsAbbreviations: string[]
): boolean => favouriteTeamsAbbreviations.indexOf(team.abbreviation) !== -1;

const processGame = (
  game: Game,
  favouriteTeamsAbbreviations: string[]
): ProcessedGame => {
  const isAwayTeamFavourite = isFavouriteTeam(game.teams.away.team, favouriteTeamsAbbreviations);
  const isHomeTeamFavourite = isFavouriteTeam(game.teams.home.team, favouriteTeamsAbbreviations);
  const hasFavouriteTeam = isAwayTeamFavourite || isHomeTeamFavourite;
  const processedGame: ProcessedGame = {
    disableReason: null,
    displayName: null,
    feedList: null,
    game,
    hasFavouriteTeam,
    isAwayTeamFavourite,
    isHomeTeamFavourite,
  };
  processedGame.feedList = processFeeds(processedGame);
  return processedGame;
};

export const getGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProcessedGameList> => {
  const { data: { dates } } = await statsApi.request({
    url: "/schedule",
    params: {
      startDate: date.toISODate(),
      endDate: date.toISODate(),
      expand: "schedule.game.content.media.epg,schedule.teams,schedule.linescore"
    }
  });
  
  fs.writeFileSync(gamesFile, JSON.stringify(dates, null, 2));

  const games: ProcessedGame[] = [];
  const hiddenGames: ProcessedGame[] = [];
  let matchDay: MatchDay = null;
  if (dates.length > 0) {
    // we only asked for one date so only look at the first one
    matchDay = dates[0];
    matchDay.games.forEach(game => {
      const processedGame = processGame(game, config.favouriteTeams);
      const showGame = !config.hideOtherTeams || processedGame.hasFavouriteTeam;
      if (showGame) {
        games.push(processedGame);
      } else {
        hiddenGames.push(processedGame);
      }
    });
  }
  const allGamesHaveTvStreamsAvailable = _.every(games, g => g.feedList.isTvStreamAvailable);

  return {
    allGamesHaveTvStreamsAvailable,
    games,
    hiddenGames,
    matchDay,
    queryDate: date,
  };
};