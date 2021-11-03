import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  FeedSelection,
  ProcessedFeed,
  ProcessedGame,
} from "./geekyStreamsApi";
import { MediaFeedType } from "./nhlStatsApi";

interface RenderedFeed {
  displayName: string;
  isForFavouriteTeam: boolean;
  processedFeed: ProcessedFeed;
}

interface RenderedFeedList {
  feeds: RenderedFeed[];
  preferredFeeds: RenderedFeed[];
}

const renderFeedName = (
  feed: ProcessedFeed,
  isForFavouriteTeam: boolean
): string => {
  const name = _.compact([
    feed.info.mediaFeedType,
    feed.info.callLetters,
    feed.info.feedName
  ]).join(", ");

  const feedName = isForFavouriteTeam ? chalk.yellow(name) : name;
  return feedName;
};

const renderFeed = (game: ProcessedGame, feed: ProcessedFeed): RenderedFeed => {
  const isForFavouriteTeam = feed.info.mediaFeedType === MediaFeedType.National && game.hasFavouriteTeam ||
                             feed.info.mediaFeedType === MediaFeedType.Away && game.isAwayTeamFavourite ||
                             feed.info.mediaFeedType === MediaFeedType.Home && game.isHomeTeamFavourite;

  return {
    displayName: renderFeedName(feed, isForFavouriteTeam),
    isForFavouriteTeam,
    processedFeed: feed,
  };
}

const renderFeeds = (
  game: ProcessedGame
): RenderedFeedList => {
  const preferredFeeds: RenderedFeed[] = [];
  const feeds = game.feedList.feeds.map(feed => {
    const renderedFeed = renderFeed(game, feed);
    if (renderedFeed.isForFavouriteTeam) {
      preferredFeeds.push(renderedFeed);
    }
    return renderedFeed;
  });

  return {
    feeds,
    preferredFeeds,
  };
};

export const chooseFeed = (
  passive: boolean,
  game: ProcessedGame
): Promise<FeedSelection> => {
  const renderedFeedList = renderFeeds(game);
  if (passive) {
    return chooseFeedPassively(renderedFeedList);
  } else {
    return chooseFeedInteractively(renderedFeedList);
  }
};

const chooseFeedInteractively = async (
  feedList: RenderedFeedList
): Promise<FeedSelection> => {
  const feedOptions = feedList.feeds.map(feed => {
    const feedValue: FeedSelection = {
      cancelSelection: false,
      processedFeed: feed.processedFeed,
    };

    return {
      value: feedValue,
      name: feed.displayName,
    };
  });

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
  return feedSelected[questionNameFeed];
};

const chooseFeedPassively = async (
  feedList: RenderedFeedList
): Promise<FeedSelection> => {
  if (feedList.preferredFeeds.length === 1) {
    const selectedFeed = feedList.preferredFeeds[0];
    const feedSelection: FeedSelection = {
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
      cancelSelection: true,
    };
  }
};