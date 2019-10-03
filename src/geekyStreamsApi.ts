import axios from "axios";
import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import * as m3u8Parser from "m3u8-parser";
import axiosRestyped from "restyped-axios";

import {
  BLACKOUT_STATUS,
  CDN,
  FORMAT,
  NhlMfApi,
  NhlMfApiBaseUrl,
  PLAYBACK_SCENARIO,
  Response,
  SESSION_ATTRIBUTE_NAME,
} from "./nhlMfApi";
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

import {
  getAuthSession,
  AuthSession,
} from "./auth";

const gamesFile = "./tmp/games.json";

const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

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

export interface ProcessedStreamList {
  auth: AuthSession;
  isBlackedOut: boolean;
  mediaAuth: string;
  preferredStream: ProcessedStream;
  streams: ProcessedStream[];
  unknownError: string;
}

export interface GameSelection {
  isDateChange: boolean;
  newDate?: luxon.DateTime;
  processedGame?: ProcessedGame;
}

export interface StreamSelection {
  auth?: AuthSession;
  mediaAuth: string;
  processedStream?: ProcessedStream;
  selectNewGame: boolean;
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

const processStream = (
  pl: any,
  masterUrl: string
): ProcessedStream => {
  const framerate = pl.attributes["FRAME-RATE"]
    ? _.round(pl.attributes["FRAME-RATE"])
    : "";
  const rows = pl.attributes.RESOLUTION.height;
  const resolution = `${rows}p${framerate}`;
  const bandwidth = pl.attributes.BANDWIDTH;
  const bitrate = "" + bandwidth / 1000 + "k";
  const downloadUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1) + pl.uri;

  return {
    bandwidth,
    bitrate,
    displayName: null,
    downloadUrl,
    resolution,
  };
};

const getPreferredStream = (
  streams: ProcessedStream[],
  preferredQuality: string
): ProcessedStream => {
  let preferredStream: ProcessedStream = null;
  if (preferredQuality && streams.length > 0) {
    if (preferredQuality === "best") {
      preferredStream = streams[0];
    } else if (preferredQuality === "worst") {
      preferredStream = streams[streams.length - 1];
    } else {
      preferredStream = streams.find(s => s.resolution === preferredQuality);
    }
  }
  return preferredStream;
};

export const getStreamList = async (
  config: Config,
  processedFeed: ProcessedFeed,
): Promise<ProcessedStreamList> => {
  const streamList: ProcessedStreamList = {
    auth: null,
    isBlackedOut: false,
    mediaAuth: null,
    preferredStream: null,
    streams: [],
    unknownError: null,
  };
  let auth: AuthSession | undefined;
  try {
    auth = await getAuthSession(config.email, config.password, processedFeed.epgItem.eventId);
  } catch (e) {
    streamList.unknownError = e.message;
    return streamList;
  }
  streamList.auth = auth;

  const r1 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      contentId: Number(processedFeed.epgItem.mediaPlaybackId),
      playbackScenario: PLAYBACK_SCENARIO.HTTP_CLOUD_WIRED_60,
      sessionKey: auth.sessionKey,
      auth: "response",
      format: FORMAT.JSON,
      cdnName: CDN.AKAMAI
    },
    headers: {
      Authorization: auth.authHeader
    }
  });
  const mediaStream = r1.data as Response.Playlist;
  // console.log(
  //   "_____ r1",
  //   JSON.stringify(mediaStream, null, 2)
  // );

  if (
    mediaStream.user_verified_event[0].user_verified_content[0]
      .user_verified_media_item[0].blackout_status.status ===
    BLACKOUT_STATUS.BLACKED_OUT
  ) {
    streamList.isBlackedOut = true;
    return streamList;
  }

  streamList.mediaAuth = mediaStream.session_info.sessionAttributes.find(
    sa => sa.attributeName === SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2
  ).attributeValue;
  const masterUrl =
    mediaStream.user_verified_event[0].user_verified_content[0]
      .user_verified_media_item[0].url;

  const masterPlaylistContent = await axios.get(masterUrl);

  const parser = new m3u8Parser.Parser();
  parser.push(masterPlaylistContent.data);
  parser.end();

  const streams: ProcessedStream[] = parser.manifest.playlists.map(playlist => {
    return processStream(playlist, masterUrl);
  });
  streams.sort((x, y) => y.bandwidth - x.bandwidth);
  streamList.streams = streams;
  streamList.preferredStream = getPreferredStream(streams, config.preferredStreamQuality);

  return streamList;
};