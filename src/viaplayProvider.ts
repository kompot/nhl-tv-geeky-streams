import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import {
  Config,
  getProviderTeamFromLocation,
  ProcessedFeed,
  ProviderFeed,
  ProviderGame,
  ProviderStreamList,
  ProviderTeam,
  timeXhrRequest,
} from "./geekyStreamsApi";
import {
  ViaplayContentApi,
  ViaplayContentProduct,
} from "./viaplayContentApi";
import { MediaFeedType } from "./nhlStatsApi";

export const viaplayContentApi = axiosRestyped.create<ViaplayContentApi>({
  baseURL: "https://content.viaplay.se/xdk-se",
});

const gamesFile = "./tmp/games.viaplay.se.json";

class ViaplayFeed implements ProviderFeed {
  providerName: string = "viaplay.se";
  drmProtected: boolean = true;
  epgItem: ViaplayContentProduct;

  constructor(epgItem: ViaplayContentProduct) {
    this.epgItem = epgItem;
  }

  getFeed(): ProcessedFeed {
    let startTime = luxon.DateTime.fromISO(this.epgItem.epg.startTime || this.epgItem.epg.start);
    const now = luxon.DateTime.now();
    let isArchiveTvStream = false;
    let isLiveTvStream = false;

    if (this.epgItem.system.flags.findIndex(x => x === 'isLive') !== -1) {
      isLiveTvStream = true;
    } else if (now > startTime) {
      isArchiveTvStream = true;
    }

    return {
      providerFeed: this,
      isArchiveTvStream,
      isLiveTvStream,
      info: {
        mediaFeedType: MediaFeedType.Unknown,
        callLetters: "",
        feedName: "",
      },
    };
  }

  getStreamList(config: Config): Promise<ProviderStreamList> {
    throw new Error('Not implemented');
  }
}

class ViaplayGame implements ProviderGame {
  awayTeam: ProviderTeam;
  feeds: ViaplayFeed[];
  gameDateTime: luxon.DateTime;
  homeTeam: ProviderTeam;

  constructor(gameDateTime: luxon.DateTime, awayTeam: ProviderTeam, homeTeam: ProviderTeam, feed: ViaplayFeed) {
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

interface DecodedViaplayProductTitle {
  awayTeam: ProviderTeam;
  homeTeam: ProviderTeam;
}

const decodeViaplayProductTitle = (product: ViaplayContentProduct): DecodedViaplayProductTitle | null => {
  const reTeams = /((.*)-)? *(.*[^ ]) +\- +(.*[^ ]) */;
  const productTitle = product.content.title;
  const teamsMatch = reTeams.exec(productTitle);

  if (teamsMatch) {
    const awayTeamLocation = teamsMatch[4];
    const homeTeamLocation = teamsMatch[3];
    const awayTeam = getProviderTeamFromLocation(awayTeamLocation);
    const homeTeam = getProviderTeamFromLocation(homeTeamLocation);

    if (awayTeam && homeTeam) {
      return {
        awayTeam,
        homeTeam,
      };
    }
  }

  return null;
}

export const getViaplayGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const contentResponse = await timeXhrRequest(viaplayContentApi, {
    url: "/sport/ishockey",
  });

  fs.writeFileSync(gamesFile, JSON.stringify(contentResponse.data, null, 2));
  
  const games: ProviderGame[] = [];
  const shortDate = date.toISODate();

  for (const block of contentResponse.data._embedded["viaplay:blocks"]) {
    if (block.type !== "list") {
      continue;
    }

    for (const product of block._embedded["viaplay:products"]) {
      if (product.type !== "sport" || product.content?.format?.title !== "NHL") {
        continue;
      }

      const decodedViaplayProductTitle = decodeViaplayProductTitle(product);
      let awayTeam: ProviderTeam;
      let homeTeam: ProviderTeam;

      if (!decodedViaplayProductTitle) {
        awayTeam = {
          fullName: "Please File Bug",
          abbreviation: "ERR",
          nickname: "Please File Bug",
        };
        homeTeam = {
          fullName: product.content.title,
          abbreviation: product.content.title,
          nickname: product.content.title,
        };
      } else {
        awayTeam = decodedViaplayProductTitle.awayTeam;
        homeTeam = decodedViaplayProductTitle.homeTeam;
      }

      const gameDateTime = luxon.DateTime.fromISO(product.hour);
      if (gameDateTime.setZone(config.matchTimeZone).toISODate() !== shortDate) {
        continue;
      }

      const feed = new ViaplayFeed(product);
      const game = new ViaplayGame(gameDateTime, awayTeam, homeTeam, feed);
      games.push(game);
    }
  }

  return games;
};
