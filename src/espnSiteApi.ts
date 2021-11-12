export interface EspnSiteApi {
  "/scoreboard": {
    GET: {
      query: {
        dates: string;
      };
      response: EspnSiteScoreboardDay;
    };
  };
};

export interface EspnSiteScoreboardDay {
  events: EspnSiteScoreboardDayEvent[];
}

export interface EspnSiteScoreboardDayEvent {
  id: string;//"401349307",
  date: string;//"2021-11-07T23:00Z",
  competitions: EspnSiteScoreboardDayCompetition[],
  status: EspnSiteScoreboardDayStatus;
}

export interface EspnSiteScoreboardDayCompetition {
  competitors: EspnSiteScoreboardDayCompetitor[];
  broadcasts: EspnSiteScoreboardDayCompetitionBroadcast[];
}

export interface EspnSiteScoreboardDayCompetitionBroadcast {
  market: string;//"national",
  names: string[];//"NHL NET"
}

export interface EspnSiteScoreboardDayCompetitor {
  homeAway: string;//"home",
  team: EspnSiteScoreboardDayCompetitorTeam,
}

export interface EspnSiteScoreboardDayCompetitorTeam {
  location: string;//"Detroit",
  name: string;//"Red Wings",
  abbreviation: string;//"DET",
  displayName: string;//"Detroit Red Wings",
  shortDisplayName: string;//"Red Wings",
}

export interface EspnSiteScoreboardDayStatus {
  clock: number;//755,
  displayClock: string;//"12:35",
  period: number;//1,
  type: EspnSiteScoreboardDayStatusType;
}

export interface EspnSiteScoreboardDayStatusType {
  id: string;//"2",
  name: string;//"STATUS_IN_PROGRESS",
  state: string;//"in",
  completed: boolean;//false,
  description: string;//"In Progress",
  detail: string;//"12:35 - 1st Period",
  shortDetail: string;//"12:35 - 1st"
}