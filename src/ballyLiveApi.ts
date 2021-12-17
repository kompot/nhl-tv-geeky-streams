export interface BallyLiveApi {
  "/list": {
    GET: {
      query: {
        live_event_type: "live" | "upcoming" | "replays";
        page_size: number;
      };
      response: BallyLiveListResponse;
    };
  };
}

export interface BallyLiveListResponse {
  items: BallyLiveListItem[];
}

export interface BallyLiveListItem {
  videoId: string; //"a39c9877-cdcd-449e-b8ca-2e44bb2e809a",
  eventDate: string; //"2021-11-21T03:00:00Z",
  categories: string[]; //["region:ohio-greatlakes", "league-nhl", "match-nhl-28274546", "team-nhl-344158", "team-nhl-3683", "videostatus:ondemand"],
  customFields: BallyLiveListItemCustomFields;
  customId: string; //"columbus-blue-jackets-x8042",
  id: string; //"191808",
  type: string; //"program",
  subtype: string; //"live",
  shortDescription: string; //"From T-Mobile Arena in Las Vegas.",
  contextualTitle: string; //"Columbus Blue Jackets at Vegas Golden Knights",
  title: string; //"Columbus Blue Jackets at Vegas Golden Knights",
  path: string; //"/program/Columbus-Blue-Jackets-at-Vegas-Golden-Knights-191808",
  watchPath: string; //"/watch/Columbus-Blue-Jackets-at-Vegas-Golden-Knights-191808",
}

interface BallyLiveListItemCustomFields {
  VideoId: string; //"a39c9877-cdcd-449e-b8ca-2e44bb2e809a",
  VideoStatus: string; //"OnDemand",
  ForgeId: string; //"94a35255-4d7c-4b70-9fb3-8c97261b75cd",
  ContentDate: string; //"2021-11-07T08:08:53.4370000Z",
  MvpdProtected: boolean;
  MaterialId: string; //"100026071",
  Provider: string; //"LiveEvent",
  HasData: boolean;
  InputId: number;
  TmsId: string; //"EP029977174456",
  DistAreaCallsigns: string; //"FSOH2,FSOH1,FSOH12,FSOH13,FSOH3,FSOH5,FSOH9",
  RsnId: string; //"fsoh",
  League: string; //"NHL",
  Teams: string; //"Vegas Golden Knights,Columbus Blue Jackets",
  LiveCategory: string; //"event",
  SportsRadarId: number; //28274546
}