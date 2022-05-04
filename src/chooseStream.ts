import chalk from "chalk";
import * as inquirer from "inquirer";
import * as _ from "lodash";

import {
  ProcessedStream,
  ProviderStream,
  ProviderStreamList,
  StreamSelection,
} from './geekyStreamsApi';

interface RenderedStream {  
  displayName: string;
  stream: ProviderStream;
}

interface RenderedStreamList {
  streams: RenderedStream[],
  preferredStream?: RenderedStream;
}

const getPreferredStream = (
  streams: ProviderStream[],
  preferredQuality: string | undefined
): ProviderStream | undefined => {
  let preferredStream: ProviderStream | undefined;
  if (preferredQuality && streams.length > 0) {
    if (preferredQuality === "best") {
      preferredStream = streams[0];
    } else if (preferredQuality === "worst") {
      preferredStream = streams[streams.length - 1];
    } else {
      preferredStream = streams.find(s => s.getStream().resolution === preferredQuality);
    }
  }
  return preferredStream;
};

const renderStreamName = (
  processedStream: ProcessedStream,
  isPreferredStream: boolean,
): string => {
  const paddedResolution = _.padEnd(processedStream.resolution, 6)
  const resolutionName = isPreferredStream ? chalk.yellow(paddedResolution) : paddedResolution;
  const displayName = resolutionName + " " + chalk.gray(processedStream.bitrate);
  return displayName;
};

const renderStream = (
  providerStream: ProviderStream,
  isPreferredStream: boolean,
): RenderedStream => {
  return {
    displayName: renderStreamName(providerStream.getStream(), isPreferredStream),
    stream: providerStream,
  };
};

const renderStreams = (
  preferredQuality: string | undefined,
  streamList: ProviderStreamList
): RenderedStreamList => {
  const preferredStream = getPreferredStream(streamList.streams, preferredQuality);
  let preferredRenderedStream: RenderedStream | undefined;

  const renderedStreams = streamList.streams.map(stream => {
    const isPreferredStream = stream === preferredStream;
    const renderedStream = renderStream(stream, isPreferredStream);
    if (isPreferredStream) {
      preferredRenderedStream = renderedStream;
    }
    return renderedStream;
  });

  return {
    streams: renderedStreams,
    preferredStream: preferredRenderedStream,
  };
};

export const chooseStream = async (
  passive: boolean,
  preferredQuality: string | undefined,
  streamList: ProviderStreamList
): Promise<StreamSelection> => {
  if (streamList.isBlackedOut || streamList.isUnauthorized) {
    console.log(
      chalk.yellow(
        streamList.isBlackedOut ? "This game is blacked out in your region. Try using VPN or select another game."
        : "This game is not available with your subscription."
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

  const renderedStreamList = renderStreams(preferredQuality, streamList);
  if (passive) {
    return chooseStreamPassively(renderedStreamList);
  } else {
    return chooseStreamInteractively(renderedStreamList);
  }
};

export const chooseStreamInteractively = async (
  streamList: RenderedStreamList
): Promise<StreamSelection> => {
  const streamOptions = streamList.streams.map(renderedStream => {
    const streamValue: StreamSelection = {
      cancelSelection: false,
      providerStream: renderedStream.stream,
      selectNewGame: false,
    };

    return {
      value: streamValue,
      name: renderedStream.displayName,
    }
  });

  const questionNameStream = "stream";
  const questionsStream: inquirer.ListQuestion[] = [
    {
      type: "list",
      pageSize: 22,
      name: questionNameStream,
      message: "Choose stream quality",
      choices: streamOptions
    }
  ];

  const streamSelected = await inquirer.prompt(questionsStream);
  return streamSelected[questionNameStream];
};

export const chooseStreamPassively = async (
  streamList: RenderedStreamList
): Promise<StreamSelection> => {
  const renderedStream = streamList.preferredStream;
  
  if (!renderedStream) {
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

  console.log(renderedStream.displayName);
  return {
    cancelSelection: false,
    selectNewGame: false,
    providerStream: renderedStream.stream,
  };
};
