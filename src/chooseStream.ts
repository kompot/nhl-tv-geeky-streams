import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  ProcessedStream,
  ProcessedStreamList,
  StreamSelection,
} from './geekyStreamsApi';

const renderStreamName = (
  processedStream: ProcessedStream,
  isPreferredStream: boolean,
) => {
  const paddedResolution = _.padEnd(processedStream.resolution, 6)
  const resolutionName = isPreferredStream ? chalk.yellow(paddedResolution) : paddedResolution;
  const displayName = resolutionName + " " + chalk.gray(processedStream.bitrate);
  return displayName;
};

const renderStreams = (
  streamList: ProcessedStreamList
): void => {
  streamList.streams.forEach(stream => {
    stream.displayName = renderStreamName(stream, stream === streamList.preferredStream);
  });
};

export const chooseStream = async (
  streamList: ProcessedStreamList
): Promise<StreamSelection> => {
  const streamSelection: StreamSelection = {
    auth: streamList.auth,
    mediaAuth: streamList.mediaAuth,
    selectNewGame: false,
  }
  if (streamList.isBlackedOut) {
    console.log(
      chalk.yellow(
        "This game is blacked out in your region. Try using VPN or select another game."
      )
    );
    streamSelection.selectNewGame = true;
    return streamSelection;
  }
  if (streamList.unknownError) {
    console.log(
      chalk.yellow(streamList.unknownError)
    );
    return streamSelection;
  }

  renderStreams(streamList);
  const processedStreams = streamList.streams;
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
  streamSelection.processedStream = streamSelected[questionNameStream];
  return streamSelection;
};
