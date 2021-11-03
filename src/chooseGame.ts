import * as inquirer from "inquirer";
import * as _ from "lodash";
import * as luxon from "luxon";
import chalk from "chalk";

import {
  GameSelection,
  ProcessedGame,
  ProcessedGameList,
  ProviderTeam,
} from "./geekyStreamsApi";
import {
  GAME_DETAILED_STATE
} from "./nhlStatsApi";

interface RenderedGame {
  disableReason: string | undefined;
  displayName: string;
  game: ProcessedGame;
}

interface RenderedGameList {
  gameList: ProcessedGameList;
  games: RenderedGame[];
  hiddenGames: RenderedGame[];
  noGamesMessage: string | undefined;
}

// Columbus Blue Jackets + 2
const maxTeamLength = 23;
const paddingForChalk = 10;

const renderTeam = (
  team: ProviderTeam,
  isFavTeam: boolean,
  isTvStreamAvailable: boolean,
  padStart: boolean
): string => {
  const tName = isFavTeam ? chalk.yellow(team.fullName) : team.fullName;
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
  if (!processedGame.feedList) {
    throw new Error("No feeds for game");
  }

  const isTvStreamAvailable = processedGame.feedList.isTvStreamAvailable;
  let name = renderTeam(
    processedGame.awayTeam,
    processedGame.isAwayTeamFavourite,
    isTvStreamAvailable,
    !allGamesHaveStreamsAvailable
  );
  name += chalk.gray(" @ ");
  name += renderTeam(
    processedGame.homeTeam,
    processedGame.isHomeTeamFavourite,
    isTvStreamAvailable,
    false
  );
  const gameStatus = processedGame.status;
  if (gameStatus?.status.detailedState === GAME_DETAILED_STATE.PREGAME) {
    name += " " + gameStatus.status.detailedState;
  }
  if (gameStatus?.status.detailedState === GAME_DETAILED_STATE.INPROGRESS) {
    name +=
      " " +
      gameStatus.linescore.currentPeriodOrdinal +
      " " +
      gameStatus.linescore.currentPeriodTimeRemaining;
  }
  if (gameStatus?.status.detailedState === GAME_DETAILED_STATE.INPROGRESSCRITICAL) {
    name += " soon to end";
  }
  if (
    isTvStreamAvailable &&
    gameStatus?.status.detailedState === GAME_DETAILED_STATE.SCHEDULED
  ) {
    name += " soon to start";
  }
  if (
    processedGame.feedList.isLiveTvStreamAvailable &&
    (gameStatus?.status.detailedState === GAME_DETAILED_STATE.GAMEOVER ||
      gameStatus?.status.detailedState === GAME_DETAILED_STATE.FINAL)
  ) {
    name += " ended, live stream";
  }
  const passedFromGameStart = luxon.DateTime.local().diff(processedGame.gameDateTime);
  if (
    processedGame.feedList.isArchiveTvStreamAvailable &&
    passedFromGameStart.as("hours") < 8
  ) {
    name += " ended, archive stream";
  }
  return name;
};

const isGameDisabledForDownloadAndReasonWhy = (
  processedGame: ProcessedGame
): string | undefined => {
  const gameStatus = processedGame.status;
  if (gameStatus?.status.detailedState === GAME_DETAILED_STATE.POSTPONED) {
    return "postponed";
  } else if (!processedGame.feedList.isTvStreamAvailable) {
    const dur = processedGame.gameDateTime.diffNow();
    const durAsHour = dur.as("hours");
    if (durAsHour < 0) {
      return chalk.gray("no streams available");
    } else if (durAsHour < 24) {
      return `starts in ${dur.toFormat("h:mm")}`;
    } else if (gameStatus) {
      return chalk.gray(gameStatus.status.detailedState.toLowerCase());
    } else {
      return chalk.gray("no streams available");
    }
  }
};

const renderGame = (game: ProcessedGame, allGamesHaveStreamsAvailable: boolean): RenderedGame => {
  return {
    disableReason: isGameDisabledForDownloadAndReasonWhy(game),
    displayName: renderGameName(game, allGamesHaveStreamsAvailable),
    game,
  };
};

const renderGames = (
  gameList: ProcessedGameList
): RenderedGameList => {
  const allGamesHaveTvStreamsAvailable = _.every(gameList.games, g => g.feedList.isTvStreamAvailable);
  const renderedGames = gameList.games.map(game => {
    return renderGame(game, allGamesHaveTvStreamsAvailable);
  });
  const renderedHiddenGames = gameList.hiddenGames.map(game => {
    return renderGame(game, allGamesHaveTvStreamsAvailable);
  });
  
  let noGamesMessage: string | undefined;
  if (gameList.games.length === 0) {
    if (gameList.hiddenGames.length === 0) {
      noGamesMessage = "(no games found)";
    } else if (gameList.hiddenGames.length === 1) {
      noGamesMessage = "(1 hidden game)";
    } else {
      noGamesMessage = `(${gameList.hiddenGames.length} hidden games)`;
    }
  }

  return {
    gameList,
    games: renderedGames,
    hiddenGames: renderedHiddenGames,
    noGamesMessage,
  };
};

export const chooseGame = (
  passive: boolean,
  gameList: ProcessedGameList
): Promise<GameSelection> => {
  const renderedGameList = renderGames(gameList);
  if (passive) {
    return chooseGamePassively(renderedGameList);
  } else {
    return chooseGameInteractively(renderedGameList);
  }
};

const chooseGameInteractively = async (
  gameList: RenderedGameList
): Promise<GameSelection> => {
  const queryDate = gameList.gameList.queryDate;
  const backValue: GameSelection = {
    isDateChange: true,
    newDate: queryDate.minus({ days: 1 }),
  };
  const forwardValue: GameSelection = {
    isDateChange: true,
    newDate: queryDate.plus({ days: 1 }),
  };
  let gamesOptions: inquirer.DistinctChoice<inquirer.ListChoiceMap>[] = [
    {
      value: backValue,
      name: "⤺  one day back",
    },
    new inquirer.Separator(" "),
    new inquirer.Separator(queryDate.toFormat("yyyy-MM-dd")),
    new inquirer.Separator(" "),
  ];

  if (gameList.games.length > 0) {
    gameList.games.forEach(renderedGame => {
      const gameValue: GameSelection = {
        isDateChange: false,
        cancelSelection: false,
        processedGame: renderedGame.game,
      };

      gamesOptions.push({
        value: gameValue,
        name: renderedGame.displayName,
        disabled: renderedGame.disableReason,
      });
    });
  } else {
    gamesOptions.push(new inquirer.Separator(`  ${gameList.noGamesMessage}`));
  }
  gamesOptions.push(new inquirer.Separator(" "));
  gamesOptions.push({
    value: forwardValue,
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
  return gameSelected[questionNameGame];
};

const chooseGamePassively = async (
  gameList: RenderedGameList
): Promise<GameSelection> => {
  if (gameList.games.length === 1) {
    const renderedGame = gameList.games[0];
    console.log(renderedGame.displayName);
    return {
      isDateChange: false,
      cancelSelection: false,
      processedGame: renderedGame.game,
    };
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

    return {
      cancelSelection: true,
      isDateChange: false,
    };  
  }
};
