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
  recordingStart: number,
  recordingOffset: number;
}

const recordsFile = "./tmp/records.json";

export const persistFirstFileCreationTimeAndOffset = (filename: string, recordingStart: number, recordingOffset: number) => {
  const json = readRecords();
  json[filename] = {
    recordingStart,
    recordingOffset,
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

  let offsetBackToStartRecordingAt: Duration;
  let filenameSuffix: string = "";
  let recordingOffset = 0;
  let recordingStart = Date.now();
  if (files.length) {
    const creationTimeAndOffset = readRecords()[baseFilename];
    const recordingStarted = luxon.DateTime.fromMillis(creationTimeAndOffset.recordingStart);
    offsetBackToStartRecordingAt = luxon.DateTime.local()
      .diff(recordingStarted)
      .plus(
        luxon.Duration.fromMillis(
          creationTimeAndOffset.recordingOffset * 1000
        )
      );
    filenameSuffix = "part" + files.length;
  } else {
    const gameStart = luxon.DateTime.fromISO(game.gameDate);
    recordingStart = Date.now();
    const diff = luxon.DateTime.fromMillis(recordingStart).diff(gameStart);
    const secondsDiff = _.toInteger(diff.as("second"));
    const gameHasStarted =
      luxon.DateTime.local().valueOf() > gameStart.valueOf();
    if (mediaState === MEDIA_STATE.ARCHIVE) {
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

  files.forEach((file: string, idx: number) => {
    const res = shell.exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`
    );
    durationOfAllRecordedParts += _.toNumber(res.stdout);
  });

  const totalRecordedDuration = Duration.fromMillis(
    durationOfAllRecordedParts * 1000
  );

  const partConnectionCompensation =
    files.length === 0 ? 0 : luxon.Duration.fromMillis(1 * 1000);

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
    recordingStart,
    recordingOffset,
    finalFilename: _.compact([baseFilename, filenameSuffix]).join("_"),
    durationOffset,
    filesLength: files.length
  };
};
