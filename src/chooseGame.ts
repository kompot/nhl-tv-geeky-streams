import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import * as _ from "lodash";
import * as luxon from "luxon";
import chalk from "chalk";
import * as fs from "fs";

import {
  isFavouriteTeam,
  Config,
} from "./geekyStreamsApi";
import {
  MatchDay,
  NhlStatsApi,
  NhlStatsApiBaseUrl,
  EpgTitle,
  Game,
  MEDIA_STATE,
  Team,
  GAME_DETAILED_STATE
} from "./nhlStatsApi";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});

enum DIRECTION {
  BACK = "back",
  FORWARD = "forward"
}

const gamesFile = "./tmp/games.json";

const hasFavouriteTeam = (
  game: Game,
  favouriteTeamsAbbreviations: string[] | undefined
): boolean => {
  return isFavouriteTeam(game.teams.away.team, favouriteTeamsAbbreviations) ||
         isFavouriteTeam(game.teams.home.team, favouriteTeamsAbbreviations);
}

// Columbus Blue Jackets + 2
const maxTeamLength = 23;
const paddingForChalk = 10;

const renderTeam = (
  team: Team,
  favouriteTeamsAbbreviations: string[] | undefined,
  game: Game,
  padStart: boolean
): string => {
  const isFavTeam = isFavouriteTeam(team, favouriteTeamsAbbreviations);
  const tName = isFavTeam ? chalk.yellow(team.name) : team.name;
  const favTeamPadding = isFavTeam ? paddingForChalk : 0;
  const teamPadEnd = _.padEnd(tName, maxTeamLength + favTeamPadding);
  if (!padStart) {
    return teamPadEnd;
  }
  return _.padStart(
    teamPadEnd,
    (streamsAvailable(game) ? maxTeamLength + 2 : maxTeamLength) +
      favTeamPadding
  );
};

const renderGameName = (
  game: Game,
  config: Config,
  allGamesHaveStreamsAvailable: boolean
): string => {
  let name = renderTeam(
    game.teams.away.team,
    config.favouriteTeams,
    game,
    !allGamesHaveStreamsAvailable
  );
  name += chalk.gray(" @ ");
  name += renderTeam(game.teams.home.team, config.favouriteTeams, game, false);
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
    streamsAvailable(game) &&
    game.status.detailedState === GAME_DETAILED_STATE.SCHEDULED
  ) {
    name += " soon to start";
  }
  if (
    streamsAvailable(game, [MEDIA_STATE.ON]) &&
    (game.status.detailedState === GAME_DETAILED_STATE.GAMEOVER ||
      game.status.detailedState === GAME_DETAILED_STATE.FINAL)
  ) {
    name += " ended, live stream";
  }
  const passedFromGameStart = luxon.DateTime.local().diff(
    luxon.DateTime.fromISO(game.gameDate)
  );
  if (
    streamsAvailable(game, [MEDIA_STATE.ARCHIVE]) &&
    passedFromGameStart.as("hours") < 8
  ) {
    name += " ended, archive stream";
  }
  return name;
};

const streamsAvailable = (
  game: Game,
  mediaStatesToCheckFor: MEDIA_STATE[] = [MEDIA_STATE.ON, MEDIA_STATE.ARCHIVE]
): boolean => {
  const nhltvEpg = game.content.media?.epg.find(e => e.title === EpgTitle.NHLTV);
  return !!nhltvEpg && _.some(
    nhltvEpg.items,
    item => _.some(mediaStatesToCheckFor, ms => ms === item.mediaState)
  );
}

const isGameDisabledForDownloadAndReasonWhy = (
  game: Game
): string | undefined => {
  let disabled = undefined;
  if (!streamsAvailable(game)) {
    const dt = luxon.DateTime.fromISO(game.gameDate);
    const dur = dt.diffNow();
    const durAsHour = dur.as("hours");
    if (durAsHour < 0) {
      disabled = chalk.gray("no streams available");
    } else if (durAsHour < 24) {
      disabled = "starts in ";
      disabled += dur.toFormat("h:mm");
    } else {
      disabled = chalk.gray(game.status.detailedState.toLowerCase());
    }
  }
  if (game.status.detailedState === GAME_DETAILED_STATE.POSTPONED) {
    disabled = "postponed";
  }
  return disabled;
};

export const chooseGame = async (
  config: Config,
  // will set timezone to somewhat central US so that we always get all metches
  // for current US day, even if you are actually in Asia
  date: luxon.DateTime
): Promise<[Game, luxon.DateTime]> => {
  const { data: { dates } } = await statsApi.request({
    url: "/schedule",
    params: {
      startDate: date.toISODate(),
      endDate: date.toISODate(),
      expand:
        "schedule.game.content.media.epg,schedule.teams,schedule.linescore"
    }
  });
  
  fs.writeFileSync(gamesFile, JSON.stringify(dates, null, 2));

  const games: Game[] = [];
  const hiddenGames: Game[] = [];
  let matchDay: MatchDay | undefined;
  if (dates.length > 0) {
    // we only asked for one date so only look at the first one
    matchDay = dates[0];
    matchDay.games.forEach(game => {
      const showGame = !config.hideOtherTeams || hasFavouriteTeam(game, config.favouriteTeams);
      if (showGame) {
        games.push(game);
      } else {
        hiddenGames.push(game);
      }
    });
  }

  let gamesOptions: inquirer.DistinctChoice<inquirer.ListChoiceMap>[] = [
    {
      value: DIRECTION.BACK,
      name: "⤺  one day back"
    }
  ];
  gamesOptions.push(new inquirer.Separator(" "));
  if (matchDay) {
    gamesOptions.push(new inquirer.Separator(matchDay.date));
  } else {
    gamesOptions.push(new inquirer.Separator(date.toLocaleString()));
  }
  gamesOptions.push(new inquirer.Separator(" "));

  const allGamesHaveStreamsAvailable = _.every(games, streamsAvailable);
  if (games.length > 0) {
    games.forEach(game => {
      gamesOptions.push({
        value: String(game.gamePk),
        name: renderGameName(game, config, allGamesHaveStreamsAvailable),
        disabled: isGameDisabledForDownloadAndReasonWhy(game)
      });
    });
  } else {
    let noGamesMessage: string;
    if (hiddenGames.length === 0) {
      noGamesMessage = "(no games found)";
    } else if (hiddenGames.length === 1) {
      noGamesMessage = "(1 hidden game)";
    } else {
      noGamesMessage = `(${hiddenGames.length} hidden games)`;
    }
    gamesOptions.push(new inquirer.Separator(`  ${noGamesMessage}`));
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
    return chooseGame(config, date.minus({ days: 1 }));
  }
  if (gameSelected[questionNameGame] === DIRECTION.FORWARD) {
    return chooseGame(config, date.plus({ days: 1 }));
  }

  const game = games.find(
    game => String(game.gamePk) === gameSelected[questionNameGame]
  );

  if (!game) {
    throw new Error("Unknown selection");
  }

  return [game, date];
};
