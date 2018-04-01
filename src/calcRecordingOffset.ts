import * as _ from "lodash";
import * as luxon from "luxon";
import { Duration } from "luxon";
import * as shell from "shelljs";
import * as fs from "fs";

import { MEDIA_STATE, Game } from "./nhlStatsApi";
import { Config } from "./index";

export interface OffsetObject {
  finalFilename: string;
  // this is used for https://streamlink.github.io/cli.html#cmdoption-hls-start-offset
  // and has differend meaning for live and archive matches
  // Amount of time to skip from the beginning of the stream. For live streams, this is a negative offset from the end of the stream.
  durationOffset: luxon.Duration;
  filesLength: number;
}

const recordsFile = "./tmp/records.json";

export const persistFirstFileCreationTime = (filename: string, date: Date) => {
  const json = readRecords();
  json[filename] = date.getTime();
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
  game: Game,
  mediaState: MEDIA_STATE,
  config: Config
): OffsetObject => {
  let files = [];

  shell.ls("./video/*.mp4").forEach(file => {
    if (file.indexOf(baseFilename) !== -1) {
      files.push(file);
    }
  });

  let durationOfAllRecordedParts = 0;

  files.forEach((file: string, idx: number) => {
    const res = shell.exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`
    );
    durationOfAllRecordedParts += _.toNumber(res.stdout);
  });

  let offsetBackToStartRecordingAt: Duration;
  let filenameSuffix: string | number = "";
  if (files.length) {
    const filesModifiedTimes = files.map(file => fs.statSync(file).birthtimeMs);

    const oldestFileModificationTime: number = _.min(filesModifiedTimes);
    // TODO just sort the files by name right after they are received
    const oldestFileIndex: number = _.findIndex(
      filesModifiedTimes,
      item => item === oldestFileModificationTime
    );
    const oldestFile = files[oldestFileIndex];

    const recordingStarted = luxon.DateTime.fromMillis(
      readRecords()[baseFilename] || 0
    );

    const t = oldestFile.split("_");
    const secondsBeforeFirstFileCreatedRecordingHasStarted = _.parseInt(
      t[t.length - 1].split(".")[0]
    );

    offsetBackToStartRecordingAt = luxon.DateTime.local()
      .diff(recordingStarted)
      .plus(
        luxon.Duration.fromMillis(
          secondsBeforeFirstFileCreatedRecordingHasStarted * 1000
        )
      );
    filenameSuffix = "part" + files.length;
  } else {
    const gameStart = luxon.DateTime.fromISO(game.gameDate);
    const diff = luxon.DateTime.local().diff(gameStart);
    const secondsDiff = _.toInteger(diff.as("second"));
    const gameHasStarted =
      luxon.DateTime.local().valueOf() > gameStart.valueOf();
    if (mediaState === MEDIA_STATE.ARCHIVE) {
      filenameSuffix = 0;
    } else if (gameHasStarted && config.playLiveGamesFromStart) {
      // if game has started and setting is set to record from the start
      offsetBackToStartRecordingAt = diff;
      filenameSuffix = secondsDiff;
    } else {
      // TODO check that 00:00:01 hack is no longer required
      // https://github.com/streamlink/streamlink/issues/1419
      // just drop this 1000ms
      offsetBackToStartRecordingAt = luxon.Duration.fromMillis(1000);
      filenameSuffix = 1;
    }
  }

  const totalRecordedDuration = Duration.fromMillis(
    durationOfAllRecordedParts * 1000
  );

  const partConnectionCompensation =
    files.length === 0 ? 0 : luxon.Duration.fromMillis(10 * 1000);

  let durationOffset: luxon.Duration = null;
  if (mediaState === MEDIA_STATE.ON) {
    durationOffset = offsetBackToStartRecordingAt
      .plus(partConnectionCompensation)
      .minus(totalRecordedDuration);
  }
  if (mediaState === MEDIA_STATE.ARCHIVE) {
    durationOffset = totalRecordedDuration.minus(partConnectionCompensation);
  }

  return {
    finalFilename: [baseFilename, filenameSuffix].join("_"),
    durationOffset,
    filesLength: files.length
  };
};
