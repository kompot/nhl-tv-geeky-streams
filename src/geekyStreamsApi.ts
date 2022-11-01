import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as _ from "lodash";
import * as luxon from "luxon";
import { RestypedBase } from "restyped";
import { TypedAxiosInstance, TypedAxiosRequestConfig, TypedAxiosResponse } from "restyped-axios";
const m3u8Parser = require("m3u8-parser");

import {
  MediaFeedType,
  GAME_DETAILED_STATE,
} from "./nhlStatsApi";

export interface Config {
  emailNhltv: string;
  passwordNhltv: string;
  viaplayCountry?: string;
  matchTimeZone: string;
  playLiveGamesFromStart?: boolean;
  favouriteTeams?: string[];
  streamlinkExtraOptions?: string[];
  hideOtherTeams?: boolean;
  preferredProvider?: string;
  preferredStreamQuality?: string;
  enableLogTimings?: boolean;
  enableExperimentalProviders?: boolean;
  showOtherProviders?: boolean;
  disableLegacyNhltvGameStatus?: boolean;
}

export interface OffsetObject {
  finalFilename: string;
  // this is used for https://streamlink.github.io/cli.html#cmdoption-hls-start-offset
  // and has different meanings for live and archive matches
  // Amount of time to skip from the beginning of the stream. For live streams, this is a negative offset from the end of the stream.
  durationOffset: luxon.Duration;
  filesLength: number;
  recordingStart: number;
  recordingOffset: number;
}

export interface ProcessedFeedInfo {
  mediaFeedType: MediaFeedType;
  callLetters: string;
  feedName: string;
}

export interface ProcessedFeed {
  providerFeed: ProviderFeed;
  isArchiveTvStream: boolean;
  isLiveTvStream: boolean;
  info: ProcessedFeedInfo;
}

export interface ProcessedFeedList {
  feeds: ProcessedFeed[];
  isArchiveTvStreamAvailable: boolean;
  isLiveTvStreamAvailable: boolean;
  isTvStreamAvailable: boolean;
}

export interface ProviderFeed {
  providerName: string;
  drmProtected: boolean;
  getFeed(): ProcessedFeed;
  getStreamList(config: Config, passive: boolean): Promise<ProviderStreamList>;
}

export interface ProviderGame {
  getAwayTeam(): ProviderTeam;
  getHomeTeam(): ProviderTeam;
  getFeeds(): ProviderFeed[];
  getGameDateTime(): luxon.DateTime;
  getStatus(): ProviderGameStatus | null;
}

export interface ProviderGameStatus {
  linescore: {
    currentPeriodOrdinal: string;
    currentPeriodTimeRemaining: string;
  };
  status: {
    detailedState: GAME_DETAILED_STATE;
  };
}

export interface ProviderTeam {
  abbreviation: string,
  fullName: string,
  nickname: string,
}

export interface ProviderStream {
  download(filename: string, offset: OffsetObject, streamlinkExtraOptions: string[] | undefined): void;
  getStream(): ProcessedStream;
}

export interface ProviderStreamList {
  isBlackedOut: boolean;
  isUnauthorized?: boolean;
  streams: ProviderStream[];
  unknownError?: string;
}

export interface ProcessedGame {
  feedList: ProcessedFeedList;
  awayTeam: ProviderTeam;
  homeTeam: ProviderTeam;
  status: ProviderGameStatus | null;
  gameDateTime: luxon.DateTime;
  hasFavouriteTeam: boolean;
  isAwayTeamFavourite: boolean;
  isHomeTeamFavourite: boolean;
}

export interface ProcessedGameList {
  games: ProcessedGame[];
  hiddenGames: ProcessedGame[];
  queryDate: luxon.DateTime;
}

export interface ProcessedStream {
  bandwidth: number;
  bitrate: string;
  downloadUrl: string;
  resolution: string;
}

export type FeedSelection = {
  isGameChange: true;
  cancelSelection?: never;
  processedFeed?: never;
} | {
  isGameChange: false;
  cancelSelection: true;
  processedFeed?: never;
} | {
  isGameChange: false;
  cancelSelection: false;
  processedFeed: ProcessedFeed;
}

export type GameSelection = {
  isDateChange: true;
  cancelSelection?: never;
  newDate: luxon.DateTime;
  processedGame?: never;
} | {
  isDateChange: false;
  cancelSelection: true;
  newDate?: never;
  processedGame?: never;
} | {
  isDateChange: false;
  cancelSelection: false;
  newDate?: never;
  processedGame: ProcessedGame;
}

export type StreamSelection = {
  cancelSelection: true;
  providerStream?: never;
  selectNewGame?: never;
} | {
  cancelSelection: false;
  providerStream?: never;
  selectNewGame: true;
} | {
  cancelSelection: false;
  providerStream: ProviderStream;
  selectNewGame: false;
}

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
  const streamUrl = new URL(pl.uri, masterUrl);
  const downloadUrl = streamUrl.href;

  return {
    bandwidth,
    bitrate,
    downloadUrl,
    resolution,
  };
};

export const getDashProcessedStreams = async (masterUrl: string): Promise<ProcessedStream[]> => {
  throw new Error("Not implemented");
}

export const getHlsProcessedStreams = async (
  masterUrl: string
): Promise<ProcessedStream[]> => {
  const masterPlaylistContent = await timeXhrFetch(masterUrl);

  const parser = new m3u8Parser.Parser();
  parser.push(masterPlaylistContent.data);
  parser.end();

  const allStreams: ProcessedStream[] = parser.manifest.playlists.map((playlist: any) => {
    return processStream(playlist, masterUrl);
  });
  allStreams.sort((x, y) => y.bandwidth - x.bandwidth);

  const streams: ProcessedStream[] = [];
  const streamUrls = new Map<string, ProcessedStream>();

  for (const stream of allStreams) {
    if (streamUrls.get(stream.downloadUrl)) {
      continue;
    }

    streamUrls.set(stream.downloadUrl, stream);
    streams.push(stream);
  }

  return streams;
};

export const getGameId = (gameDateTime: luxon.DateTime, awayTeam: ProviderTeam, homeTeam: ProviderTeam): string => {
  return `${gameDateTime.toFormat("yyyy_MM_dd")}_${awayTeam.abbreviation}_${homeTeam.abbreviation}`;
}

let enableLogTimings = false;
export const setLogTimings = (enable: boolean): void => {
  enableLogTimings = enable;
}

export const idPathVariableInterceptor = (config: AxiosRequestConfig): AxiosRequestConfig => {
  if (config.params && config.url) {
    config.url = config.url.replace("/:id", `/${config.params.id}`);
    config.params.id = undefined;
  }

  return config;
};

export const timeXhrFetch = async (url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> => {
  const start = new Date();
  if (enableLogTimings) console.log('beginFetch', url, start);
  const result = await axios.get(url, config);
  const end = new Date();
  if (enableLogTimings) console.log('endFetch', url, end, luxon.DateTime.fromJSDate(end).diff(luxon.DateTime.fromJSDate(start)).toMillis());
  return result;
}

export const timeXhrGet = async <TAPI extends RestypedBase, TPath extends Extract<keyof TAPI, string>>(
  axiosInstance: TypedAxiosInstance<TAPI>,
  url: TPath | string,
  config?: TypedAxiosRequestConfig<TAPI, TPath, 'GET'>
): Promise<TypedAxiosResponse<TAPI, TPath, 'GET'>> => {
  const id = config?.params?.id;
  const start = new Date();
  if (enableLogTimings) console.log('beginGet', url, id, start);
  const result = await axiosInstance.get(url, config);
  const end = new Date();
  if (enableLogTimings) console.log('endGet', url, id, end, luxon.DateTime.fromJSDate(end).diff(luxon.DateTime.fromJSDate(start)).toMillis());
  return result;
}

export const timeXhrPost = async <TAPI extends RestypedBase, TPath extends Extract<keyof TAPI, string>>(
  axiosInstance: TypedAxiosInstance<TAPI>,
  url: TPath | string,
  data?: TAPI[TPath]['POST']['body'],
  config?: TypedAxiosRequestConfig<TAPI, TPath, 'POST'>
): Promise<TypedAxiosResponse<TAPI, TPath, 'POST'>> => {
  const start = new Date();
  if (enableLogTimings) console.log('beginPost', url, start);
  const result = await axiosInstance.post(url, data, config);
  const end = new Date();
  if (enableLogTimings) console.log('endPost', url, end, luxon.DateTime.fromJSDate(end).diff(luxon.DateTime.fromJSDate(start)).toMillis());
  return result;
}

export const timeXhrRequest = async <TAPI extends RestypedBase, TPath extends Extract<keyof TAPI, string>, TMethod extends keyof TAPI[TPath] = 'GET'>(
  axiosInstance: TypedAxiosInstance<TAPI>,
  config: TypedAxiosRequestConfig<TAPI, TPath, TMethod>
): Promise<TypedAxiosResponse<TAPI, TPath, TMethod>> => {
  const start = new Date();
  if (enableLogTimings) console.log('beginRequest', config.url, start);
  const result = await axiosInstance.request(config);
  const end = new Date();
  if (enableLogTimings) console.log('endRequest', config.url, end, luxon.DateTime.fromJSDate(end).diff(luxon.DateTime.fromJSDate(start)).toMillis());
  return result;
}

export const timeXhrRequestPost = async <TAPI extends RestypedBase, TPath extends Extract<keyof TAPI, string>>(
  axiosInstance: TypedAxiosInstance<TAPI>,
  config: TypedAxiosRequestConfig<TAPI, TPath, "POST">
): Promise<TypedAxiosResponse<TAPI, TPath, "POST">> => {
  config.method = "POST";
  return timeXhrRequest<TAPI, TPath, "POST">(axiosInstance, config);
}

const providerTeams: ProviderTeam[] = [
  {
    fullName: "New Jersey Devils",
    abbreviation: "NJD",
    nickname: "Devils",
  },
  {
    fullName: "New York Islanders",
    abbreviation: "NYI",
    nickname: "Islanders",
  },
  {
    fullName: "New York Rangers",
    abbreviation: "NYR",
    nickname: "Rangers",
  },
  {
    fullName: "Philadelphia Flyers",
    abbreviation: "PHI",
    nickname: "Flyers",
  },
  {
    fullName: "Pittsburgh Penguins",
    abbreviation: "PIT",
    nickname: "Penguins",
  },
  {
    fullName: "Boston Bruins",
    abbreviation: "BOS",
    nickname: "Bruins",
  },
  {
    fullName: "Buffalo Sabres",
    abbreviation: "BUF",
    nickname: "Sabres",
  },
  {
    fullName: "Montreal Canadiens",
    abbreviation: "MTL",
    nickname: "Canadiens",
  },
  {
    fullName: "Ottawa Senators",
    abbreviation: "OTT",
    nickname: "Senators",
  },
  {
    fullName: "Toronto Maple Leafs",
    abbreviation: "TOR",
    nickname: "Maple Leafs",
  },
  {
    fullName: "Carolina Hurricanes",
    abbreviation: "CAR",
    nickname: "Hurricanes",
  },
  {
    fullName: "Florida Panthers",
    abbreviation: "FLA",
    nickname: "Panthers",
  },
  {
    fullName: "Tampa Bay Lightning",
    abbreviation: "TBL",
    nickname: "Lightning",
  },
  {
    fullName: "Washington Capitals",
    abbreviation: "WSH",
    nickname: "Capitals",
  },
  {
    fullName: "Chicago Blackhawks",
    abbreviation: "CHI",
    nickname: "Blackhawks",
  },
  {
    fullName: "Detroit Red Wings",
    abbreviation: "DET",
    nickname: "Red Wings",
  },
  {
    fullName: "Nashville Predators",
    abbreviation: "NSH",
    nickname: "Predators",
  },
  {
    fullName: "St Louis Blues",
    abbreviation: "STL",
    nickname: "Blues",
  },
  {
    fullName: "Calgary Flames",
    abbreviation: "CGY",
    nickname: "Flames",
  },
  {
    fullName: "Colorado Avalanche",
    abbreviation: "COL",
    nickname: "Avalanche",
  },
  {
    fullName: "Edmonton Oilers",
    abbreviation: "EDM",
    nickname: "Oilers",
  },
  {
    fullName: "Vancouver Canucks",
    abbreviation: "VAN",
    nickname: "Canucks",
  },
  {
    fullName: "Anaheim Ducks",
    abbreviation: "ANA",
    nickname: "Ducks",
  },
  {
    fullName: "Dallas Stars",
    abbreviation: "DAL",
    nickname: "Stars",
  },
  {
    fullName: "Los Angeles Kings",
    abbreviation: "LAK",
    nickname: "Kings",
  },
  {
    fullName: "San Jose Sharks",
    abbreviation: "SJS",
    nickname: "Sharks",
  },
  {
    fullName: "Columbus Blue Jackets",
    abbreviation: "CBJ",
    nickname: "Blue Jackets",
  },
  {
    fullName: "Minnesota Wild",
    abbreviation: "MIN",
    nickname: "Wild",
  },
  {
    fullName: "Winnipeg Jets",
    abbreviation: "WPG",
    nickname: "Jets",
  },
  {
    fullName: "Arizona Coyotes",
    abbreviation: "ARI",
    nickname: "Coyotes",
  },
  {
    fullName: "Phoenix Coyotes",
    abbreviation: "PHX",
    nickname: "Coyotes",
  },
  {
    fullName: "Vegas Golden Knights",
    abbreviation: "VGK",
    nickname: "Golden Knights",
  },
  {
    fullName: "Seattle Kraken",
    abbreviation: "SEA",
    nickname: "Kraken",
  },
];

export const getProviderTeamFromAbbreviation = (abbreviation: string): ProviderTeam | null => {
  switch (abbreviation) {
    case "NJ":
    case "NJD":
      return providerTeams[0];
    case "NYI":
      return providerTeams[1];
    case "NYR":
      return providerTeams[2];
    case "PHI":
      return providerTeams[3];
    case "PIT":
      return providerTeams[4];
    case "BOS":
      return providerTeams[5];
    case "BUF":
      return providerTeams[6];
    case "MTL":
      return providerTeams[7];
    case "OTT":
      return providerTeams[8];
    case "TOR":
      return providerTeams[9];
    case "CAR":
      return providerTeams[10];
    case "FLA":
      return providerTeams[11];
    case "TB":
    case "TBL":
      return providerTeams[12];
    case "WSH":
      return providerTeams[13];
    case "CHI":
      return providerTeams[14];
    case "DET":
      return providerTeams[15];
    case "NSH":
      return providerTeams[16];
    case "STL":
      return providerTeams[17];
    case "CGY":
      return providerTeams[18];
    case "COL":
      return providerTeams[19];
    case "EDM":
      return providerTeams[20];
    case "VAN":
      return providerTeams[21];
    case "ANA":
      return providerTeams[22];
    case "DAL":
      return providerTeams[23];
    case "LA":
    case "LAK":
      return providerTeams[24];
    case "SJ":
    case "SJS":
      return providerTeams[25];
    case "CBJ":
      return providerTeams[26];
    case "MIN":
      return providerTeams[27];
    case "WPG":
      return providerTeams[28];
    case "ARI":
      return providerTeams[29];
    case "PHX":
      return providerTeams[30];
    case "VGK":
      return providerTeams[31];
    case "SEA":
      return providerTeams[32];
    default: return null;
  }
};

export const getProviderTeamFromLocation = (location: string): ProviderTeam | null => {
  switch (location) {
    case "New Jersey":
      return providerTeams[0];
    case "NY Islanders":
      return providerTeams[1];
    case "NY Rangers":
      return providerTeams[2];
    case "Philadelphia":
      return providerTeams[3];
    case "Pittsburgh":
      return providerTeams[4];
    case "Boston":
      return providerTeams[5];
    case "Buffalo":
      return providerTeams[6];
    case "Montreal":
      return providerTeams[7];
    case "Ottawa":
      return providerTeams[8];
    case "Toronto":
      return providerTeams[9];
    case "Carolina":
      return providerTeams[10];
    case "Florida":
      return providerTeams[11];
    case "Tampa Bay":
      return providerTeams[12];
    case "Washington":
      return providerTeams[13];
    case "Chicago":
      return providerTeams[14];
    case "Detroit":
      return providerTeams[15];
    case "Nashville":
      return providerTeams[16];
    case "St Louis":
    case "St. Louis":
      return providerTeams[17];
    case "Calgary":
      return providerTeams[18];
    case "Colorado":
      return providerTeams[19];
    case "Edmonton":
      return providerTeams[20];
    case "Vancouver":
      return providerTeams[21];
    case "Anaheim":
      return providerTeams[22];
    case "Dallas":
      return providerTeams[23];
    case "Los Angeles":
      return providerTeams[24];
    case "San Jose":
      return providerTeams[25];
    case "Columbus":
      return providerTeams[26];
    case "Minnesota":
      return providerTeams[27];
    case "Winnipeg":
      return providerTeams[28];
    case "Arizona":
      return providerTeams[29];
    case "Phoenix":
      return providerTeams[30];
    case "Vegas":
      return providerTeams[31];
    case "Seattle":
      return providerTeams[32];
    default: return null;
  }
};
