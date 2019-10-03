import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";
import * as luxon from "luxon";

import {
  GameSelection,
  ProcessedGame,
  ProcessedGameList,
} from "./geekyStreamsApi";
import {
  Team,
  GAME_DETAILED_STATE
} from "./nhlStatsApi";


enum DIRECTION {
  BACK = "back",
  FORWARD = "forward"
}

// Columbus Blue Jackets + 2
const maxTeamLength = 23;
const paddingForChalk = 10;

const renderTeam = (
  team: Team,
  isFavTeam: boolean,
  isTvStreamAvailable: boolean,
  padStart: boolean
): string => {
  const tName = isFavTeam ? chalk.yellow(team.name) : team.name;
  const favTeamPadding = isFavTeam ? paddingForChalk : 0;
  const teamPadEnd = _.padEnd(tName, maxTeamLength + favTeamPadding);
  if (!padStart) {
    return teamPadEnd;
  }
  return _.padStart(
    teamPadEnd,
    (isTvStreamAvailable ? maxTeamLength + 2 : maxTeamLength) +
      favTeamPadding
  );
};

const renderGameName = (
  processedGame: ProcessedGame,
  allGamesHaveStreamsAvailable: boolean
): string => {
  const game = processedGame.game;
  const isTvStreamAvailable = processedGame.feedList.isTvStreamAvailable;
  let name = renderTeam(
    game.teams.away.team,
    processedGame.isAwayTeamFavourite,
    isTvStreamAvailable,
    !allGamesHaveStreamsAvailable
  );
  name += chalk.gray(" @ ");
  name += renderTeam(
    game.teams.home.team,
    processedGame.isHomeTeamFavourite,
    isTvStreamAvailable,
    false
  );
  if (game.status.detailedState === GAME_DETAILED_STATE.PREGAME) {
    name += " " + game.status.detailedState;
  }
  if (game.status.detailedState === GAME_DETAILED_STATE.INPROGRESS) {
    name +=
      " " +
      game.linescore.currentPeriodOrdinal +
      " " +
      game.linescore.currentPeriodTimeRemaining;
  }
  if (game.status.detailedState === GAME_DETAILED_STATE.INPROGRESSCRITICAL) {
    name += " soon to end";
  }
  if (
    isTvStreamAvailable &&
    game.status.detailedState === GAME_DETAILED_STATE.SCHEDULED
  ) {
    name += " soon to start";
  }
  if (
    processedGame.feedList.isLiveTvStreamAvailable &&
    (game.status.detailedState === GAME_DETAILED_STATE.GAMEOVER ||
      game.status.detailedState === GAME_DETAILED_STATE.FINAL)
  ) {
    name += " ended, live stream";
  }
  const passedFromGameStart = luxon.DateTime.local().diff(
    luxon.DateTime.fromISO(game.gameDate)
  );
  if (
    processedGame.feedList.isArchiveTvStreamAvailable &&
    passedFromGameStart.as("hour") < 8
  ) {
    name += " ended, archive stream";
  }
  return name;
};

const isGameDisabledForDownloadAndReasonWhy = (
  processedGame: ProcessedGame
): string | undefined => {
  const game = processedGame.game;
  if (game.status.detailedState === GAME_DETAILED_STATE.POSTPONED) {
    return "postponed";
  } else if (!processedGame.feedList.isTvStreamAvailable) {
    const dt = luxon.DateTime.fromISO(game.gameDate);
    const dur = dt.diffNow();
    const durAsHour = dur.as("hour");
    if (durAsHour < 0) {
      return chalk.gray("no streams available");
    } else if (durAsHour < 24) {
      return `starts in ${dur.toFormat("h:mm")}`;
    } else {
      return chalk.gray(game.status.detailedState.toLowerCase());
    }
  }
};

const renderGames = (
  gameList: ProcessedGameList
): void => {
  gameList.games.forEach(game => {
    game.disableReason = isGameDisabledForDownloadAndReasonWhy(game);
    game.displayName = renderGameName(game, gameList.allGamesHaveTvStreamsAvailable);
  });
  gameList.hiddenGames.forEach(game => {
    game.disableReason = isGameDisabledForDownloadAndReasonWhy(game);
    game.displayName = renderGameName(game, gameList.allGamesHaveTvStreamsAvailable);
  });
  
  if (gameList.games.length === 0) {
    let noGamesMessage: string;
    if (gameList.hiddenGames.length === 0) {
      noGamesMessage = "(no games found)";
    } else if (gameList.hiddenGames.length === 1) {
      noGamesMessage = "(1 hidden game)";
    } else {
      noGamesMessage = `(${gameList.hiddenGames.length} hidden games)`;
    }
    gameList.noGamesMessage = noGamesMessage;
  }
};

export const chooseGame = (
  passive: boolean,
  gameList: ProcessedGameList
): Promise<GameSelection> => {
  renderGames(gameList);
  if (passive) {
    return chooseGamePassively(gameList);
  } else {
    return chooseGameInteractively(gameList);
  }
};

const chooseGameInteractively = async (
  gameList: ProcessedGameList
): Promise<GameSelection> => {
  const gameSelection: GameSelection = {
    cancelSelection: false,
    isDateChange: true,
  };
  let gamesOptions: inquirer.DistinctChoice<inquirer.ListChoiceMap>[] = [
    {
      value: DIRECTION.BACK,
      name: "⤺  one day back"
    }
  ];
  gamesOptions.push(new inquirer.Separator(" "));
  if (gameList.matchDay) {
    gamesOptions.push(new inquirer.Separator(gameList.matchDay.date));
  } else {
    gamesOptions.push(new inquirer.Separator(gameList.queryDate.toLocaleString()));
  }
  gamesOptions.push(new inquirer.Separator(" "));

  if (gameList.games.length > 0) {
    gameList.games.forEach(processedGame => {
      gamesOptions.push({
        value: processedGame,
        name: processedGame.displayName,
        disabled: processedGame.disableReason,
      });
    });
  } else {
    gamesOptions.push(new inquirer.Separator(`  ${gameList.noGamesMessage}`));
  }
  gamesOptions.push(new inquirer.Separator(" "));
  gamesOptions.push({
    value: DIRECTION.FORWARD,
    name: "⤻  one day forward"
  });

  const questionNameGame = "game";

  const questionsGame: inquirer.ListQuestion[] = [
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
    gameSelection.newDate = gameList.queryDate.minus({ days: 1 });
  } else if (gameSelected[questionNameGame] === DIRECTION.FORWARD) {
    gameSelection.newDate = gameList.queryDate.plus({ days: 1 });
  } else {
    gameSelection.isDateChange = false;
    gameSelection.processedGame = gameSelected[questionNameGame];
  }

  return gameSelection;
};

const chooseGamePassively = async (
  gameList: ProcessedGameList
): Promise<GameSelection> => {
  const gameSelection: GameSelection = {
    cancelSelection: true,
    isDateChange: false,
  };

  if (gameList.games.length === 1) {
    gameSelection.cancelSelection = false;
    gameSelection.processedGame = gameList.games[0];
    console.log(gameSelection.processedGame.displayName);
  } else {      
    console.log(
      chalk.yellow(
        "The game couldn't be autoselected."
      )
    );
    if (gameList.games.length === 0) {
      console.log(gameList.noGamesMessage);
      gameList.hiddenGames.forEach(g => console.log(g.displayName));
    } else {
      gameList.games.forEach(g => console.log(g.displayName));
    }
  }

  return gameSelection;
};
