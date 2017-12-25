import * as inquirer from "inquirer";
import axios from "restyped-axios";

import { NhlStatsApi } from "./nhlStatsApi";

const client = axios.create<NhlStatsApi>({
  baseURL: "https://statsapi.web.nhl.com/api/v1"
});

client
  .request({
    url: "/teams"
  })
  .then(response => {
    const teams = response.data.teams
      .sort((t1, t2) => t1.name.localeCompare(t2.name))
      .map(t => t.name);

    const questions: inquirer.Question[] = [
      {
        type: "list",
        name: "Favourite team",
        message:
          "Choose your favourite team, Geeky Streams will show you this team's matches on next launch",
        choices: teams
      }
    ];

    inquirer.prompt(questions).then((answers: inquirer.Answers) => {
      console.log("_____ answers", answers);
    });
  });
