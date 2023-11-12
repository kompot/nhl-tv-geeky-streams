// these typings are incomplete and contain only information required
// for Geeky Streams to work

// PRs are welcome

// "2017-12-22"
export type DateShort = string;
// "2017-12-23T00:00:00Z"
export type DateLong = string;
export type Url = string;
export type Guid = string;

export enum MediaFeedType {
  Home = "HOME",
  Away = "AWAY",
  National = "NATIONAL",
  Composite = "COMPOSITE",
  Iso = "ISO",
  French = "FRENCH",
  Spanish = "SPANISH",
  Unknown = "UNKNOWN",
}

export enum GAME_DETAILED_STATE {
  SCHEDULED = 'Scheduled',
  PREGAME = 'Pre-Game',
  INPROGRESS = 'In Progress',
  INPROGRESSCRITICAL = 'In Progress - Critical',
  GAMEOVER = 'Game Over',
  FINAL = 'Final',
  POSTPONED = 'Postponed'
}

export enum NhlStatsGameStateType {
  Future = "FUT",
  Live = "LIVE",
  Off = "OFF",
  Pregame = "PRE",
}

export enum NhlStatsPeriodType {
  Regulation = "REG",
  Overtime = "OT",
  Shootout = "SO",
}

export enum NhlStatsScheduleStateType {
  OK = "OK",
}

export const NhlStatsApiBaseUrl = "https://api-web.nhle.com/v1";

export interface NhlStatsApi {
  "/schedule/:id": {
    GET: {
      params: {
        id: DateShort;
      };
      response: NhlStatsScheduleDateResponse;
    };
  };
  "/score/:id": {
    GET: {
      params: {
        id: DateShort;
      };
      response: NhlStatsScoreDateResponse;
    };
  };
}

export interface NhlStatsScheduleDateResponse {
  gameWeek: NhlStatsScheduleGameDay[];
}

export interface NhlStatsScoreDateResponse {
  games: NhlStatsScoreGame[];
}

export interface NhlStatsScheduleGameDay {
  date: DateShort;
  dayAbbrev: string;
  games: NhlStatsScheduleGame[];
  numberOfGames: number;
}

export interface NhlStatsScheduleGame {
  id: number;
  awayTeam: NhlStatsScheduleGameTeam;
  homeTeam: NhlStatsScheduleGameTeam;
  gameOutcome?: NhlStatsScheduleGameOutcome;
  gameScheduleState: NhlStatsScheduleStateType;
  gameState: NhlStatsGameStateType;
  periodDescriptor?: NhlStatsScheduleGamePeriodDescriptor;
  startTimeUTC: DateLong;
}

export interface NhlStatsScoreGame extends NhlStatsScheduleGame {
  clock?: NhlStatsScoreGameClock;
}

export interface NhlStatsScheduleGameTeam {
  id: number;
  abbrev: string;
}

export interface NhlStatsScheduleGameOutcome {
  lastPeriodType: NhlStatsPeriodType;
}

export interface NhlStatsScheduleGamePeriodDescriptor {
  number: number;
  periodType: NhlStatsPeriodType;
}

// during intermission, timeRemaining is not 00:00 because it says how much is remaining in intermission
export interface NhlStatsScoreGameClock {
  inIntermission: boolean;
  running: boolean;
  secondsRemaining: number;
  timeRemaining: string;
}
