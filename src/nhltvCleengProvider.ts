import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import { download } from "./download";
import {
  Config,
  getHlsProcessedStreams,
  getProviderTeamFromAbbreviation,
  OffsetObject,
  ProcessedFeed,
  ProcessedStream,
  ProviderFeed,
  ProviderGame,
  ProviderStream,
  ProviderStreamList,
  ProviderTeam,
  timeXhrRequest,
  timeXhrRequestPost,
} from "./geekyStreamsApi";
import {
  NHLTV_CLEENG_MEDIA_STATE,
  nhltvCleengApi,
  NhltvCleengEvent,
  NhltvCleengEventContentItem,
  NhltvCleengEventCompetitor,
  NhltvCleengStreamAccessApi,
  NhltvCleengHttpUserAgent,
} from "./nhltvCleengApi";
import {
  createNhltvCleengAuthSession,
  INhltvCleengAuthenticationSession,
} from "./nhltvCleengAuth";
import { MediaFeedType } from "./nhlStatsApi";

const gamesFile = "./tmp/games.nhltv.cleeng.json";

class NhltvCleengFeed implements ProviderFeed {
  providerName: string = "NHL.TV";
  drmProtected: boolean = false;
  epgItem: NhltvCleengEventContentItem;

  constructor(epgItem: NhltvCleengEventContentItem) {
    this.epgItem = epgItem;
  }

  getFeed(): ProcessedFeed {
    let mediaFeedType: MediaFeedType = MediaFeedType.Unknown;
    if (this.epgItem.clientContentMetadata.length) {
      mediaFeedType = this.epgItem.clientContentMetadata[0].name as MediaFeedType;
    } else if (this.epgItem.editorial.translations?.en?.description) {
      mediaFeedType = this.epgItem.editorial.translations?.en?.description.toUpperCase() as MediaFeedType;
    }

    return {
      providerFeed: this,
      isArchiveTvStream: this.epgItem.status.name === NHLTV_CLEENG_MEDIA_STATE.DELIVERED,
      isLiveTvStream: this.epgItem.status.name === NHLTV_CLEENG_MEDIA_STATE.LIVE,
      info: {
        mediaFeedType,
        callLetters: "",
        feedName: "",
      },
    };
  }

  getStreamList(config: Config): Promise<ProviderStreamList> {
    return getNhltvCleengStreamList(config, this.epgItem);
  }
}

class NhltvCleengGame implements ProviderGame {
  awayTeam: ProviderTeam;
  feeds: NhltvCleengFeed[];
  game: NhltvCleengEvent;
  gameDateTime: luxon.DateTime;
  homeTeam: ProviderTeam;

  constructor(game: NhltvCleengEvent) {
    this.feeds = [];
    this.game = game;

    const nhltvFeeds: NhltvCleengFeed[] = [];
    this.game.content.forEach(epgItem => {
      if (epgItem.contentType.name === "Full Game") {
        nhltvFeeds.push(new NhltvCleengFeed(epgItem));
      }
    });
    this.feeds = nhltvFeeds;

    this.awayTeam = getProviderTeam(this.game.awayCompetitor);
    this.homeTeam = getProviderTeam(this.game.homeCompetitor);

    this.gameDateTime = luxon.DateTime.fromISO(this.game.startTime);
  }

  getAwayTeam(): ProviderTeam {
    return this.awayTeam;
  }

  getHomeTeam(): ProviderTeam {
    return this.homeTeam;
  }

  getFeeds(): ProviderFeed[] {
    return this.feeds;
  }

  getGameDateTime(): luxon.DateTime {
    return this.gameDateTime;
  }

  getStatus(): null {
    return null;
  }
}

class NhltvCleengStream implements ProviderStream {
  authSession: INhltvCleengAuthenticationSession;
  mediaAuth: string;
  stream: ProcessedStream;

  constructor(
    stream: ProcessedStream,
    authSession: INhltvCleengAuthenticationSession,
    mediaAuth: string,
  ) {
    this.authSession = authSession;
    this.mediaAuth = mediaAuth;
    this.stream = stream;
  }

  download(filename: string, offset: OffsetObject, streamlinkExtraOptions: string[] | undefined): void {
    const streamlinkAuthOptions = [
      `--http-header`,
      "User-Agent=" + NhltvCleengHttpUserAgent,
    ];

    return download(filename, offset, this.stream.downloadUrl, streamlinkAuthOptions, streamlinkExtraOptions);
  }

  getStream(): ProcessedStream {
    return this.stream;
  }
}

const getProviderTeam = (team: NhltvCleengEventCompetitor): ProviderTeam => {
  const providerTeam = getProviderTeamFromAbbreviation(team.shortName);
  if (!providerTeam) {
    throw new Error(JSON.stringify(team));
  }
  return providerTeam;
}

const processGame = (
  game: NhltvCleengEvent
): ProviderGame => {
  const nhltvGame = new NhltvCleengGame(game);
  return nhltvGame;
};

export const getNhltvCleengGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const dateFormatString = "yyyy-MM-dd";
  const targetDate = date.setZone(config.matchTimeZone);
  const dateStringEnding = targetDate.toFormat("'T12:00:00'ZZ");
  const dateFromString = date.minus({ days: 1 }).toFormat(dateFormatString) + dateStringEnding;
  const dateToString = date.plus({ days: 1 }).toFormat(dateFormatString) + dateStringEnding;

  const eventsResponse = await timeXhrRequest(nhltvCleengApi, {
    url: "/v2/events",
    params: {      
      date_time_from: dateFromString,
      date_time_to: dateToString,
      sort_direction: 'asc',
    }
  });

  fs.writeFileSync(gamesFile, JSON.stringify(eventsResponse.data, null, 2));
  
  const games: ProviderGame[] = [];
  const shortDate = date.toISODate();
  eventsResponse.data.data.forEach(game => {
    if (game.srMatchId) {
      const providerGame = processGame(game);

      if (providerGame.getGameDateTime().setZone(config.matchTimeZone).toISODate() === shortDate) {
        games.push(providerGame);
      }
    }
  });

  return games;
};

const getNhltvCleengStreamList = async (
  config: Config,
  epgItem: NhltvCleengEventContentItem
): Promise<ProviderStreamList> => {
  const streamList: ProviderStreamList = {
    isBlackedOut: false,
    streams: [],
  };
  const feedId = epgItem.id;
  const authSession = createNhltvCleengAuthSession(config);

  const mediaAuth = await authSession.requestStreamAccessToken(feedId);

  const playerSettingsResponse = await timeXhrRequest(nhltvCleengApi, {
    url: "/v3/contents/:id/player-settings",
    params: {
      id: feedId,
    },
  });

  const streamAccessUrl = playerSettingsResponse.data.streamAccess;
  const streamAccessEndpoint = axiosRestyped.create<NhltvCleengStreamAccessApi>({
    baseURL: streamAccessUrl,
  });

  const streamAccessResponse = await timeXhrRequestPost(streamAccessEndpoint, {
    url: "",
    headers: {
      authorization: mediaAuth,
      'User-Agent': NhltvCleengHttpUserAgent,
    },
  });

  if (!streamAccessResponse.data.data?.stream) {
    streamList.unknownError = streamAccessResponse.data.message || 'Manifest url not returned for NHL.TV feed';
    return streamList;
  }

  const masterUrl = streamAccessResponse.data.data.stream;
  const streams = await getHlsProcessedStreams(masterUrl, {
    headers: {
      'User-Agent': NhltvCleengHttpUserAgent,
    },
  });
  
  // The master playlist consistently has multiple streams for the same bitrate.
  // So far, the second stream of each bitrate doesn't work and has -b/ somewhere in the URL.
  // For now, assume that the -b/ is a better indicator than the order.
  const masterURL = new URL(masterUrl);
  const masterParentPath = masterURL.origin + masterURL.pathname.substring(0, masterURL.pathname.lastIndexOf('/'));

  const allProviderStreams: NhltvCleengStream[] = [];
  streams.forEach(s => {
    const stream = new NhltvCleengStream(s, authSession, mediaAuth);
    allProviderStreams.push(stream);
  });

  allProviderStreams.forEach(ps => {
    const testString = ps.stream.downloadUrl.toLowerCase();
    if (testString.indexOf('-b/') !== -1 || testString.indexOf('-b%2f') !== -1) {
      return;
    }

    streamList.streams.push(ps);
  });

  // Failsafe in case all the streams are filtered out.
  if (streamList.streams.length === 0) {
    streamList.streams = allProviderStreams;
  }

  return streamList;
};
