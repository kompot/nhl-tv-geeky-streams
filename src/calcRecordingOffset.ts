import * as _ from "lodash";
import * as luxon from "luxon";
import * as shell from "shelljs";
import * as fs from "fs";

import {
  Config,
  OffsetObject,
} from './geekyStreamsApi';

const recordsFile = "./tmp/records.json";

export const persistFirstFileCreationTimeAndOffset = (
  filename: string,
  recordingStart: number,
  recordingOffset: number
) => {
  const json = readRecords();
  json[filename] = {
    recordingStart,
    recordingOffset
  };
  fs.writeFileSync(recordsFile, JSON.stringify(json, null, 2));
};

const readRecords = () => {
  if (!fs.existsSync(recordsFile)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(recordsFile).toString());
};

export const calcRecordingOffset = (
  baseFilename: string,
  gameDateTime: luxon.DateTime,
  isLive: boolean,
  config: Config
): OffsetObject => {
  let files: string[] = [];

  shell.ls("./video/*.mp4").forEach(file => {
    if (file.indexOf(baseFilename) !== -1) {
      files.push(file);
    }
  });

  let offsetBackToStartRecordingAt = luxon.Duration.fromMillis(0);
  let filenameSuffix: string = "";
  let recordingOffset = 0;
  let recordingStart = Date.now();
  if (files.length) {
    const creationTimeAndOffset = readRecords()[baseFilename];
    const recordingStarted = luxon.DateTime.fromMillis(
      creationTimeAndOffset.recordingStart
    );
    offsetBackToStartRecordingAt = luxon.DateTime.local()
      .diff(recordingStarted)
      .plus(
        luxon.Duration.fromMillis(creationTimeAndOffset.recordingOffset * 1000)
      );
    filenameSuffix = "part" + files.length;
  } else {
    const gameStart = gameDateTime;
    recordingStart = Date.now();
    const diff = luxon.DateTime.fromMillis(recordingStart).diff(gameStart);
    if (!diff.isValid) {
      throw new Error(`Invalid diff of ${recordingStart} and ${gameStart}: ${JSON.stringify(diff)}`);
    }

    const secondsDiff = _.toInteger(diff.as("seconds"));
    const gameHasStarted =
      luxon.DateTime.local().valueOf() > gameStart.valueOf();
    if (!isLive) {
      recordingOffset = 0;
    } else if (gameHasStarted && config.playLiveGamesFromStart) {
      // if game has started and setting is set to record from the start
      offsetBackToStartRecordingAt = diff;
      recordingOffset = secondsDiff;
    } else {
      // TODO check that 00:00:01 hack is no longer required
      // https://github.com/streamlink/streamlink/issues/1419
      // just drop this 1000ms
      offsetBackToStartRecordingAt = luxon.Duration.fromMillis(1000);
      recordingOffset = 1;
    }
  }

  let durationOfAllRecordedParts = 0;

  if (files.length) {
    console.log(`Duration of previously recorded files:`);
  }

  files.forEach((file: string, idx: number) => {
    const res = shell.exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
      {
        silent: true
      }
    );
    const partDuration = _.toNumber(res.stdout) * 1000;
    console.log(
      `${file}: ${luxon.Duration.fromMillis(partDuration).toFormat("hh:mm:ss")}`
    );
    durationOfAllRecordedParts += partDuration;
  });

  const totalRecordedDuration = luxon.Duration.fromMillis(durationOfAllRecordedParts);

  const partConnectionCompensation =
    files.length === 0 ? 0 : luxon.Duration.fromMillis(1 * 1000);

  let durationOffset = luxon.Duration.fromMillis(0);
  if (isLive) {
    durationOffset = offsetBackToStartRecordingAt
      .plus(partConnectionCompensation)
      .minus(totalRecordedDuration);
  } else {
    durationOffset = totalRecordedDuration.minus(partConnectionCompensation);
  }

  return {
    recordingStart,
    recordingOffset,
    finalFilename: _.compact([baseFilename, filenameSuffix]).join("_"),
    durationOffset,
    filesLength: files.length
  };
};
