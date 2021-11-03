import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import {
  getAuthSession,
  AuthSession,
} from "./nhltvAuth";
import {
  download,
} from "./download";
import {
  Config,
  getProcessedStreams,
  OffsetObject,
  ProcessedFeed,
  ProcessedStream,
  ProviderFeed,
  ProviderGame,
  ProviderGameStatus,
  ProviderStream,
  ProviderStreamList,
  ProviderTeam,
} from "./geekyStreamsApi";
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
  MEDIA_STATE,
  NhlStatsApi,
  NhlStatsApiBaseUrl,
} from "./nhlStatsApi";

const gamesFile = "./tmp/games.nhltv.json";

const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});

class NhltvFeed implements ProviderFeed {
  epgItem: EpgItem;

  constructor(epgItem: EpgItem) {
    this.epgItem = epgItem;
  }

  getFeed(): ProcessedFeed {
    return {
      providerFeed: this,
      isArchiveTvStream: this.epgItem.mediaState === MEDIA_STATE.ARCHIVE,
      isLiveTvStream: this.epgItem.mediaState === MEDIA_STATE.ON,
      info: {
        mediaFeedType: this.epgItem.mediaFeedType,
        callLetters: this.epgItem.callLetters,
        feedName: this.epgItem.feedName,
      },
    };
  }

  getStreamList(config: Config): Promise<ProviderStreamList> {
    return getNhltvStreamList(config, this.epgItem);
  }
}

class NhltvGame implements ProviderGame {
  awayTeam: ProviderTeam;
  feeds: NhltvFeed[];
  game: Game;
  gameDateTime: luxon.DateTime;
  homeTeam: ProviderTeam;

  constructor(game: Game) {
    this.feeds = [];
    this.game = game;

    const nhltvEpg = this.game.content.media?.epg.find(e => e.title === EpgTitle.NHLTV);
    nhltvEpg?.items.forEach(epgItem => {
      this.feeds.push(new NhltvFeed(epgItem));
    });

    this.awayTeam = {
      abbreviation: this.game.teams.away.team.abbreviation,
      fullName: this.game.teams.away.team.name,
    };
    this.homeTeam = {
      abbreviation: this.game.teams.home.team.abbreviation,
      fullName: this.game.teams.home.team.name,
    };

    this.gameDateTime = luxon.DateTime.fromISO(this.game.gameDate);
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

  getStatus(): ProviderGameStatus {
    return this.game;
  }
}

class NhltvStream implements ProviderStream {
  auth: AuthSession;
  mediaAuth: string;
  stream: ProcessedStream;

  constructor(
    stream: ProcessedStream,
    auth: AuthSession,
    mediaAuth: string,
  ) {
    this.auth = auth;
    this.mediaAuth = mediaAuth;
    this.stream = stream;
  }

  download(filename: string, offset: OffsetObject, streamlinkExtraOptions: string[] | undefined): void {
    const streamlinkAuthOptions = [
      `--http-cookie`,
      "Authorization=" + this.auth.authHeader,
      `--http-cookie`,
      SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2 + "=" + this.mediaAuth,
    ];
    return download(filename, offset, this.stream.downloadUrl, streamlinkAuthOptions, streamlinkExtraOptions);
  }

  getStream(): ProcessedStream {
    return this.stream;
  }
}

const processGame = (
  game: Game
): ProviderGame => {
  const nhltvGame = new NhltvGame(game);
  return nhltvGame;
};

export const getNhltvGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const { data: { dates } } = await statsApi.request({
    url: "/schedule",
    params: {
      startDate: date.toISODate(),
      endDate: date.toISODate(),
      expand: "schedule.game.content.media.epg,schedule.teams,schedule.linescore"
    }
  });

  fs.writeFileSync(gamesFile, JSON.stringify(dates, null, 2));
  if (dates.length < 1) {
    throw new Error("No dates returned for schedule");
  }

  // we only asked for one date so only look at the first one
  const matchDay = dates[0];
  return matchDay.games.map(game => {
    return processGame(game);
  });
};

const getNhltvStreamList = async (
  config: Config,
  epgItem: EpgItem
): Promise<ProviderStreamList> => {
  const streamList: ProviderStreamList = {
    isBlackedOut: false,
    streams: [],
  };
  let auth: AuthSession;
  try {
    auth = await getAuthSession(config.email, config.password, epgItem.eventId);
  } catch (e) {
    if (e instanceof Error) {
      streamList.unknownError = e.message;   
      return streamList;   
    }
    
    throw e;
  }

  const r1 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      contentId: Number(epgItem.mediaPlaybackId),
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

  const mediaAuthAttribute = mediaStream.session_info.sessionAttributes.find(
    sa => sa.attributeName === SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2
  );

  if (!mediaAuthAttribute) {
    throw new Error("Missing auth attribute.");
  }

  const masterUrl =
    mediaStream.user_verified_event[0].user_verified_content[0]
      .user_verified_media_item[0].url;

  const streams = await getProcessedStreams(masterUrl);
  streamList.streams = streams.map(s => {
    return new NhltvStream(s, auth, mediaAuthAttribute.attributeValue);
  });

  return streamList;
};