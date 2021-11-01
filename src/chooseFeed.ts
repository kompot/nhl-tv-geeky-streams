import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  FeedSelection,
  ProcessedFeed,
  ProcessedFeedList,
} from "./geekyStreamsApi";

const renderFeedName = (
  feed: ProcessedFeed
): string => {
  const name = _.compact([
    feed.epgItem.mediaFeedType,
    feed.epgItem.callLetters,
    feed.epgItem.feedName
  ]).join(", ");

  const feedName = feed.isForFavouriteTeam ? chalk.yellow(name) : name;
  return feedName;
};

const renderFeeds = (
  feedList: ProcessedFeedList
): void => {
  feedList.feeds.forEach(feed => {
    feed.displayName = renderFeedName(feed);
  });
};

export const chooseFeed = (
  passive: boolean,
  feedList: ProcessedFeedList
): Promise<FeedSelection> => {
  renderFeeds(feedList);
  if (passive) {
    return chooseFeedPassively(feedList);
  } else {
    return chooseFeedInteractively(feedList);
  }
};

const chooseFeedInteractively = async (
  feedList: ProcessedFeedList
): Promise<FeedSelection> => {
  const feedOptions = feedList.feeds.map(feed => ({
    value: feed,
    name: feed.displayName!,
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
  const feedSelection: FeedSelection = {
    cancelSelection: false,
    processedFeed: feedSelected[questionNameFeed],
  };
  return feedSelection;
};

const chooseFeedPassively = async (
  feedList: ProcessedFeedList
): Promise<FeedSelection> => {
  if (feedList.preferredFeeds.length === 1) {
    const feedSelection: FeedSelection = {
      cancelSelection: false,
      processedFeed: feedList.preferredFeeds[0],
    };
    console.log(feedSelection.processedFeed.displayName);
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