import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  isFavouriteTeam,
  Config,
  ProcessedFeed,
} from "./geekyStreamsApi";
import {
  EpgItem,
  EpgTitle,
  Game,
  MediaFeedType,
} from "./nhlStatsApi";

const renderFeedName = (
  epgItem: EpgItem,
  isForFavouriteTeam: boolean
): string => {
  const name = _.compact([
    epgItem.mediaFeedType,
    epgItem.callLetters,
    epgItem.feedName
  ]).join(", ");

  const feedName = isForFavouriteTeam ? chalk.yellow(name) : name;
  return feedName;
}

const processFeeds = (
  game: Game,
  favouriteTeamsAbbreviations: string[] | undefined,
): ProcessedFeed[] => {
  const isAwayTeamFavourite = isFavouriteTeam(game.teams.away.team, favouriteTeamsAbbreviations);
  const isHomeTeamFavourite = isFavouriteTeam(game.teams.home.team, favouriteTeamsAbbreviations);
  const hasFavouriteTeam = isAwayTeamFavourite || isHomeTeamFavourite;
  const nhltvEpg = game.content.media?.epg.find(e => e.title === EpgTitle.NHLTV);
  return nhltvEpg?.items.map(epgItem => {
    const isForFavouriteTeam = epgItem.mediaFeedType === MediaFeedType.National && hasFavouriteTeam ||
                                epgItem.mediaFeedType === MediaFeedType.Away && isAwayTeamFavourite ||
                                epgItem.mediaFeedType === MediaFeedType.Home && isHomeTeamFavourite;
    const displayName = renderFeedName(epgItem, isForFavouriteTeam);
    const processedFeed: ProcessedFeed = {
      displayName,
      epgItem,
      isForFavouriteTeam,
    };
    return processedFeed;
  }) ?? [];
}

export const chooseFeed = async (
    config: Config,
    game: Game
): Promise<EpgItem> => {
  const processedFeeds = processFeeds(game, config.favouriteTeams);
  const feedOptions = processedFeeds.map(processedFeed => ({
    value: processedFeed.epgItem,
    name: processedFeed.displayName,
  }));

  const questionNameFeed = "feed";

  const questionsFeed: inquirer.ListQuestion[] = [
    {
      type: "list",
      name: questionNameFeed,
      message: "Choose feed to watch",
      choices: feedOptions
    }
  ];

  const feedSelected = await inquirer.prompt(questionsFeed);

  const feed: EpgItem = feedSelected[questionNameFeed];
  return feed;
}