import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import axios from "axios";
import * as m3u8Parser from "m3u8-parser";
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

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: NhlStatsApiBaseUrl
});
const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

interface Config {
  email: string;
  password: string;
  playLiveGamesFromStart?: boolean;
  favouriteTeams?: string[];
  skipOtherTeams?: boolean;
  startDownloadingIfSingleGameFound: true;
}

var config: Config = yaml.safeLoad(fs.readFileSync("./config.yaml"));

const main = async () => {
  const game = await chooseGame(config.favouriteTeams);

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

  const masterPlaylistContent = await axios.get(masterUrl);

  var parser = new m3u8Parser.Parser();

  parser.push(masterPlaylistContent.data);
  parser.end();

  var parsedManifest = parser.manifest;

  const maxBitrate = _.maxBy(
    parsedManifest.playlists,
    (pl: any) => pl.attributes.BANDWIDTH
  ).uri;

  const url =
    masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1) + maxBitrate;

  const filename = [
    game.gameDate.substr(0, 10),
    game.teams.home.team.name.replace(/\s+/g, "_"),
    "vs",
    game.teams.away.team.name.replace(/\s+/g, "_"),
    "(" + mediaFeedType + (callLetters && "_") + callLetters + ")"
  ].join("_");

  // each frame is 5 seconds, so if the game has started 10 minutes ago
  // we need to rewind (10 * 60)/5 = 120 frames back to start streaming
  // from the beginning
  const diffSeconds = luxon.DateTime.local()
    .diff(luxon.DateTime.fromISO(game.gameDate))
    .as("second");
  const rewindFramesBack =
    diffSeconds > 0 &&
    config.playLiveGamesFromStart &&
    mediaState === MEDIA_STATE.ON
      ? Math.floor(diffSeconds / 5)
      : // 3 is streamlink's default
        // https://streamlink.github.io/cli.html#cmdoption-hls-live-edge
        3;

  const streamStart = spawn("streamlink", [
    "-o",
    `./video/${filename}.mp4`,
    `--http-cookie`,
    "Authorization=" + auth.authHeader,
    `--http-cookie`,
    SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2 + "=" + mediaAuth,
    "--hls-live-edge",
    `${rewindFramesBack}`,
    url,
    "best"
  ]);

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

try {
  main();
} catch (e) {
  console.error("______", e);
}
