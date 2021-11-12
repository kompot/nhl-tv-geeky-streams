import { RestypedBase } from "restyped";

export interface EspnWatchGraphqlApi {
  "/api": {
    GET: {
      query: {
        apiKey: string;
        query: string;
        variables: string;
      };
      response: {
        data: {
          upcomingAirings: EspnWatchGraphqlAiring[];
          liveAirings: EspnWatchGraphqlAiring[];
          overAirings: EspnWatchGraphqlAiring[];
          replayAirings: EspnWatchGraphqlAiring[];
          delayedReplayAirings: EspnWatchGraphqlAiring[];
        };
        errors: any;
      };
    };
  };
};

export interface EspnWatchProductApi extends RestypedBase {
  "/api/product/v3/watchespn/web/event": {
    GET: {
      query: {
        lang: string;
        features?: string;
        pageContentImageHeight?: string;
        pageContentImageWidth?: string;
        id: string;
        countryCode: string;
        entitlements?: string;
        tz: string;
      };
      response: EspnWatchProductEvent;
    };
  };
};

export interface EspnWatchProductEvent {
  page: EspnWatchProductEventPage;
}

interface EspnWatchProductEventPage {
  layout: string;//"category",
  edition: EspnWatchProductEventPageEdition;
  contents: EspnWatchProductEventPageContents;
}

interface EspnWatchProductEventPageEdition {
  name: string;//"United States",
  country: EspnWatchProductEventPageEditionCountry;
  branding: EspnWatchProductEventPageEditionBranding;
}

interface EspnWatchProductEventPageEditionBranding {
  name: string;//"ESPN",
  logoUrl: string//"http://a.espncdn.com/redesign/assets/img/logos/logo-espn-blk-90x22@2x.png",
  lightLogoUrl: string;//"http://a.espncdn.com/redesign/assets/img/logos/logo-espn-90x22@2x.png"
}

interface EspnWatchProductEventPageEditionCountry {
  name: string;//"United States of America"
}

interface EspnWatchProductEventPageContents {
  id: string;//"613b4f9c-032b-4332-9565-55f80825c347",
  eventId?: number;//401349276,
  isEvent?: boolean;//true,
  status: string;//"replay",
  type: string;//"listing",
  imageFormat: string;//"16x9",
  ratio: string;//"16x9",
  size: string;//"md",
  name: string;//"Buffalo Sabres vs. San Jose Sharks",
  subtitle: string;//"ESPN+ • ES • NHL",
  imageHref: string;//"https://s.secure.espncdn.com/stitcher/artwork/16x9.jpg?height=720&width=1280&source=https://artwork.espncdn.com/programs/a0cf5eef-a4ad-4151-bea1-91d15ee04315/16x9/1280x720_20211031165151.jpg&cb=12&templateId=espn.core.dtc.large.16x9.1&showBadge=true&package=ESPN_PLUS",
  backgroundImageHref: string;//"https://secure.espncdn.com/watchespn/images/espnplus/paywalls/ESPN_PLUS.paywall.png"
  date: string;//"Tuesday, November 02"
  shortDate: string;//"Tue, 11/2",
  utc: string;//"2021-11-02T21:25:00-05:00"
  time: string;//"9:25 PM"
  score: number;//-95000550,
  includeSponsor: boolean;//false
  showKey: boolean;//false,
  isLocked: boolean;//false,
  isPersonalized: boolean;//false,
  isDtcOnly: boolean;//true,
  isTveOnly: boolean;//false,
  streams: EspnWatchProductEventPageContentsStream[];
  links: EspnWatchProductEventPageContentsLinks,
  catalog: EspnWatchProductEventPageContentsCatalog[],
  iconHref: string;//"http://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nhl.png&w=100&h=100&transparent=true"
}

interface EspnWatchProductEventPageContentsStream {
  id: string;//"613b4f9c-032b-4332-9565-55f80825c347",
  status: string;//"replay",
  tier: string;//"primary",
  name: string;//"Sabres vs. Sharks",
  duration?: string;//"2:27:54",
  source: EspnWatchProductEventPageContentsStreamSource;
  score: number;//-95000550,
  showKey: boolean;//false,
  isLocked: boolean;//false,
  authTypes: string[];//["direct"],
  packages: string[];//["ESPN_PLUS"],
  adobeRSS: string;//"<rss version='2.0' xmlns:media='http://search.yahoo.com/mrss/'><channel><title>espn_dtc</title><item><title>Buffalo Sabres vs. San Jose Sharks</title><guid>613b4f9c-032b-4332-9565-55f80825c347</guid><media:rating scheme='urn:v-chip'></media:rating></item></channel></rss>",
  isPersonalized: boolean;//false,
  links: EspnWatchProductEventPageContentsStreamLinks;
}

interface EspnWatchProductEventPageContentsStreamSource {
  id: string;//"ESPN_DTC",
  name: string;//"ESPN+",
  lang: string;//"es",
  type: string;//"online"
}

interface EspnWatchProductEventPageContentsStreamLinks {
  play: string;//"https://watch-cdn.product.api.espn.com/api/product/v3/watchespn/web/playback/event?id=613b4f9c-032b-4332-9565-55f80825c347&tz=UTC-0500&lang=en&countryCode=US&entitlements=ESPN_PLUS&features=watch-web-redesign,imageRatio58x13,promoTiles,openAuthz",
  appPlay: string;//"sportscenter://x-callback-url/showWatchStream?playID=613b4f9c-032b-4332-9565-55f80825c347",
  web: string;//"http://www.espn.com/watch?id=613b4f9c-032b-4332-9565-55f80825c347",
  shareUrl: string;//"http://www.espn.com/watch?id=613b4f9c-032b-4332-9565-55f80825c347"
}

interface EspnWatchProductEventPageContentsLinks {
  appPlay: string;//"sportscenter://x-callback-url/showWatchStream?playGameID=401349276",
  play: string;//"https://watch-cdn.product.api.espn.com/api/product/v3/watchespn/web/playback/event?id=613b4f9c-032b-4332-9565-55f80825c347&tz=UTC-0500&lang=en&countryCode=US&entitlements=ESPN_PLUS&features=watch-web-redesign,imageRatio58x13,promoTiles,openAuthz"
}

interface EspnWatchProductEventPageContentsCatalog {
  id: string;//"1a5f0227-a13e-396c-8cea-8961bc288666",
  type: string;//"league",
  name: string;//"NHL",
  link: string;//"https://watch-cdn.product.api.espn.com/api/product/v3/watchespn/web/catalog/1a5f0227-a13e-396c-8cea-8961bc288666?&tz=UTC-0500&lang=en&countryCode=US&entitlements=ESPN_PLUS&features=watch-web-redesign,imageRatio58x13,promoTiles,openAuthz"
}

interface EspnWatchGraphqlAiringNetwork {
  id: string;//"bam_dtc",
  type: string;//"online",
  abbreviation: string;//"bam_dtc",
  name: string;//"ESPN+",
  shortName: string;//"ESPN+",
  adobeResource: string;//"bam_dtc",
  isIpAuth: boolean;//false
}

interface EspnWatchGraphqlAiringSource {
  url: string;//"https://playback.svcs.plus.espn.com/media/61bd1200-4732-4295-bf30-5e38ee630792/scenarios/{scenario}",
  authorizationType: string;//"BAM",
  hasPassThroughAds: boolean;//false,
  hasNielsenWatermarks: boolean;//false,
  hasEspnId3Heartbeats: boolean;//false,
  commercialReplacement: string;//null
}

interface EspnWatchGraphqlAiringPackage {
  name: string;//"ESPN_PLUS"
}

interface EspnWatchGraphqlAiringCategory {
  id: string;//"2512ac76-a335-39cb-af51-b9afffc6571d",
  name: string;//"Ice Hockey"
}

interface EspnWatchGraphqlAiringSubcategory {
  id: string;//"1a5f0227-a13e-396c-8cea-8961bc288666",
  name: string;//"NHL"
}

interface EspnWatchGraphqlAiringSport {
  id: string;//"s:70",
  name: string;//"Hockey",
  abbreviation: string;//null,
  code: string;//null
}

interface EspnWatchGraphqlAiringLeague {
  id: string;//"s:70~l:90",
  name: string;//"NHL",
  abbreviation: string;//null,
  code: string;//null
}

interface EspnWatchGraphqlAiringProgram {
  id: string;//"e6d495f8-85c2-4867-859c-6d47bb776da5",
  code: string;//"",
  categoryCode: string;//"",
  isStudio: boolean;//false
}

export interface EspnWatchGraphqlAiring {
  id: string;//"057a4e42-d706-487a-8e6f-f2218865bbb7",
  airingId: string;//null,
  eventId: number | null;
  simulcastAiringId: string;//"114958339",
  name: string;//"New York Islanders vs. Philadelphia Flyers",
  type: string;//"REPLAY",
  startDateTime: string;//"2021-09-28T23:00:00Z",
  shortDate: string;//"shortDate": "9/28",
  authTypes: string[];//[ "DIRECT" ],
  adobeRSS: string;//"<rss version='2.0' xmlns:media='http://search.yahoo.com/mrss/'><channel><title>bam_dtc</title><item><title>New York Islanders vs. Philadelphia Flyers</title><guid>057a4e42-d706-487a-8e6f-f2218865bbb7</guid><media:rating scheme='urn:v-chip'></media:rating></item></channel></rss>",
  duration: number;//9448,
  feedName: string | null;//"Flyers Broadcast",
  network: EspnWatchGraphqlAiringNetwork;
  source: EspnWatchGraphqlAiringSource;
  packages: EspnWatchGraphqlAiringPackage[];
  category: EspnWatchGraphqlAiringCategory;
  subcategory: EspnWatchGraphqlAiringSubcategory;
  sport: EspnWatchGraphqlAiringSport;
  league: EspnWatchGraphqlAiringLeague;
  program: EspnWatchGraphqlAiringProgram;
}