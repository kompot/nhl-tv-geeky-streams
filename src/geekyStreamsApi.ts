import {
  EpgItem,
  Team,
} from "./nhlStatsApi";

export interface ProcessedFeed {
  displayName: string,
  epgItem: EpgItem,
  isForFavouriteTeam: boolean,
}

export const isFavouriteTeam = (
  team: Team,
  favouriteTeamsAbbreviations: string[]
): boolean => favouriteTeamsAbbreviations.indexOf(team.abbreviation) !== -1;