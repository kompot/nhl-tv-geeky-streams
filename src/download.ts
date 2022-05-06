import { spawn } from "child_process";
import * as readline from "readline";
import * as _ from "lodash";

import {
  persistFirstFileCreationTimeAndOffset
} from "./calcRecordingOffset";
import {
  OffsetObject,
} from './geekyStreamsApi';

const processName = "streamlink";

export const download = (
  filename: string,
  recordingOffset: OffsetObject,
  streamDownloadUrl: string,
  streamlinkAuthOptions: string[] = [],
  streamlinkExtraOptions: string[] = []
) => {
  const streamlinkBaseOptions = [
    "-o",
    `./video/${recordingOffset.finalFilename}.mp4`,
    "--force-progress",
    "--hls-start-offset",
    recordingOffset.durationOffset.toFormat("hh:mm:ss"),
    streamDownloadUrl,
    "best"
  ];

  const streamStart = spawn(processName, [
    ...streamlinkAuthOptions,
    ...streamlinkExtraOptions,
    ...streamlinkBaseOptions,
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

  streamStart.stderr.on("data", data => {
    const dataAsString = (data as Buffer).toString();
    if (dataAsString.indexOf(progressMarker) === 1) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stderr.write(
        // these magic substringing is based on streamlink version 0.14.2 output
        // and may/will definitely break for outdated/future streamlink versions
        dataAsString.substring(
          dataAsString.lastIndexOf("]") + 2,
          dataAsString.lastIndexOf(")") + 1
        )
      );
    } else if (/^\s+$/.test(dataAsString)) {
      // ignore
    } else {
      console.log(`\n${processName}`, dataAsString);
    }
  });

  streamStart.on("close", code => {
    console.log(`${processName} exited with code ${code}`);
  });
};
