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

export const download = (
  filename: string,
  recordingOffset: OffsetObject,
  auth: AuthSession,
  mediaAuth: string,
  stream: IStream
) => {
  const streamlinkOptions = [
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

  const streamStart = spawn(processName, streamlinkOptions);

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

  const lastDataChunkSizeInMB = 0;
  const lastDataChunkTimestamp = Date.now();

  streamStart.stderr.on("data", data => {
    const dataAsString = (data as Buffer).toString();
    if (dataAsString.indexOf(progressMarker) === 1) {
      const l = dataAsString.substr(progressMarker.length + 1);
      const mb = parseFloat(l) * (l.indexOf("GB") !== -1 ? 1024 : 1);

      const downloadSpeed = _.round(
        (mb - lastDataChunkSizeInMB) /
          ((Date.now() - lastDataChunkTimestamp) / 1000),
        2
      );

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
