import * as fs from "fs";
import * as _ from "lodash";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";

import {
  Config,
  ProviderFeed,
  ProviderGame,
  ProviderGameStatus,
  ProviderTeam,
  timeXhrRequest,
} from "./geekyStreamsApi";
import {
  Game,
  NhlStatsApi,
  NhlStatsApiBaseUrl,
  Team,
} from "./nhlStatsApi";

const gamesFile = "./tmp/games.nhltv.json";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});

class NhltvGame implements ProviderGame {
  awayTeam: ProviderTeam;
  game: Game;
  gameDateTime: luxon.DateTime;
  homeTeam: ProviderTeam;

  constructor(game: Game) {
    this.game = game;

    this.awayTeam = getProviderTeam(this.game.teams.away.team);
    this.homeTeam = getProviderTeam(this.game.teams.home.team);

    this.gameDateTime = luxon.DateTime.fromISO(this.game.gameDate);
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
    return this.game;
  }
}

const getProviderTeam = (team: Team): ProviderTeam => {
  return {
    abbreviation: team.abbreviation,
    fullName: team.name,
    nickname: team.teamName,
  };
}

const processGame = (
  game: Game
): ProviderGame => {
  const nhltvGame = new NhltvGame(game);
  return nhltvGame;
};

export const getNhltvGameList = async (
  config: Config,
  date: luxon.DateTime
): Promise<ProviderGame[]> => {
  const { data: { dates } } = await timeXhrRequest(statsApi, {
    url: "/schedule",
    params: {
      startDate: date.toISODate(),
      endDate: date.toISODate(),
      expand: "schedule.game.content.media.epg,schedule.teams,schedule.linescore"
    }
  });

  fs.writeFileSync(gamesFile, JSON.stringify(dates, null, 2));
  if (dates.length < 1) {
    return [];
  }

  // we only asked for one date so only look at the first one
  const matchDay = dates[0];
  return matchDay.games.map(game => {
    return processGame(game);
  });
};
