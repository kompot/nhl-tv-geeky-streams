import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import {
  Config,
  getProviderTeamFromAbbreviation,
  idPathVariableInterceptor,
  ProviderFeed,
  ProviderGame,
  ProviderGameStatus,
  ProviderTeam,
  timeXhrRequest,
} from "./geekyStreamsApi";
import {
  GAME_DETAILED_STATE,
  NhlStatsApi,
  NhlStatsApiBaseUrl,
  NhlStatsGameStateType,
  NhlStatsScheduleGameTeam,
  NhlStatsScoreGame,
} from "./nhlStatsApi";

const gamesFile = "./tmp/games.nhltv.json";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});
statsApi.interceptors.request.use(idPathVariableInterceptor);

class NhltvGame implements ProviderGame {
  awayTeam: ProviderTeam;
  game: NhlStatsScoreGame;
  gameDateTime: luxon.DateTime;
  gameStatus: ProviderGameStatus;
  homeTeam: ProviderTeam;

  constructor(game: NhlStatsScoreGame) {
    this.game = game;

    this.awayTeam = getProviderTeam(this.game.awayTeam);
    this.homeTeam = getProviderTeam(this.game.homeTeam);

    this.gameDateTime = luxon.DateTime.fromISO(this.game.startTimeUTC);
    this.gameStatus = calculateProviderGameStatus(
      game.gameState,
      game.periodDescriptor?.number,
      game.clock?.inIntermission,
      game.clock?.secondsRemaining,
      game.clock?.timeRemaining,
    );
  }

  getAwayTeam(): ProviderTeam {
    return this.awayTeam;
  }

  getHomeTeam(): ProviderTeam {
    return this.homeTeam;
  }

  getFeeds(): ProviderFeed[] {
    return [];
  }

  getGameDateTime(): luxon.DateTime {
    return this.gameDateTime;
  }

  getStatus(): ProviderGameStatus {
    return this.gameStatus;
  }
}

const calculateProviderGameStatus = (
  gameState: NhlStatsGameStateType,
  periodNumber?: number,
  isIntermission?: boolean,
  secondsRemaining?: number,
  timeRemaining?: string,
): ProviderGameStatus => {
  const gameStatus: ProviderGameStatus = {
    status: {
      detailedState: GAME_DETAILED_STATE.SCHEDULED,
    },
    linescore: {
      currentPeriodOrdinal: '',
      currentPeriodTimeRemaining: timeRemaining ?? '',
    },
  };

  switch (gameState) {
    case NhlStatsGameStateType.Live:
      gameStatus.status.detailedState = GAME_DETAILED_STATE.INPROGRESS;
      break;
    case NhlStatsGameStateType.Future:
      gameStatus.status.detailedState = GAME_DETAILED_STATE.SCHEDULED;
      return gameStatus;
    case NhlStatsGameStateType.Pregame:
      gameStatus.status.detailedState = GAME_DETAILED_STATE.PREGAME;
      return gameStatus;
    case NhlStatsGameStateType.Off:
      gameStatus.status.detailedState = GAME_DETAILED_STATE.FINAL;
      return gameStatus;
    default:
      return gameStatus;
  }

  if (!_.isNumber(periodNumber)) {
    return gameStatus;
  }

  switch (periodNumber) {
    case 1:
      gameStatus.linescore.currentPeriodOrdinal = '1st';
      break;
    case 2:
      gameStatus.linescore.currentPeriodOrdinal = '2nd';
      break;
    case 3:
      gameStatus.linescore.currentPeriodOrdinal = '3rd';
      break;
  }

  if (isIntermission) {
    gameStatus.linescore.currentPeriodOrdinal += ' INT';
  }

  if (periodNumber < 3) {
    return gameStatus;
  }

  if (!_.isNumber(secondsRemaining)) {
    if (periodNumber > 2) {
      gameStatus.status.detailedState = GAME_DETAILED_STATE.INPROGRESSCRITICAL;
    }
    return gameStatus;
  }
  
  if (isIntermission || periodNumber > 3 || secondsRemaining < 600) {
    gameStatus.status.detailedState = GAME_DETAILED_STATE.INPROGRESSCRITICAL;
  }

  return gameStatus;
}

const getProviderTeam = (team: NhlStatsScheduleGameTeam): ProviderTeam => {
  const providerTeam = getProviderTeamFromAbbreviation(team.abbrev);
  if (!providerTeam) {
    throw new Error(JSON.stringify(team));
  }
  return providerTeam;
}

const processGame = (
  game: NhlStatsScoreGame
): ProviderGame => {
  const nhltvGame = new NhltvGame(game);
  return nhltvGame;
};

export const getNhltvGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const { data } = await timeXhrRequest(statsApi, {
    url: "/score/:id",
    params: {
      id: date.toISODate(),
    }
  });

  fs.writeFileSync(gamesFile, JSON.stringify(data, null, 2));
  if (!data.games || data.games.length < 1) {
    return [];
  }

  return data.games.map(game => {
    return processGame(game);
  });
};
