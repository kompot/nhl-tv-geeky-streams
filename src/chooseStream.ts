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
  passive: boolean,
  streamList: ProcessedStreamList
): Promise<StreamSelection> => {
  if (streamList.isBlackedOut) {
    console.log(
      chalk.yellow(
        "This game is blacked out in your region. Try using VPN or select another game."
      )
    );

    if (passive) {
      return {
        cancelSelection: true,
      };
    }

    return {
      cancelSelection: false,
      selectNewGame: true,
    };
  } else if (streamList.unknownError) {
    console.log(
      chalk.yellow(streamList.unknownError)
    );

    return {
      cancelSelection: true,
    };
  }

  renderStreams(streamList);
  if (passive) {
    return chooseStreamPassively(streamList);
  } else {
    return chooseStreamInteractively(streamList);
  }
};

export const chooseStreamInteractively = async (
  streamList: ProcessedStreamList
): Promise<StreamSelection> => {
  const processedStreams = streamList.streams;
  const streamOptions = processedStreams.map(processedStream => ({
    value: processedStream,
    name: processedStream.displayName!,
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
  const streamSelection: StreamSelection = {
    cancelSelection: false,
    processedStream: streamSelected[questionNameStream],
    selectNewGame: false,
  };

  return streamSelection;
};

export const chooseStreamPassively = async (
  streamList: ProcessedStreamList
): Promise<StreamSelection> => {
  const processedStream = streamList.preferredStream;
  
  if (!processedStream) {
    console.log(
      chalk.yellow(
        "The stream couldn't be autoselected."
      )
    );
    streamList.streams.forEach(s => console.log(s.displayName));
    return {
      cancelSelection: true,
    };
  }

  console.log(processedStream.displayName);
  return {
    cancelSelection: false,
    selectNewGame: false,
    processedStream,
  };
};
