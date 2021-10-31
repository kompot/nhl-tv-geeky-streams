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
  favouriteTeamsAbbreviations: string[] | undefined
): boolean => !!favouriteTeamsAbbreviations && favouriteTeamsAbbreviations.indexOf(team.abbreviation) !== -1;