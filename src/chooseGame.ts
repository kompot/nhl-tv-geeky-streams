import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import * as _ from "lodash";
import * as luxon from "luxon";

import {
  NhlStatsApi,
  NhlStatsApiBaseUrl,
  EpgTitle,
  Game,
  MEDIA_STATE
} from "./nhlStatsApi";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});

enum DIRECTION {
  BACK = "back",
  FORWARD = "forward"
}

export const chooseGame = async (
  date: luxon.DateTime = luxon.DateTime.local()
): Promise<Game> => {
  const { data: { dates } } = await statsApi.request({
    url: "/schedule",
    params: {
      startDate: date.toISODate(),
      endDate: date.toISODate(),
      expand: "schedule.game.content.media.epg,schedule.teams"
    }
  });

  const games = _.flatMap(dates, matchDay => matchDay.games);

  let gamesOptions: inquirer.ChoiceType[] = [
    {
      value: DIRECTION.BACK,
      name: "⤺  one day back"
    }
  ];
  dates.forEach(matchDay => {
    gamesOptions.push(new inquirer.Separator(" "));
    gamesOptions.push(new inquirer.Separator(matchDay.date));
    gamesOptions.push(new inquirer.Separator(" "));
    matchDay.games.forEach(game => {
      const anyStreamAvaiable = game.content.media.epg
        .find(e => e.title === EpgTitle.NHLTV)
        .items.find(
          item =>
            item.mediaState === MEDIA_STATE.ON ||
            item.mediaState === MEDIA_STATE.ARCHIVE
        );
      gamesOptions.push({
        value: String(game.gamePk),
        name: game.teams.home.team.name + " vs " + game.teams.away.team.name,
        disabled: anyStreamAvaiable ? undefined : "no streams available"
      })
    });
    gamesOptions.push(new inquirer.Separator(" "));
  });
  gamesOptions.push({
    value: DIRECTION.FORWARD,
    name: "⤻  one day forward"
  });

  const questionNameGame = "game";

  const questionsGame: inquirer.Question[] = [
    {
      type: "list",
      // number of teams divided by 2 (16), maximum match number for 1 day
      // plus 6 lines for go back/forward buttons and separators
      pageSize: 21,
      name: questionNameGame,
      message: "Choose game to download",
      choices: gamesOptions
    }
  ];

  const gameSelected = await inquirer.prompt(questionsGame);

  if (gameSelected[questionNameGame] === DIRECTION.BACK) {
    return chooseGame(date.minus({ days: 1 }));
  }
  if (gameSelected[questionNameGame] === DIRECTION.FORWARD) {
    return chooseGame(date.plus({ days: 1 }));
  }

  const game = games.find(
    game => String(game.gamePk) === gameSelected[questionNameGame]
  );
  return game;
};
