// these typings are incomplete and contain only information required
// for Geeky Streams to work

// PRs are welcome

// "2017-12-22"
type DateShort = string;
// "2017-12-23T00:00:00Z"
type DateLong = string;
export type Url = string;
type Guid = string;

export interface Team {
  id: number;
  name: string;
  abbreviation: string;
  teamName: string;
}

interface TeamShort {
  id: number;
  name: string;
  link: Url;
}

export enum EpgTitle {
  NHLTV = "NHLTV",
  AUDIO = "Audio",
  EXTENDED_HIGHLIGHTS = 'Extended Highlights',
  RECAP = 'Recap',
}

enum MediaFeedType {
  Home = "HOME",
  Away = "AWAY",
  Composite = "COMPOSITE",
  Iso = "ISO"
}

export enum MEDIA_STATE {
  // live
  ON = "MEDIA_ON",
  // future, has not started
  OFF = "MEDIA_OFF",
  // has finished
  ARCHIVE = "MEDIA_ARCHIVE",
}

export interface EpgItem {
  guid: Guid;
  mediaState: MEDIA_STATE;
  mediaPlaybackId: string;
  mediaFeedType: MediaFeedType;
  feedName: string;
  eventId: string;
  callLetters: string;
}

export interface Epg {
  title: EpgTitle;
  items: EpgItem[];
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

export interface Game {
  status: {
    detailedState: GAME_DETAILED_STATE;
  };
  linescore: {
    currentPeriod: number;
    currentPeriodOrdinal: string;
    currentPeriodTimeRemaining: string;
  };
  gamePk: number;
  link: Url;
  content: {
    link: Url;
    media?: {
      epg: Epg[];
    };
  };
  gameDate: DateLong;
  teams: {
    home: {
      team: Team;
    };
    away: {
      team: Team;
    };
  };
}

export interface MatchDay {
  date: DateShort;
  games: Game[];
}

export const NhlStatsApiBaseUrl = "https://statsapi.web.nhl.com/api/v1";

export interface NhlStatsApi {
  "/teams": {
    GET: {
      response: {
        teams: Team[];
      };
    };
  };
  "/schedule": {
    GET: {
      query: {
        startDate: DateShort;
        endDate: DateShort;
        expand: string;
      };
      response: {
        dates: MatchDay[];
      };
    };
  };
}
