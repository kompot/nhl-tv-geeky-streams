import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
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

export const chooseFeed = async (
  feedList: ProcessedFeedList
): Promise<ProcessedFeed> => {
  renderFeeds(feedList);
  const feedOptions = feedList.feeds.map(feed => ({
    value: feed,
    name: feed.displayName,
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

  const processedFeed: ProcessedFeed = feedSelected[questionNameFeed];
  return processedFeed;
}