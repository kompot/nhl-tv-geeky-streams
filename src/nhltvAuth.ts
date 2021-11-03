import axiosRestyped from "restyped-axios";
import * as cookie from "cookie";
import * as fs from "fs";
import * as luxon from "luxon";

import { EpgTitle } from "./nhlStatsApi";
import { NhlUserApi, USER_IDENTITY_TYPE } from "./nhlUserApi";
import {
  NhlMfApi,
  NhlMfApiBaseUrl,
  // PLAYBACK_SCENARIO,
  FORMAT,
  Response,
  STATUS_CODE
  // CDN,
  // SESSION_ATTRIBUTE_NAME
} from "./nhlMfApi";

const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

// NOTE: This token is from the meta tag "control_plane_client_token" on https://www.nhl.com/login
const CLIENT_TOKEN =
  "d2ViX25obC12MS4wLjA6MmQxZDg0NmVhM2IxOTRhMThlZjQwYWM5ZmJjZTk3ZTM=";

const userApi = axiosRestyped.create<NhlUserApi>({
  baseURL: "https://user.svc.nhl.com"
});

export interface AuthSession {
  authHeader: string;
  sessionKey: string;
}

type AuthSessionDisk = AuthSession & {
  timestamp: number;
};

const sessionFile = "./tmp/session.json";
const sessionValidInMinutes = 4 * 60;

const getPreviousAuthSession = (): AuthSession | undefined => {
  if (!fs.existsSync(sessionFile)) {
    return undefined;
  }
  const prevSessionData: AuthSessionDisk = JSON.parse(
    fs.readFileSync(sessionFile).toString()
  );
  const sessionIsValid =
    luxon.DateTime.local()
      .diff(luxon.DateTime.fromMillis(prevSessionData.timestamp))
      .as("minutes") < sessionValidInMinutes;
  if (!sessionIsValid) {
    return undefined;
  }
  return prevSessionData;
};

const setNextAuthSession = (authSession: AuthSessionDisk) => {
  fs.writeFileSync(sessionFile, JSON.stringify(authSession, null, 2));
};

export const getAuthSession = async (
  email: string,
  password: string,
  eventId: string
): Promise<AuthSession> => {
  const prevAuthData = getPreviousAuthSession();
  if (prevAuthData !== undefined) {
    return Promise.resolve(prevAuthData);
  }

  const { data: { access_token } } = await userApi.post(
    "/oauth/token?grant_type=client_credentials",
    null,
    {
      headers: {
        Authorization: "Basic " + CLIENT_TOKEN
      }
    }
  );
  let r;
  try {
    r = await userApi.post(
      "/v2/user/identity",
      {
        email: {
          address: email
        },
        type: USER_IDENTITY_TYPE.EmailPassword,
        password: {
          value: password
        }
      },
      {
        headers: {
          Authorization: access_token
        }
      }
    );
  } catch (e: any) {
    if (e.response?.status === 401) {
      throw new Error(
        "Unable to login to nhl.com. Username or password incorrect."
      );
    }
    throw e;
  }
  const authorizationCookie = r.headers["set-cookie"]
    .map(cookie.parse)
    .find((ck: any) => ck.Authorization);
  if (!authorizationCookie) {
    throw new Error("Authorization cookie was not found.");
  }

  const authHeader = authorizationCookie.Authorization;

  const r2 = await mfApi.request({
    url: "/ws/media/mf/v2.4/stream",
    params: {
      eventId,
      format: FORMAT.JSON,
      subject: EpgTitle.NHLTV
    },
    headers: {
      Authorization: authHeader
    }
  });

  if (r2.data.status_code !== STATUS_CODE.OK) {
    throw new Error(r2.data.status_message);
  }
  // though session key seems to be game bound - in reality it's not (nhl bug?)
  // and we will reuse it so that login attempts are not throttled (and
  // they are throttled heavily)
  const sessionKey = (r2.data as Response.SessionKey).session_key;
  if (!sessionKey) {
    throw new Error("Session key was null.");
  }

  setNextAuthSession({
    authHeader,
    sessionKey,
    timestamp: new Date().getTime()
  });

  return {
    authHeader,
    sessionKey
  };
};
