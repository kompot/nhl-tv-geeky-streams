export interface SportRadarWidgetApi {
  "/uniquetournament_info/:id": {
    GET: {
      params: {
        id: number;
      };
      response: SportRadarWidgetUniqueTournamentInfoResponse;
    };
  };
  "/livescore_season_fixtures/:id": {
    GET: {
      params: {
        id: number;
      };
      response: SportRadarWidgetScoreboardResponse;
    };
  };
};

export interface SportRadarWidgetUniqueTournamentInfoResponse {
  doc: SportRadarWidgetUniqueTournamentInfoDoc[];
}

interface SportRadarWidgetUniqueTournamentInfoDoc {
  data: SportRadarWidgetUniqueTournamentInfo;
}

interface SportRadarWidgetUniqueTournamentInfo {
  uniquetournament: SportRadarWidgetUniqueTournament;
}

interface SportRadarWidgetUniqueTournament {
  currentseason: number;
}

export interface SportRadarWidgetScoreboardResponse {
  doc: SportRadarWidgetScoreboardDoc[];
}

interface SportRadarWidgetScoreboardDoc {
  data: SportRadarWidgetScoreboardData;
}

interface SportRadarWidgetScoreboardData {
  matches: SportRadarWidgetScoreboardMatches;
}

export interface SportRadarWidgetScoreboardMatches {
  [n: number]: SportRadarWidgetScoreboardMatch;
}

export interface SportRadarWidgetScoreboardMatch {
  matchstatus: string; //"result",
  postponed: boolean;
  removed: boolean;
  status: SportRadarWidgetScoreboardMatchStatus;
  teams: SportRadarWidgetScoreboardMatchTeams;
  timeinfo: SportRadarWidgetScoreboardMatchTimeInfo;
  _dt: SportRadarWidgetScoreboardMatchTimeInfoDateTime;
}

interface SportRadarWidgetScoreboardMatchStatus {
  name: string; //"Ended",
}

interface SportRadarWidgetScoreboardMatchTeams {
  away: SportRadarWidgetScoreboardMatchTeam;
  home: SportRadarWidgetScoreboardMatchTeam;
}

export interface SportRadarWidgetScoreboardMatchTeam {
  abbr: string; //"SEA",
  mediumname: string; //"Seattle Kraken",
  name: string; //"Seattle",
  nickname: string; //"Kraken",
}

interface SportRadarWidgetScoreboardMatchTimeInfo {
  ended: string; //"1634100704",
  played: string; //"3599",
  remaining: string; //"0",
  running: boolean;
  started: string; //"1634091965",
}

interface SportRadarWidgetScoreboardMatchTimeInfoDateTime {
  date: string; //"10/13/2021",
  time: string; //"02:00 AM",
  tz: string; //"UTC",
  tzoffset: number; //0,
  uts: number; //1634090400,
}