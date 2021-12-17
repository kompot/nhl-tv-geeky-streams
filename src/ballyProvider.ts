import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import {
  download,
} from "./download";
import {
  BallyStreamAuthSession,
  createBallyAuthSession,
} from "./ballyAuth";
import {
  BallyLiveApi,
  BallyLiveListItem,
  BallyLiveListResponse,
} from "./ballyLiveApi";
import {
  SportRadarWidgetApi,
  SportRadarWidgetScoreboardMatches,
  SportRadarWidgetScoreboardMatchTeam,
} from "./sportRadarWidgetApi";
import {
  Config,
  getDashProcessedStreams,
  OffsetObject,
  ProcessedFeed,
  ProcessedStream,
  ProviderFeed,
  ProviderGame,
  ProviderStream,
  ProviderStreamList,
  ProviderTeam,
  timeXhrRequest,
} from "./geekyStreamsApi";
import {
  MediaFeedType,
} from "./nhlStatsApi";
import { AxiosRequestConfig } from "axios";

const gamesFile = "./tmp/games.bally.json";
const scoreboardFile = "./tmp/scoreboard.bally.json";
const seasonInfoFile = "./tmp/seasoninfo.bally.json";

const ballyLiveApi = axiosRestyped.create<BallyLiveApi>({
  baseURL: "https://www.ballysports.deltatre.digital/api/v2/live",
});

const idPathVariableInterceptor = (config: AxiosRequestConfig): AxiosRequestConfig => {
  if (config.params && config.url) {
    config.url = config.url.replace("/:id", `/${config.params.id}`);
    config.params.id = undefined;
  }

  return config;
};

const sportRadarWidgetApi = axiosRestyped.create<SportRadarWidgetApi>({
  baseURL: "https://uswidgets.fn.sportradar.com/sportradarmlb/en_us/Etc:UTC/gismo",
});
sportRadarWidgetApi.interceptors.request.use(idPathVariableInterceptor);

interface BallyAiring {
  listItem: BallyLiveListItem;
  gameDateTime: luxon.DateTime;
  type: "UPCOMING" | "LIVE" | "REPLAY";
}

class BallyFeed implements ProviderFeed {
  providerName: string = "BallyRSN";
  drmProtected: boolean = true;
  processedFeed: ProcessedFeed;
  airing: BallyAiring;

  constructor(airing: BallyAiring, awayTeam: ProviderTeam, homeTeam: ProviderTeam) {
    let mediaFeedType: MediaFeedType = MediaFeedType.Unknown;
    if (airing.listItem.customId.indexOf(awayTeam.nickname.toLowerCase().replace(" ", "-")) !== -1) {
      mediaFeedType = MediaFeedType.Away;
    } else if (airing.listItem.customId.indexOf(homeTeam.nickname.toLowerCase().replace(" ", "-")) !== -1) {
      mediaFeedType = MediaFeedType.Home;
    }

    const callLetters = airing.listItem.customFields.RsnId.toUpperCase();
    const isArchiveTvStream = airing.type === "REPLAY";
    const isLiveTvStream = airing.type === "LIVE";
    const info = {
      mediaFeedType,
      callLetters,
      feedName: "",
    };

    this.airing = airing;
    this.processedFeed = {
      providerFeed: this,
      isArchiveTvStream,
      isLiveTvStream,
      info,
    };
  }

  getFeed(): ProcessedFeed {
    return this.processedFeed;
  }

  getStreamList(config: Config, passive: boolean): Promise<ProviderStreamList> {
    return getBallyStreamList(config, passive, this.airing);
  }
}

class BallyGame implements ProviderGame {
  awayTeam: ProviderTeam;
  feeds: BallyFeed[];
  gameDateTime: luxon.DateTime;
  homeTeam: ProviderTeam;

  constructor(gameDateTime: luxon.DateTime, awayTeam: ProviderTeam, homeTeam: ProviderTeam, feed: BallyFeed) {
    this.gameDateTime = gameDateTime;
    this.awayTeam = awayTeam;
    this.homeTeam = homeTeam;
    this.feeds = [ feed ];
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

class BallyStream implements ProviderStream {
  streamAuthSession: BallyStreamAuthSession;
  stream: ProcessedStream;

  constructor(
    stream: ProcessedStream,
    streamAuthSession: BallyStreamAuthSession,
  ) {
    this.streamAuthSession = streamAuthSession;
    this.stream = stream;
  }

  download(filename: string, offset: OffsetObject, streamlinkExtraOptions: string[] | undefined): void {
    // TODO: need to confirm
    const streamlinkAuthOptions = [
      `--http-header`,
      "Authorization=" + this.streamAuthSession.streamAuth,
    ];
    return download(filename, offset, this.stream.downloadUrl, streamlinkAuthOptions, streamlinkExtraOptions);
  }

  getStream(): ProcessedStream {
    return this.stream;
  }
}

const compareBallyFeeds = (x: BallyFeed, y: BallyFeed): number => {
  return mediaFeedTypeToNumber(x) - mediaFeedTypeToNumber(y);

  function mediaFeedTypeToNumber(feed: BallyFeed): number {
    switch (feed.processedFeed.info.mediaFeedType) {
      case MediaFeedType.National:
        return 1;
      case MediaFeedType.Home:
        return 2;
      case MediaFeedType.Away:
        return 3;
      case MediaFeedType.French:
        return 4;
      case MediaFeedType.Spanish:
        return 5;
      case MediaFeedType.Composite:
        return 6;
      case MediaFeedType.Iso:
        return 7;
      default:
        return 8;
    }
  }
};

const getProviderTeam = (team: SportRadarWidgetScoreboardMatchTeam): ProviderTeam => {
  return {
    abbreviation: team.abbr,
    fullName: team.mediumname,
    nickname: team.nickname,
  };
}

export const getBallyGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const uniqueTournamentInfoPromise = timeXhrRequest(sportRadarWidgetApi, {
    url: "/uniquetournament_info/:id",
    params: {
      id: 234, //NHL
    },
  });
  const airings = await getBallyScheduleForDate(config, date);

  const uniqueTournamentInfoResponse = await uniqueTournamentInfoPromise;
  fs.writeFileSync(seasonInfoFile, JSON.stringify(uniqueTournamentInfoResponse.data, null, 2));

  if (airings.length === 0) {
    return [];
  }

  let matches: SportRadarWidgetScoreboardMatches | undefined;

  if (uniqueTournamentInfoResponse.data.doc.length) {
    const scoreboardResponse = await timeXhrRequest(sportRadarWidgetApi, {
      url: "/livescore_season_fixtures/:id",
      params: {
        id: uniqueTournamentInfoResponse.data.doc[0].data.uniquetournament.currentseason,
      },
    });
    fs.writeFileSync(scoreboardFile, JSON.stringify(scoreboardResponse.data, null, 2));

    matches = scoreboardResponse.data.doc[0]?.data.matches;
  }

  const games: BallyGame[] = [];

  for (const airing of airings) {
    const listItem = airing.listItem;

    if (true) {
      const scoreboardMatch = matches ? matches[listItem.customFields.SportsRadarId] : undefined;
      let awayTeam: ProviderTeam;
      let homeTeam: ProviderTeam;

      if (!scoreboardMatch) {
        awayTeam = {
          fullName: "Please File Bug",
          abbreviation: "ERR",
          nickname: "Please File Bug",
        };
        homeTeam = {
          fullName: listItem.title,
          abbreviation: listItem.title,
          nickname: listItem.title,
        };
      } else {
        awayTeam = getProviderTeam(scoreboardMatch.teams.away);
        homeTeam = getProviderTeam(scoreboardMatch.teams.home);
      }

      const feed = new BallyFeed(airing, awayTeam, homeTeam);
      const game = new BallyGame(airing.gameDateTime, awayTeam, homeTeam, feed);
      games.push(game);
    }
  }

  return games;
};

const getBallyScheduleForDate = async (
  config: Config,
  date: luxon.DateTime
): Promise<BallyAiring[]> => {
  const todayDate = luxon.DateTime.local().setZone(config.matchTimeZone);
  const daysSinceToday = date.diff(todayDate).as("days");
  const todayShortDate = todayDate.toISODate();
  const shortDate = date.toISODate();
  const includeLive = todayShortDate === shortDate;
  const includeUpcoming = includeLive || daysSinceToday > 0;
  const includeReplay = includeLive || daysSinceToday < 0;
  const livePromise = !includeLive ? null : timeXhrRequest(ballyLiveApi, {
    url: "/list",
    params: {
      live_event_type: "live",
      page_size: 100,
    },
  });
  const upcomingPromise = !includeUpcoming ? null : timeXhrRequest(ballyLiveApi, {
    url: "/list",
    params: {
      live_event_type: "upcoming",
      page_size: 100,
    },
  });
  const replayPromise = !includeReplay ? null : timeXhrRequest(ballyLiveApi, {
    url: "/list",
    params: {
      live_event_type: "replays",
      page_size: 100,
    },
  });

  const liveResponse = await livePromise;
  const upcomingResponse = await upcomingPromise;
  const replayResponse = await replayPromise;
  const allResponses = {
    live: liveResponse?.data,
    upcoming: upcomingResponse?.data,
    replay: replayResponse?.data,
  };

  fs.writeFileSync(gamesFile, JSON.stringify(allResponses, null, 2));

  const airings: BallyAiring[] = [];
  processBallyLiveListResponse(allResponses.live, "LIVE");
  processBallyLiveListResponse(allResponses.upcoming, "UPCOMING");
  processBallyLiveListResponse(allResponses.replay, "REPLAY");

  function processBallyLiveListResponse(response: BallyLiveListResponse | undefined, type: "LIVE" | "UPCOMING" | "REPLAY"): void {
    if (!response) return;

    for (const listItem of response.items) {
      const gameDateTime = luxon.DateTime.fromISO(listItem.eventDate);

      if (
        gameDateTime.setZone(config.matchTimeZone).toISODate() !== shortDate || // only want items from requested date
        !listItem.categories.some(c => c === "league-nhl") || // only want NHL
        listItem.customFields.LiveCategory !== "event" // only want games
      ) { 
        continue;
      }

      airings.push({
        listItem,
        gameDateTime,
        type,
      });
    }
  }

  return airings;
};

const getBallyStreamList = async (
  config: Config,
  passive: boolean,
  airing: BallyAiring
): Promise<ProviderStreamList> => {
  const streamList: ProviderStreamList = {
    isBlackedOut: false,
    streams: [],
  };
  const authSession = createBallyAuthSession();
  let streamAuthSession: BallyStreamAuthSession;

  try {
    streamAuthSession = await authSession.requestStreamAccessToken(!passive, airing.listItem.videoId);
  } catch (e) {
    if (e instanceof Error) {
      streamList.unknownError = e.message;   
      return streamList;   
    }
    
    throw e;
  }

  const streams = await getDashProcessedStreams(streamAuthSession.streamUrl);
  streamList.streams = streams.map(s => {
    return new BallyStream(s, streamAuthSession);
  });

  return streamList;
};