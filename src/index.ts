import axiosRestyped from "restyped-axios";
import * as _ from "lodash";
import chalk from "chalk";

import * as yaml from "js-yaml";
import * as fs from "fs";
import * as luxon from "luxon";

import {
  Config,
} from './geekyStreamsApi';
import {
  MEDIA_STATE
} from "./nhlStatsApi";
import {
  NhlMfApi,
  NhlMfApiBaseUrl,
  PLAYBACK_SCENARIO,
  FORMAT,
  Response,
  CDN,
  SESSION_ATTRIBUTE_NAME,
  BLACKOUT_STATUS
} from "./nhlMfApi";

import { getAuthSession, AuthSession } from "./auth";
import { chooseFeed } from "./chooseFeed";
import { chooseGame } from "./chooseGame";
import { chooseStream } from "./chooseStream";
import {
  calcRecordingOffset,
} from "./calcRecordingOffset";
import { download } from "./download";

const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

const config = yaml.load(fs.readFileSync("./src/config.yaml.local", "utf-8")) as Config;
// don't hide other teams if none are favourited
const hasFavouriteTeams = !!(config.favouriteTeams && config.favouriteTeams.length);
config.hideOtherTeams = hasFavouriteTeams && config.hideOtherTeams;

const main = async (
  date: luxon.DateTime = luxon.DateTime.local().setZone(config.matchTimeZone)
): Promise<void> => {
  const [game, dateLastSelected] = await chooseGame(config, date);
  const feed = await chooseFeed(config, game);

  let auth: AuthSession | undefined;
  try {
    auth = await getAuthSession(config.email, config.password, feed.eventId);
  } catch (e) {
    if (e instanceof Error) {
      console.log(
        chalk.yellow(e.message)
      );
    } else {
      console.log(chalk.yellow(JSON.stringify(e)));
    }
    return;
  }

  const r1 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      contentId: Number(feed.mediaPlaybackId),
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

  const mediaAuthAttribute = mediaStream.session_info.sessionAttributes.find(
    sa => sa.attributeName === SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2
  );

  if (!mediaAuthAttribute) {
    throw new Error("Missing auth attribute.");
  }

  const mediaAuth = mediaAuthAttribute.attributeValue;
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
    "(" + feed.mediaFeedType + (feed.callLetters && "_") + feed.callLetters + ")",
    stream.resolution,
    feed.mediaState === MEDIA_STATE.ON ? "live" : "archive"
  ].join("_");

  const recordingOffset = calcRecordingOffset(
    filename,
    game,
    feed.mediaState,
    config
  );

  download(
    filename,
    recordingOffset,
    auth,
    mediaAuth,
    stream,
    config.streamlinkExtraOptions
  );
};

main();
