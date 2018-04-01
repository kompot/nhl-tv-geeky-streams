import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import axios from "axios";
import * as _ from "lodash";
import chalk from "chalk";

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
  SESSION_ATTRIBUTE_NAME,
  BLACKOUT_STATUS
} from "./nhlMfApi";

import { getAuthSession, AuthSession } from "./auth";
import { chooseGame } from "./chooseGame";
import { chooseStream } from "./chooseStream";
import { DateTime, Duration } from "luxon";
import {
  calcRecordingOffset,
  persistFirstFileCreationTime
} from "./calcRecordingOffset";
import { download } from "./download";

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

const main = async (
  date: luxon.DateTime = luxon.DateTime.local().setZone(config.matchTimeZone)
) => {
  const [game, dateLastSelected] = await chooseGame(config, date);

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

  let auth: AuthSession | undefined;
  try {
    auth = await getAuthSession(config.email, config.password, eventId);
  } catch (e) {
    console.log(
      chalk.yellow(e.message)
    );
    return;
  }

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

  const mediaStream = r1.data as Response.Playlist;

  if (
    mediaStream.user_verified_event[0].user_verified_content[0]
      .user_verified_media_item[0].blackout_status.status ===
    BLACKOUT_STATUS.BLACKED_OUT
  ) {
    console.log(
      chalk.yellow(
        "This game is blacked out in your region. Try using VPN or select another game."
      )
    );
    return main(dateLastSelected);
  }

  const mediaAuth = mediaStream.session_info.sessionAttributes.find(
    sa => sa.attributeName === SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2
  ).attributeValue;
  const masterUrl =
    mediaStream.user_verified_event[0].user_verified_content[0]
      .user_verified_media_item[0].url;

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

  const recordingOffset = calcRecordingOffset(
    filename,
    game,
    mediaState,
    config
  );

  download(filename, recordingOffset, auth, mediaAuth, stream);
};

main();
