import axios from "axios";
import * as _ from "lodash";
import * as luxon from "luxon";
const m3u8Parser = require("m3u8-parser");

import {
  MediaFeedType,
  GAME_DETAILED_STATE,
} from "./nhlStatsApi";

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
  getFeed(): ProcessedFeed;
  getStreamList(config: Config): Promise<ProviderStreamList>;
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
}

export interface ProviderStream {
  download(filename: string, offset: OffsetObject, streamlinkExtraOptions: string[] | undefined): void;
  getStream(): ProcessedStream;
}

export interface ProviderStreamList {
  isBlackedOut: boolean;
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
  cancelSelection: true;
  processedFeed?: never;
} | {
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

export const getProcessedStreams = async (
  masterUrl: string
): Promise<ProcessedStream[]> => {
  const masterPlaylistContent = await axios.get(masterUrl);

  const parser = new m3u8Parser.Parser();
  parser.push(masterPlaylistContent.data);
  parser.end();

  const streams: ProcessedStream[] = parser.manifest.playlists.map((playlist: any) => {
    return processStream(playlist, masterUrl);
  });
  streams.sort((x, y) => y.bandwidth - x.bandwidth);

  return streams;
};