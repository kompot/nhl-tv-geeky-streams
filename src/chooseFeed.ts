import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  EpgItem,
  EpgTitle,
  Game
} from "./nhlStatsApi";
import { Config } from "./index";

export const chooseFeed = async (
    config: Config,
    game: Game
): Promise<EpgItem> => {
  
  const feedOptions = game.content.media.epg
    .find(e => e.title === EpgTitle.NHLTV)
    .items.map(epgItem => ({
      value: epgItem,
      name: _.compact([
          epgItem.mediaFeedType,
          epgItem.callLetters,
          epgItem.feedName
        ]).join(", ")
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