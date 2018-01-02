import * as inquirer from "inquirer";
import axiosRestyped from "restyped-axios";
import axios from "axios";

import * as m3u8Parser from 'm3u8-parser';
import * as _ from 'lodash';
import { spawn } from 'child_process';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

import { NhlStatsApi, EpgTitle } from "./nhlStatsApi";
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

import { getAuthSession } from './auth';

const statsApi = axiosRestyped.create<NhlStatsApi>({
  baseURL: "https://statsapi.web.nhl.com/api/v1"
});
const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

var config = yaml.safeLoad(fs.readFileSync('./config.yaml'))

const main = async () => {
  const { data: { dates } } = await statsApi
    .request({
      url: "/schedule",
      params: {
        startDate: "2017-12-30",
        endDate: "2018-01-02",
        expand: "schedule.game.content.media.epg"
      }
    });

  const games = _.flatMap(dates, matchDay => matchDay.games);

  const gamesOptions = games.map(game => ({
    value: String(game.gamePk),
    name: game.gameDate + "|" + game.teams.home.team.name + " vs " + game.teams.away.team.name
  }));

  const questionNameGame = 'game';

  const questionsGame: inquirer.Question[] = [
    {
      type: "list",
      name: questionNameGame,
      message:
        "Choose game to watch",
      choices: gamesOptions
    }
  ];

  const gameSelected = await inquirer.prompt(questionsGame);
  const game = games.find(game => String(game.gamePk) === gameSelected[questionNameGame]);

  const feedOptions = game.content.media.epg
    .find(e => e.title === EpgTitle.NHLTV)
    .items.map(epgItem => ({
      value: epgItem.eventId + "|" + epgItem.mediaPlaybackId + "|" + epgItem.mediaFeedType + "|" + epgItem.callLetters,
      name: epgItem.mediaFeedType + ", " + epgItem.callLetters
    }));

  const questionNameFeed = 'feed';

  const questionsFeed: inquirer.Question[] = [
    {
      type: "list",
      name: questionNameFeed,
      message:
        "Choose feed to watch",
      choices: feedOptions
    }
  ];

  const feedSelected = await inquirer.prompt(questionsFeed);

  const [eventId, mediaPlaybackId, mediaFeedType, callLetters] = feedSelected[questionNameFeed].split('|');

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

  const filename = [
    game.gameDate.substr(0, 10),
    game.teams.home.team.name.replace(/\s+/g, '_'),
    'vs',
    game.teams.away.team.name.replace(/\s+/g, '_'),
    '(' + mediaFeedType + (callLetters && '_') + callLetters + ')',
  ].join('_');

  const streamStart = spawn('streamlink', [
    '-o',
    `./video/${filename}.mp4`,
    `--http-cookie`,
    "Authorization=" + auth.authHeader,
    `--http-cookie`,
    SESSION_ATTRIBUTE_NAME.MEDIA_AUTH_V2 + "=" + mediaAuth,
    // '--hls-live-edge',
    // '1000',
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
