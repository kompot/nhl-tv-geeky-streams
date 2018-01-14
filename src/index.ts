import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import axios from "axios";
import * as _ from "lodash";
import { spawn } from "child_process";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as luxon from "luxon";

import {
  NhlStatsApi,
  NhlStatsApiBaseUrl,
  EpgTitle,
  MEDIA_STATE
} from "./nhlStatsApi";
import {
  NhlMfApi,
  NhlMfApiBaseUrl,
  PLAYBACK_SCENARIO,
  FORMAT,
  Response,
  STATUS_CODE,
  CDN,
  SESSION_ATTRIBUTE_NAME
} from "./nhlMfApi";

import { getAuthSession } from "./auth";
import { chooseGame } from "./chooseGame";
import { chooseStream } from "./chooseStream";
import { DateTime, Duration } from "luxon";
import { caclRecordingOffset } from "./calcRecordingOffset";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});
const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

export interface Config {
  email: string;
  password: string;
  matchTimeZone: string;
  playLiveGamesFromStart?: boolean;
  favouriteTeams?: string[];
  skipOtherTeams?: boolean;
  startDownloadingIfSingleGameFound: true;
}

var config: Config = yaml.safeLoad(fs.readFileSync("./config.yaml"));

const main = async () => {
  const game = await chooseGame(config);

  const feedOptions = game.content.media.epg
    .find(e => e.title === EpgTitle.NHLTV)
    .items.map(epgItem => ({
      value: [
        epgItem.eventId,
        epgItem.mediaPlaybackId,
        epgItem.mediaFeedType,
        epgItem.callLetters,
        epgItem.mediaState
      ].join("|"),
      name: _.compact([
        epgItem.mediaFeedType,
        epgItem.callLetters,
        epgItem.feedName
      ]).join(", ")
    }));

  const questionNameFeed = "feed";

  const questionsFeed: inquirer.Question[] = [
    {
      type: "list",
      name: questionNameFeed,
      message: "Choose feed to watch",
      choices: feedOptions
    }
  ];

  const feedSelected = await inquirer.prompt(questionsFeed);

  const [
    eventId,
    mediaPlaybackId,
    mediaFeedType,
    callLetters,
    mediaState
  ] = feedSelected[questionNameFeed].split("|");

  const auth = await getAuthSession(config.email, config.password, eventId);

  const r1 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      contentId: mediaPlaybackId,
      playbackScenario: PLAYBACK_SCENARIO.HTTP_CLOUD_WIRED_60,
      sessionKey: auth.sessionKey,
      auth: "response",
      format: FORMAT.JSON,
      cdnName: CDN.AKAMAI
    },
    headers: {
      Authorization: auth.authHeader
    }
  });
  // console.log(
  //   "_____ r1",
  //   JSON.stringify((r1.data as Response.Playlist), null, 2)
  // );

  const mediaAuth = (r1.data as Response.Playlist).session_info.sessionAttributes.find(
    sa => sa.attributeName === SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2
  ).attributeValue;
  const masterUrl = (r1.data as Response.Playlist).user_verified_event[0]
    .user_verified_content[0].user_verified_media_item[0].url;

  const stream = await chooseStream(masterUrl);

  const filename = [
    luxon.DateTime.fromISO(game.gameDate)
      .setZone(config.matchTimeZone)
      .toISODate(),
    game.teams.away.team.abbreviation.replace(/\s+/g, "_"),
    "at",
    game.teams.home.team.abbreviation.replace(/\s+/g, "_"),
    "(" + mediaFeedType + (callLetters && "_") + callLetters + ")",
    stream.resolution,
    mediaState === MEDIA_STATE.ON ? "live" : "archive"
  ].join("_");

  const recordingOffset = caclRecordingOffset(
    filename,
    game,
    mediaState,
    config
  );

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

  const streamStart = spawn("streamlink", streamlinkOptions);

  streamStart.stdout.on("data", data => {
    console.log(`stdout: ${data}`);
  });

  streamStart.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
  });

  streamStart.on("close", code => {
    console.log(`child process exited with code ${code}`);
  });
};

main();
