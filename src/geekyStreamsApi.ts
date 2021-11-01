import {
  EpgItem,
  Team,
} from "./nhlStatsApi";

export interface Config {
  email: string;
  password: string;
  matchTimeZone: string;
  playLiveGamesFromStart?: boolean;
  favouriteTeams?: string[];
  streamlinkExtraOptions?: string[];
  hideOtherTeams?: boolean;
  preferredStreamQuality?: string;
  startDownloadingIfSingleGameFound: true;
}

export interface ProcessedFeed {
  displayName: string,
  epgItem: EpgItem,
  isForFavouriteTeam: boolean,
}

export interface ProcessedStream {
  bandwidth: number;
  bitrate: string;
  displayName: string,
  downloadUrl: string,
  resolution: string,
}

export const isFavouriteTeam = (
  team: Team,
  favouriteTeamsAbbreviations: string[] | undefined
): boolean => !!favouriteTeamsAbbreviations && favouriteTeamsAbbreviations.indexOf(team.abbreviation) !== -1;