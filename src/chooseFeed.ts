import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  Config,
  FeedSelection,
  ProcessedFeed,
  ProcessedGame,
} from "./geekyStreamsApi";
import { MediaFeedType } from "./nhlStatsApi";

interface RenderedFeed {
  displayName: string;
  disabledReason?: string;
  isForFavouriteTeam: boolean;
  isPreferredMediaType: boolean;
  processedFeed: ProcessedFeed;
}

interface RenderedFeedList {
  feeds: RenderedFeed[];
  preferredFeeds: RenderedFeed[];
}

// viaplay.se
const maxProviderName = 10;
// COMPOSITE
const maxMediaFeedType = 9;
// ESPN Deportes
const maxCallLetters = 13;

const renderFeedName = (
  feed: ProcessedFeed,
  isAvailable: boolean
): string => {
  let paddedProviderName = _.padEnd(feed.providerFeed.providerName, maxProviderName);
  if (isAvailable) {
    paddedProviderName = _.padStart(paddedProviderName, 2 + maxProviderName);
  }

  const mediaFeedType = feed.info.mediaFeedType === MediaFeedType.Unknown ? "" : feed.info.mediaFeedType as string;
  const name = _.compact([
    paddedProviderName,
    _.padEnd(mediaFeedType, maxMediaFeedType),
    feed.info.callLetters ? _.padEnd(feed.info.callLetters, maxCallLetters) : "",
    feed.info.feedName
  ]).join("  ");

  return name;
};

const renderFeed = (game: ProcessedGame, feed: ProcessedFeed): RenderedFeed => {
  const preferredMediaType = !game.hasFavouriteTeam ? MediaFeedType.Unknown :
                              game.isAwayTeamFavourite ? MediaFeedType.Away : MediaFeedType.Home;
  const isPreferredMediaType = preferredMediaType !== MediaFeedType.Unknown &&
                               preferredMediaType === feed.info.mediaFeedType;
  const isForFavouriteTeam = feed.info.mediaFeedType === MediaFeedType.National && game.hasFavouriteTeam ||
                             feed.info.mediaFeedType === MediaFeedType.Away && game.isAwayTeamFavourite ||
                             feed.info.mediaFeedType === MediaFeedType.Home && game.isHomeTeamFavourite;
  let disabledReason: string | undefined;
  if (!feed.isArchiveTvStream && !feed.isLiveTvStream) {
    disabledReason = "not available";
  } else if (feed.providerFeed.drmProtected) {
    disabledReason = "DRM protected";
  }

  return {
    displayName: renderFeedName(feed, !disabledReason),
    disabledReason: disabledReason,
    isForFavouriteTeam,
    isPreferredMediaType,
    processedFeed: feed,
  };
}

const renderFeeds = (
  game: ProcessedGame
): RenderedFeedList => {
  const preferredFeeds: RenderedFeed[] = [];
  let ignoreNational = false;
  const feeds = game.feedList.feeds.map(feed => {
    const renderedFeed = renderFeed(game, feed);
    if (renderedFeed.isForFavouriteTeam) {
      preferredFeeds.push(renderedFeed);

      if (renderedFeed.isPreferredMediaType) {
        ignoreNational = true;
      }
    }
    return renderedFeed;
  });

  const filteredPreferredFeeds = preferredFeeds.filter(f => {
    return f.isPreferredMediaType || !ignoreNational && f.isForFavouriteTeam;
  });
  for (const preferredFeed of filteredPreferredFeeds) {
    preferredFeed.displayName = chalk.yellow(preferredFeed.displayName);
  }

  return {
    feeds,
    preferredFeeds: filteredPreferredFeeds,
  };
};

export const chooseFeed = (
  config: Config,
  passive: boolean,
  game: ProcessedGame
): Promise<FeedSelection> => {
  const renderedFeedList = renderFeeds(game);
  let filteredFeeds: RenderedFeed[] = [];

  if (config.preferredProvider)
  {
    let preferredProviderName: string;
    switch (config.preferredProvider) {
      case "nhltv":
        preferredProviderName = "NHL.TV";
        break;
      case "espn":
        preferredProviderName = "WatchESPN";
        break;
      case "bally":
        preferredProviderName = "BallyRSN";
      default:
        preferredProviderName = config.preferredProvider;
        break;
    }
  
    filteredFeeds = renderedFeedList.preferredFeeds.filter(f => f.processedFeed.providerFeed.providerName === preferredProviderName);
    if (filteredFeeds.length) {
      renderedFeedList.preferredFeeds = filteredFeeds;
      filteredFeeds = [];
    }
  }

  if (!game.isAwayTeamFavourite && game.isHomeTeamFavourite) {
    filteredFeeds = renderedFeedList.preferredFeeds.filter(f => f.processedFeed.info.mediaFeedType === MediaFeedType.Home);
  } else if (game.isAwayTeamFavourite && !game.isHomeTeamFavourite) {
    filteredFeeds = renderedFeedList.preferredFeeds.filter(f => f.processedFeed.info.mediaFeedType === MediaFeedType.Away);
  }

  if (filteredFeeds.length) {
    renderedFeedList.preferredFeeds = filteredFeeds;
    filteredFeeds = [];
  }

  if (passive) {
    return chooseFeedPassively(config, renderedFeedList);
  } else {
    return chooseFeedInteractively(renderedFeedList);
  }
};

const chooseFeedInteractively = async (
  feedList: RenderedFeedList
): Promise<FeedSelection> => {
  const feedOptions: inquirer.DistinctChoice<inquirer.ListChoiceMap>[] = feedList.feeds.map(feed => {
    const feedValue: FeedSelection = {
      isGameChange: false,
      cancelSelection: false,
      processedFeed: feed.processedFeed,
    };

    return {
      value: feedValue,
      name: feed.displayName,
      disabled: feed.disabledReason,
    };
  });

  const differentGameOption: FeedSelection = {
    isGameChange: true,
  };
  feedOptions.push({
    value: differentGameOption,
    name: "⤺  (choose different game)",
  });

  const questionNameFeed = "feed";

  const questionsFeed: inquirer.ListQuestion[] = [
    {
      type: "list",
      pageSize: 22,
      name: questionNameFeed,
      message: "Choose feed to watch",
      choices: feedOptions
    }
  ];

  const feedSelected = await inquirer.prompt(questionsFeed);
  return feedSelected[questionNameFeed];
};

const chooseFeedPassively = async (
  config: Config,
  feedList: RenderedFeedList
): Promise<FeedSelection> => {
  let pickFirstPreferredFeed = false;
  if (config.preferredFeedStrategy) {
    switch (config.preferredFeedStrategy) {
      case 'default':
        // valid
        break;
      case 'fallbackToAny':
        pickFirstPreferredFeed = true;
        break;
      default:
        throw new Error(`Unknown preferredFeedStrategy: ${config.preferredFeedStrategy}`);
    }
  }

  if (feedList.preferredFeeds.length === 1 ||
      feedList.preferredFeeds.length > 1 && pickFirstPreferredFeed
  ) {
    const selectedFeed = feedList.preferredFeeds[0];
    const feedSelection: FeedSelection = {
      isGameChange: false,
      cancelSelection: false,
      processedFeed: selectedFeed.processedFeed,
    };
    console.log(selectedFeed.displayName);
    return feedSelection;
  } else {      
    console.log(
      chalk.yellow(
        "The feed couldn't be autoselected."
      )
    );
    const possibleFeeds = feedList.preferredFeeds.length > 1 ? feedList.preferredFeeds : feedList.feeds;
    possibleFeeds.forEach(f => console.log(f.displayName));

    return {
      isGameChange: false,
      cancelSelection: true,
    };
  }
};