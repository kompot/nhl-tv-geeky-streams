import axios from "axios";
const m3u8Parser = require("m3u8-parser");
import * as _ from "lodash";
import * as inquirer from "inquirer";
import chalk from "chalk";

import {
  Config,
  ProcessedStream,
} from './geekyStreamsApi';

const processStream = (
  pl: any,
  masterUrl: string
): ProcessedStream => {
  const framerate = pl.attributes["FRAME-RATE"]
    ? _.round(pl.attributes["FRAME-RATE"])
    : "";
  const rows = pl.attributes.RESOLUTION.height;
  const resolution = `${rows}p${framerate}`;
  const bandwidth = pl.attributes.BANDWIDTH;
  const bitrate = chalk.gray("" + bandwidth / 1000 + "k");
  const displayName = _.padEnd(resolution, 6) + " " + bitrate;
  const downloadUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1) + pl.uri;

  return {
    bandwidth,
    bitrate,
    displayName,
    downloadUrl,
    resolution,
  };
}

const getStreams = async (
  masterUrl: string,
  preferredQuality: string | undefined,
): Promise<ProcessedStream[]> => {
  const masterPlaylistContent = await axios.get(masterUrl);

  const parser = new m3u8Parser.Parser();
  parser.push(masterPlaylistContent.data);
  parser.end();

  const streams: ProcessedStream[] = parser.manifest.playlists.map((playlist: any) => {
    return processStream(playlist, masterUrl);
  });
  streams.sort((x, y) => y.bandwidth - x.bandwidth);

  if (preferredQuality && streams.length > 0) {
    let preferredStream: ProcessedStream | undefined;
    if (preferredQuality === "best") {
      preferredStream = streams[0];
    } else if (preferredQuality === "worst") {
      preferredStream = streams[streams.length - 1];
    } else {
      preferredStream = streams.find(s => s.resolution === preferredQuality);
    }
    if (preferredStream) {
      const resolution = chalk.yellow(_.padEnd(preferredStream.resolution, 6));
      preferredStream.displayName = resolution + " " + preferredStream.bitrate;
    }
  }

  return streams;
}

export const chooseStream = async (
  config: Config,
  masterUrl: string
): Promise<ProcessedStream> => {
  const processedStreams = await getStreams(masterUrl, config.preferredStreamQuality);
  const streamOptions = processedStreams.map(processedStream => ({
    value: processedStream,
    name: processedStream.displayName,
  }));

  const questionNameStream = "stream";
  const questionsStream: inquirer.ListQuestion[] = [
    {
      type: "list",
      name: questionNameStream,
      message: "Choose stream quality",
      choices: streamOptions
    }
  ];

  const streamSelected = await inquirer.prompt(questionsStream);
  const stream: ProcessedStream = streamSelected[questionNameStream];
  return stream;
};
