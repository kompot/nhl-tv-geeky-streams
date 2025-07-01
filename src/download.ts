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
const progressMarker = "[download]";

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
    "--progress=force",
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
    
    handleDownloadOutput(data as Buffer);
  });

  streamStart.stderr.on("data", data => {
    handleDownloadOutput(data as Buffer);
  });

  streamStart.on("close", code => {
    console.log(`${processName} exited with code ${code}`);
  });
};

const handleDownloadOutput = (
  data: Buffer
) => {
  const dataAsString = (data as Buffer).toString();
  const progressMarkerIndex = dataAsString.indexOf(progressMarker);
  if (progressMarkerIndex > -1 && progressMarkerIndex < 2) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // these magic substringing is based on streamlink version 0.14.2 output
    // and may/will definitely break for outdated/future streamlink versions
    const progressString = dataAsString.substring(
      dataAsString.lastIndexOf("]") + 2,
      dataAsString.lastIndexOf(")") + 1
    );
      
    process.stderr.write(progressString);
  } else if (/^\s+$/.test(dataAsString)) {
    // ignore
  } else {
    console.log(`\n${processName} ${dataAsString}`);
  }
}
