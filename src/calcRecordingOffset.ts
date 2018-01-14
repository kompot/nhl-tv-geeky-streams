import * as _ from "lodash";
import * as luxon from "luxon";
import { Duration } from "luxon";
import * as shell from "shelljs";

import { MEDIA_STATE, Game } from "./nhlStatsApi";
import { Config } from "./index";

interface OffsetObject {
  finalFilename: string;
  // this is used for https://streamlink.github.io/cli.html#cmdoption-hls-start-offset
  // and has differend meaning for live and archive matches
  // Amount of time to skip from the beginning of the stream. For live streams, this is a negative offset from the end of the stream.
  durationOffset: luxon.Duration;
}

export const caclRecordingOffset = (
  baseFilename: string,
  game: Game,
  mediaState: MEDIA_STATE,
  config: Config
): OffsetObject => {
  let files = [];

  // TODO extract `./video` folder setting to config
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
  const gameStart = luxon.DateTime.fromISO(game.gameDate);
  let filenameSuffix: string | number = "";
  if (files.length) {
    const filesModifiedTimes = files.map(file =>
      _.toNumber(shell.exec(`stat -c '%Y' "${file}"`).stdout)
    );

    const oldestFileModificationTime: number = _.min(filesModifiedTimes);
    // TODO just sort the files by name right after they are received
    const oldestFileIndex: number = _.findIndex(
      filesModifiedTimes,
      item => item === oldestFileModificationTime
    );

    const firstFileLengthInSeconds = shell.exec(
      // TODO this is executed twice for first file, refactor!
      // make `durationOfAllRecordedParts` just array and use _.sum
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${
        files[oldestFileIndex]
      }"`
    );

    const firstFileDuration = luxon.Duration.fromMillis(
      _.toNumber(firstFileLengthInSeconds.stdout) * 1000
    );
    const recordingStarted = luxon.DateTime.fromMillis(
      oldestFileModificationTime * 1000
    ).minus(firstFileDuration);

    const fromRecordingStartedToNow = luxon.DateTime.local().diff(
      recordingStarted
    );

    const t = files[oldestFileIndex].split("_");
    const secondsBeforeGameStartTimeRecordingHasStarted = _.parseInt(
      t[t.length - 1]
    );

    offsetBackToStartRecordingAt = recordingStarted
      .plus(fromRecordingStartedToNow)
      .plus(
        luxon.Duration.fromMillis(
          secondsBeforeGameStartTimeRecordingHasStarted * 1000
        )
      )
      .diff(gameStart);
    filenameSuffix = "part" + files.length;
  } else {
    if (
      luxon.DateTime.local().valueOf() > gameStart.valueOf() &&
      config.playLiveGamesFromStart
    ) {
      // if game has started and setting is set to record from the start
      offsetBackToStartRecordingAt = luxon.DateTime.local().diff(gameStart);
      filenameSuffix = 0;
    } else {
      // TODO check that 00:00:01 hack is no longer required
      // https://github.com/streamlink/streamlink/issues/1419
      // just drop this 1000ms
      offsetBackToStartRecordingAt = luxon.Duration.fromMillis(1000);
      filenameSuffix = _.toInteger(gameStart.diffNow().as("second"));
    }
  }

  const totalRecordedDuration = Duration.fromMillis(
    durationOfAllRecordedParts * 1000
  );
  let durationOffset: luxon.Duration = null;
  if (mediaState === MEDIA_STATE.ON) {
    durationOffset = offsetBackToStartRecordingAt.minus(totalRecordedDuration);
  }
  if (mediaState === MEDIA_STATE.ARCHIVE) {
    durationOffset = totalRecordedDuration;
  }

  return {
    finalFilename: [baseFilename, filenameSuffix].join('_'),
    durationOffset
  };
};
