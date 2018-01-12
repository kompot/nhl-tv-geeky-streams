import axios from "axios";
import * as m3u8Parser from "m3u8-parser";
import * as _ from "lodash";
import * as inquirer from "inquirer";
import chalk from "chalk";

const streamOption = pl => {
  const framerate = pl.attributes["FRAME-RATE"]
    ? _.round(pl.attributes["FRAME-RATE"])
    : "";
  const rows = pl.attributes.RESOLUTION.height;
  const resolution = `${rows}p${framerate}`;
  const bitrate = chalk.gray("" + pl.attributes.BANDWIDTH / 1000 + "k");
  return {
    name: _.padEnd(resolution, 6) + " " + bitrate,
    value: pl.uri
  };
};

export const chooseStream = async (masterUrl: string): Promise<string> => {
  const masterPlaylistContent = await axios.get(masterUrl);

  var parser = new m3u8Parser.Parser();

  parser.push(masterPlaylistContent.data);
  parser.end();

  const streamOptions = _.sortBy(
    parser.manifest.playlists,
    pl => -pl.attributes.BANDWIDTH
  ).map(streamOption);

  const questionNameStream = "stream";
  const questionsStream: inquirer.Question[] = [
    {
      type: "list",
      name: questionNameStream,
      message: "Choose stream quality",
      choices: streamOptions
    }
  ];

  const streamSelected = await inquirer.prompt(questionsStream);

  return (
    masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1) + streamSelected
  );
};
