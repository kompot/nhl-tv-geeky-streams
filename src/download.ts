import { spawn } from "child_process";
import chalk from "chalk";
import * as readline from "readline";
import * as _ from "lodash";

import {
  OffsetObject,
  persistFirstFileCreationTimeAndOffset
} from "./calcRecordingOffset";
import { SESSION_ATTRIBUTE_NAME } from "./nhlMfApi";
import { AuthSession } from "./auth";
import { IStream } from "./chooseStream";

const processName = "streamlink";

// can be `1.2 KB`, `5.2 MB`, `9.1 GB`, probably others, it's streamlink's
// proprietary output format
const sizeInMb = (l: string) => {
  let multiplier = 1;
  if (l.indexOf("GB") !== -1) {
    multiplier = 1024;
  }
  if (l.indexOf("KB") !== -1) {
    multiplier = 1 / 1024;
  }
  return _.round(parseFloat(l) * multiplier, 2);
};

export const download = (
  filename: string,
  recordingOffset: OffsetObject,
  auth: AuthSession,
  mediaAuth: string,
  stream: IStream,
  streamlinkExtraOptions: string[] = []
) => {
  const streamlinkBaseOptions = [
    "-o",
    `./video/${recordingOffset.finalFilename}.mp4`,
    "--hls-start-offset",
    recordingOffset.durationOffset.toFormat("hh:mm:ss"),
    `--http-cookie`,
    "Authorization=" + auth.authHeader,
    `--http-cookie`,
    SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2 + "=" + mediaAuth,
    stream.url,
    "best"
  ];

  const streamStart = spawn(processName, [
    ...streamlinkBaseOptions,
    ...streamlinkExtraOptions
  ]);

  let recordStartTimePersisted = false;

  streamStart.stdout.on("data", data => {
    if (!recordStartTimePersisted && recordingOffset.filesLength === 0) {
      recordStartTimePersisted = true;
      persistFirstFileCreationTimeAndOffset(
        filename,
        recordingOffset.recordingStart,
        recordingOffset.recordingOffset
      );
    }
    console.log(`${processName}: ${data}`);
  });

  const progressMarker = "[download]";

  const initTs = Date.now();

  streamStart.stderr.on("data", data => {
    const dataAsString = (data as Buffer).toString();
    if (dataAsString.indexOf(progressMarker) === 1) {
      const l = dataAsString.substr(progressMarker.length + 1);
      const mb = sizeInMb(l);
      const downloadSpeed = _.round(mb / ((Date.now() - initTs) / 1000), 2);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stderr.write(
        "Downloaded" +
          chalk.yellow(` ${mb} MB`) +
          ` at avg speed of ${downloadSpeed} MB/s`
      );
    } else {
      console.log(`\n${processName}`, dataAsString);
    }
  });

  streamStart.on("close", code => {
    console.log(`${processName} exited with code ${code}`);
  });
};
