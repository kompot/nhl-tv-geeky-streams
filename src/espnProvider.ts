import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import * as querystring from "querystring";
import axiosRestyped, { TypedAxiosResponse } from "restyped-axios";

import {
  download,
} from "./download";
import {
  createEspnAuthSession,
} from "./espnAuth";
import {
  EspnSiteApi,
  EspnSiteScoreboardDayCompetitorTeam,
  EspnSiteScoreboardDayEvent
} from "./espnSiteApi";
import {
  EspnWatchGraphqlAiring,
  EspnWatchGraphqlApi,
  EspnWatchProductApi,
  EspnWatchProductEvent,
} from "./espnWatchApi";
import {
  Config,
  getProcessedStreams,
  OffsetObject,
  ProcessedFeed,
  ProcessedFeedInfo,
  ProcessedStream,
  ProviderFeed,
  ProviderGame,
  ProviderStream,
  ProviderStreamList,
  ProviderTeam,
  timeXhrFetch,
  timeXhrRequest,
} from "./geekyStreamsApi";
import {
  MediaFeedType,
} from "./nhlStatsApi";

const eventsFile = "./tmp/events.espn.json";
const gamesFile = "./tmp/games.espn.json";
const scoreboardFile = "./tmp/scoreboard.espn.json";

const espnSiteApi = axiosRestyped.create<EspnSiteApi>({
  baseURL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl",
});

const espnWatchGraphqlApi = axiosRestyped.create<EspnWatchGraphqlApi>({
  baseURL: "https://watch.graph.api.espn.com",
});

const espnWatchProductApi = axiosRestyped.create<EspnWatchProductApi>({
  baseURL: "https://watch-cdn.product.api.espn.com",
});

interface AiringAndEventInfo {
  airing: EspnWatchGraphqlAiring,
  eventInfoResponse: Promise<TypedAxiosResponse<EspnWatchProductApi, "/api/product/v3/watchespn/web/event", "GET">> | null
}

abstract class EspnProviderFeed implements ProviderFeed {
  providerName: string = "WatchESPN";
  processedFeed: ProcessedFeed;

  constructor(isArchiveTvStream: boolean, isLiveTvStream: boolean, info: ProcessedFeedInfo) {
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

  abstract getStreamList(config: Config, passive: boolean): Promise<ProviderStreamList>;
}

class EspnFeed extends EspnProviderFeed {
  airing: EspnWatchGraphqlAiring;

  constructor(airing: EspnWatchGraphqlAiring, awayTeam: ProviderTeam, homeTeam: ProviderTeam, eventInfo?: EspnWatchProductEvent) {
    let mediaFeedType: MediaFeedType = MediaFeedType.Unknown;
    let callLetters: string | null = airing.feedName;
    if (airing.feedName) {
      if (airing.feedName.indexOf(awayTeam.nickname) !== -1) {
        mediaFeedType = MediaFeedType.Away;
      } else if (airing.feedName.indexOf(homeTeam.nickname) !== -1) {
        mediaFeedType = MediaFeedType.Home;
      } else if (airing.feedName.indexOf("National") !== -1 || airing.feedName.indexOf("English") !== -1) {
        mediaFeedType = MediaFeedType.National;
      } else if (airing.feedName.indexOf("Spanish") !== -1 || airing.feedName.indexOf("(SPA)")) {
        mediaFeedType = MediaFeedType.Spanish;
      }
    } else if (eventInfo && eventInfo.page.contents.streams.length) {
      const eventStream = eventInfo.page.contents.streams[0];
      callLetters = airing.network?.shortName ?? eventStream.source?.name;
      switch (eventStream.source.lang) {
        case "en":
          mediaFeedType = MediaFeedType.National;
          break;
        case "es":
          mediaFeedType = MediaFeedType.Spanish;
          break;
        case "fr":
          mediaFeedType = MediaFeedType.French;
          break;
      }
    }

    const isArchiveTvStream = airing.type === "REPLAY";
    const isLiveTvStream = airing.type === "LIVE";
    const info = {
      mediaFeedType,
      callLetters: callLetters ?? "",
      feedName: "",
    };

    super(isArchiveTvStream, isLiveTvStream, info);
    this.airing = airing;
  }

  getStreamList(config: Config, passive: boolean): Promise<ProviderStreamList> {
    return getEspnStreamList(config, passive, this.airing);
  }
}

class NonEspnFeed extends EspnProviderFeed {
  constructor(networkNameFromScoreboard: string) {
    let networkName: string;
    switch (networkNameFromScoreboard) {
      case "NHL NET":
        networkName = "NHL Network";
        break;
      default:
        networkName = networkNameFromScoreboard;
        break;
    }

    const info = {
      mediaFeedType: MediaFeedType.National,
      callLetters: `Feeds delayed 24 hours from game start due to airing on ${networkName}`,
      feedName: "",
    };

    super(false, false, info);
  }

  getStreamList(config: Config, passive: boolean): Promise<ProviderStreamList> {
    throw new Error("Not implemented");
  }
}

class EspnGame implements ProviderGame {
  awayTeam: ProviderTeam;
  feeds: EspnProviderFeed[];
  gameDateTime: luxon.DateTime;
  homeTeam: ProviderTeam;
  scoreboardEvent?: EspnSiteScoreboardDayEvent;

  constructor(gameDateTime: luxon.DateTime, awayTeam: ProviderTeam, homeTeam: ProviderTeam, scoreboardEvent?: EspnSiteScoreboardDayEvent) {
    this.gameDateTime = gameDateTime;
    this.awayTeam = awayTeam;
    this.homeTeam = homeTeam;
    this.scoreboardEvent = scoreboardEvent;
    this.feeds = [];
  }

  finalizeFeeds(): void {
    if (this.feeds.length) {
      this.feeds.sort(compareEspnFeeds);
    } else if (this.scoreboardEvent && this.scoreboardEvent.competitions[0].broadcasts) {
      for (const broadcast of this.scoreboardEvent.competitions[0].broadcasts) {
        if (broadcast.names.length === 1) {
          const feed = new NonEspnFeed(broadcast.names[0]);
          this.feeds.push(feed);
        }
      }
    }
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

class EspnStream implements ProviderStream {
  bamAccessToken: string;
  stream: ProcessedStream;

  constructor(
    stream: ProcessedStream,
    bamAccessToken: string,
  ) {
    this.bamAccessToken = bamAccessToken;
    this.stream = stream;
  }

  download(filename: string, offset: OffsetObject, streamlinkExtraOptions: string[] | undefined): void {
    const streamlinkAuthOptions = [
      `--http-header`,
      "Authorization=" + this.bamAccessToken,
    ];
    return download(filename, offset, this.stream.downloadUrl, streamlinkAuthOptions, streamlinkExtraOptions);
  }

  getStream(): ProcessedStream {
    return this.stream;
  }
}

const compareEspnFeeds = (x: EspnProviderFeed, y: EspnProviderFeed): number => {
  return mediaFeedTypeToNumber(x) - mediaFeedTypeToNumber(y);

  function mediaFeedTypeToNumber(feed: EspnProviderFeed): number {
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

const processGame = (
  scoreboardEvent: EspnSiteScoreboardDayEvent
): EspnGame => {
  const gameDateTime = luxon.DateTime.fromISO(scoreboardEvent.date);
  const homeCompetitor = scoreboardEvent.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayCompetitor = scoreboardEvent.competitions[0].competitors.find(c => c.homeAway === "away");

  if (!homeCompetitor || !awayCompetitor) {
    throw new Error(`Invalid event: ${scoreboardEvent.id}`);
  }

  const awayTeam = getProviderTeam(awayCompetitor.team);
  const homeTeam = getProviderTeam(homeCompetitor.team);

  return new EspnGame(gameDateTime, awayTeam, homeTeam, scoreboardEvent);
};

const getProviderTeam = (team: EspnSiteScoreboardDayCompetitorTeam): ProviderTeam => {
  return {
    abbreviation: team.abbreviation,
    fullName: team.displayName,
    nickname: team.name,
  };
}

export const getEspnGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const scoreboardPromise = timeXhrRequest(espnSiteApi, {
    url: "/scoreboard",
    params: {
      dates: date.toFormat("yyyyMMdd"),
    },
  });
  const airingWithEventInfos = await getEspnScheduleForDate(config, date);

  const scoreboardResponse = await scoreboardPromise;
  fs.writeFileSync(scoreboardFile, JSON.stringify(scoreboardResponse.data, null, 2));

  const eventById = new Map<string, EspnGame>();
  const games: EspnGame[] = [];
  for (const scoreboardEvent of scoreboardResponse.data.events) {
    const game = processGame(scoreboardEvent);
    eventById.set(scoreboardEvent.id, game);
    games.push(game);
  }

  const eventInfos: EspnWatchProductEvent[] = [];

  for (const airingWithEventInfo of airingWithEventInfos) {
    const airing = airingWithEventInfo.airing;
    const eventInfoResponse = await airingWithEventInfo.eventInfoResponse;
    const eventInfo = eventInfoResponse?.data;
    if (eventInfo) {
      eventInfos.push(eventInfo);
    }

    if (airing.eventId) {
      const key = airing.eventId.toString();
      let game = eventById.get(key);

      if (!game) {
        const gameDateTime = luxon.DateTime.fromISO(airing.startDateTime);
        const awayTeam: ProviderTeam = {
          fullName: "Please File Bug",
          abbreviation: "ERR",
          nickname: "Please File Bug",
        };
        const homeTeam = {
          fullName: airing.name,
          abbreviation: airing.name,
          nickname: airing.name,
        };
        game = new EspnGame(gameDateTime, awayTeam, homeTeam);
        games.push(game);
      }

      const feed = new EspnFeed(airing, game.awayTeam, game.homeTeam, eventInfo);
      game.feeds.push(feed);
    }
  }

  fs.writeFileSync(eventsFile, JSON.stringify(eventInfos, null, 2));

  games.forEach(g => g.finalizeFeeds());

  return games;
};

const getEspnScheduleForDate = async (
  config: Config,
  date: luxon.DateTime
): Promise<AiringAndEventInfo[]> => {
  const todayDate = luxon.DateTime.local().setZone(config.matchTimeZone);
  const daysSinceToday = date.diff(todayDate).as("days");
  const todayShortDate = todayDate.toISODate();
  const shortDate = date.toISODate();
  const nextShortDate = date.plus({ days: 1 }).toISODate();
  const timeZone = `UTC${todayDate.toFormat('ZZZ')}`;
  const apiKey = "0dbf88e8-cc6d-41da-aa83-18b5c630bc5c";
  const includeLive = todayShortDate === shortDate;
  const includeUpcoming = includeLive || daysSinceToday > 0;
  const includeDelayedReplay = !includeLive && daysSinceToday < 0;
  const includeReplay = includeLive || includeDelayedReplay;
  let query = `query Airings ( $countryCode: String!, $deviceType: DeviceType!, $tz: String!, $categories: [String], $networks: [String], $packages: [String], $eventId: String, $packageId: String, $start: String, $end: String, $day: String, ${(includeDelayedReplay ? "$nextDay: String, " : "")}$limit: Int ) {`;
  let queryPieces: string[] = [];
  if (includeUpcoming) {
    queryPieces.push(" upcomingAirings: airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: 'UPCOMING', categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { ...airingFields }");
  }
  if (includeLive) {
    queryPieces.push(" liveAirings: airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: 'LIVE', categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { ...airingFields }");
  }
  if (includeReplay) {
    queryPieces.push(" replayAirings: airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: 'REPLAY', categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { ...airingFields }");
    if (includeDelayedReplay) {
      queryPieces.push(" delayedReplayAirings: airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: 'REPLAY', categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $nextDay, limit: $limit ) { ...airingFields }");
    }
  }
  query += queryPieces.join(",");
  query += " } fragment airingFields on Airing { id airingId eventId simulcastAiringId name type startDateTime shortDate: startDate(style: SHORT) authTypes adobeRSS duration feedName network { id type abbreviation name shortName adobeResource isIpAuth } source { url authorizationType hasPassThroughAds hasNielsenWatermarks hasEspnId3Heartbeats commercialReplacement } packages { name } category { id name } subcategory { id name } sport { id name abbreviation code } league { id name abbreviation code } program { id code categoryCode isStudio } }";
  try {
    const variables = `{"deviceType":"DESKTOP","countryCode":"US","tz":"${timeZone}","packages":null,"categories":["2512ac76-a335-39cb-af51-b9afffc6571d"],"day":"${shortDate}","nextDay":"${nextShortDate}","limit":500}`;
    const response = await timeXhrRequest(espnWatchGraphqlApi, {
      url: "/api",
      params: {
        apiKey,
        query,
        variables,
      },
      paramsSerializer: (params) => {
        let result = '';
        Object.keys(params).forEach(key => {
          if (result) {
            result += '&';
          }
          
          result += `${key}=${querystring.escape(params[key])}`;
        });
        return result;
      },
    });
    
    fs.writeFileSync(gamesFile, JSON.stringify({ query, variables, responseData: response.data }, null, 2));

    if (response.data.errors) {
      throw {
        response
      };
    }

    const airingWithEventInfos: AiringAndEventInfo[] = [];
    const airingById = new Map();
    const airingLists = [ response.data.data.delayedReplayAirings, response.data.data.replayAirings, response.data.data.overAirings, response.data.data.liveAirings, response.data.data.upcomingAirings ];
    const expectedShortDate = date.toFormat("M/d");
    airingLists.forEach(airingList => {
      if (!airingList) return;

      airingList.forEach(airing => {
        if (airingById.has(airing.id)) return;
        airingById.set(airing.id, null);

        if (airing.subcategory.id !== "1a5f0227-a13e-396c-8cea-8961bc288666" || // only want NHL
            airing.shortDate !== expectedShortDate || // nationally televised games are returned on the wrong day
            airing.type !== "UPCOMING" && !airing.source.url // url-less feeds are useless except when the game hasn't started
        ) {
          return;
        }

        const eventInfoResponse = airing.feedName || !airing.eventId ? null : timeXhrRequest(espnWatchProductApi, {
          url: "/api/product/v3/watchespn/web/event",
          params: {
            lang: "en",
            //features: "watch-web-redesign,imageRatio58x13,promoTiles,openAuthz",
            //pageContentImageHeight: "720",
            //pageContentImageWidth: "1280",
            id: airing.id,
            countryCode: "US",
            //entitlements: "ESPN_PLUS",
            tz: timeZone,
          },
        });

        airingWithEventInfos.push({
          airing,
          eventInfoResponse,
        });
      });
    });

    return airingWithEventInfos;
  } catch (e: any) {
    if (e?.response?.data?.errors)
    {
      console.error(e.response.data.errors);
    }
    throw e;
  }
};

const getEspnStreamList = async (
  config: Config,
  passive: boolean,
  airing: EspnWatchGraphqlAiring
): Promise<ProviderStreamList> => {
  if (airing.source.authorizationType !== "BAM") {
    throw new Error("Unsupported WatchESPN authorization type: " + airing.source.authorizationType);
  }

  const streamList: ProviderStreamList = {
    isBlackedOut: false,
    streams: [],
  };
  const authSession = createEspnAuthSession();
  let mediaAuth: string;

  try {
    mediaAuth = await authSession.requestBamAccessToken(!passive);
  } catch (e) {
    if (e instanceof Error) {
      streamList.unknownError = e.message;   
      return streamList;   
    }
    
    throw e;
  }
  
  const scenarioUrl = airing.source.url.replace("{scenario}", "browser~ssai");
  let scenarioData: any;
  try {
    const scenarioResponse = await timeXhrFetch(scenarioUrl, {
      headers: {
        Authorization: mediaAuth,
        Accept: "application/vnd.media-service+json; version=2",
      },
    });
    scenarioData = scenarioResponse.data;
  } catch (e: any) {
    if (e?.response && e.response.status === 403) {
      scenarioData = e.response.data;
    } else {
      if (e?.response?.data) {
        console.log(e.response.data);
      }
      throw e;
    }
  }

  if (scenarioData.errors) {
    console.log(JSON.stringify(scenarioData.errors));
    let errorMessage = "";

    for (const error of scenarioData.errors) {
      if (error.code === "blackout") {
        streamList.isBlackedOut = true;
        return streamList;
      }

      if (error.code) {
        errorMessage += error.code + ' ';
      }
      if (error.description) {
        errorMessage += error.description + ' ';
      }
    };
    throw new Error(errorMessage);
  }

  const masterUrl: string = scenarioData.stream.complete || scenarioData.stream.slide;

  const streams = await getProcessedStreams(masterUrl);
  streamList.streams = streams.map(s => {
    return new EspnStream(s, mediaAuth);
  });

  return streamList;
};