import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import axios from "axios";
import * as cookie from "cookie";
import * as m3u8Parser from 'm3u8-parser';
import * as _ from 'lodash';
import { spawn } from 'child_process';

import { NhlStatsApi, EpgTitle } from "./nhlStatsApi";
import {
  NhlMfApi,
  PLAYBACK_SCENARIO,
  FORMAT,
  Response,
  STATUS_CODE,
  CDN,
  SESSION_ATTRIBUTE_NAME
} from "./nhlMfApi";
import { NhlUserApi, USER_IDENTITY_TYPE } from "./nhlUserApi";

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: "https://statsapi.web.nhl.com/api/v1"
});
const userApi = axiosRestyped.create<NhlUserApi>({
  baseURL: "https://user.svc.nhl.com"
});
const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: "https://mf.svc.nhl.com"
});

// NOTE: This token is from the meta tag "control_plane_client_token" on https://www.nhl.com/login
const CLIENT_TOKEN =
  "d2ViX25obC12MS4wLjA6MmQxZDg0NmVhM2IxOTRhMThlZjQwYWM5ZmJjZTk3ZTM=";

const main = async () => {
  const { data: { dates } } = await statsApi
    .request({
      url: "/schedule",
      params: {
        startDate: "2017-12-30",
        endDate: "2017-12-30",
        expand: "schedule.game.content.media.epg"
      }
    });

  const games = _.flatMap(dates, matchDay => matchDay.games);

  const gamesOptions = games.map(game => ({
    value: String(game.gamePk),
    name: game.gameDate + "|" + game.teams.home.team.name + " vs " + game.teams.away.team.name
  }));

  const questionsGame: inquirer.Question[] = [
    {
      type: "list",
      name: "game",
      message:
        "Choose game to watch",
      choices: gamesOptions
    }
  ];

  const gameSelected = await inquirer.prompt(questionsGame);
  const game = games.find(game => String(game.gamePk) === gameSelected.game)

  const feedOptions = game.content.media.epg
    .find(e => e.title === EpgTitle.NHLTV)
    .items.map(epgItem => ({
      value: epgItem.eventId + "|" + epgItem.mediaPlaybackId,
      name: epgItem.mediaFeedType + ", " + epgItem.callLetters
    }))

  const questionsFeed: inquirer.Question[] = [
    {
      type: "list",
      name: "feed",
      message:
        "Choose feed to watch",
      choices: feedOptions
    }
  ];

  const feedSelected = await inquirer.prompt(questionsFeed);

  const [eventId, mediaPlaybackId] = feedSelected.feed.split('|');

  const { data: { access_token } } = await userApi.post(
    "/oauth/token?grant_type=client_credentials",
    null,
    {
      headers: {
        Authorization: "Basic " + CLIENT_TOKEN
      }
    }
  );
  console.log("_____ access_token", access_token);
  const r = await userApi.post(
    "/v2/user/identity",
    {
      email: {
        address: process.env.email
      },
      type: USER_IDENTITY_TYPE.EmailPassword,
      password: {
        value: process.env.password
      }
    },
    {
      headers: {
        Authorization: access_token
      }
    }
  );
  const authorizationCookie = r.headers["set-cookie"]
    .map(cookie.parse)
    .find(ck => ck.Authorization);
  if (!authorizationCookie) {
    throw new Error("Authorization cookie was not found.");
  }

  console.log(
    "_____ authorizationCookieValue",
    authorizationCookie.Authorization
  );

  const r2 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      eventId,
      format: FORMAT.JSON,
      subject: EpgTitle.NHLTV
    },
    headers: {
      Authorization: authorizationCookie.Authorization
    }
  });

  if (r2.data.status_code !== STATUS_CODE.OK) {
    throw new Error(r2.data.status_message);
  }

  const sessionKey = (r2.data as Response.SessionKey).session_key;
  console.log('_____ sessionKey', sessionKey);

  const r1 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      contentId: mediaPlaybackId,
      playbackScenario: PLAYBACK_SCENARIO.HTTP_CLOUD_WIRED_60,
      sessionKey: sessionKey,
      auth: "response",
      format: FORMAT.JSON,
      cdnName: CDN.AKAMAI
    },
    headers: {
      Authorization: authorizationCookie.Authorization
    }
  });
  // console.log(
  //   "_____ r1",
  //   JSON.stringify((r1.data as Response.Playlist), null, 2)
  // );

  const mediaAuth = (r1.data as Response.Playlist).session_info.sessionAttributes.find(sa => sa.attributeName === SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2).attributeValue;
  console.log('_____ mediaAuth', mediaAuth);
  const masterUrl = (r1.data as Response.Playlist).user_verified_event[0].user_verified_content[0].user_verified_media_item[0].url;

  const masterPlaylistContent = await axios.get(masterUrl);

  var parser = new m3u8Parser.Parser();

  parser.push(masterPlaylistContent.data);
  parser.end();

  var parsedManifest = parser.manifest;

  const maxBitrate = _.maxBy(parsedManifest.playlists, (pl: any) => pl.attributes.BANDWIDTH).uri;

  const url = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + maxBitrate

  const streamStart = spawn('streamlink', [
    '-o',
    './video/1.mp4',
    `--http-cookie`,
    "Authorization=" + authorizationCookie.Authorization,
    `--http-cookie`,
    "mediaAuth_v2=" + mediaAuth,
    url,
    'best'
  ]);

  streamStart.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  streamStart.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  streamStart.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });

};

try {
  main();
} catch (e) {
  console.error("______", e);
}
