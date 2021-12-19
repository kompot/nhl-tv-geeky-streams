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
  emailNhlLive: string;
  passwordNhlLive: string;
  matchTimeZone: string;
  playLiveGamesFromStart?: boolean;
  favouriteTeams?: string[];
  streamlinkExtraOptions?: string[];
  hideOtherTeams?: boolean;
  preferredProvider?: string;
  preferredStreamQuality?: string;
  enableLogTimings?: boolean;
  enableExperimentalProviders?: boolean;
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
  const downloadUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1) + pl.uri;

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

  const streams: ProcessedStream[] = parser.manifest.playlists.map((playlist: any) => {
    return processStream(playlist, masterUrl);
  });
  streams.sort((x, y) => y.bandwidth - x.bandwidth);

  return streams;
};

export const getGameId = (gameDateTime: luxon.DateTime, awayTeam: ProviderTeam, homeTeam: ProviderTeam): string => {
  return `${gameDateTime.toFormat("yyyy_MM_dd")}_${awayTeam.nickname}_${homeTeam.nickname}`;
}

let enableLogTimings = false;
export const setLogTimings = (enable: boolean): void => {
  enableLogTimings = enable;
}

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