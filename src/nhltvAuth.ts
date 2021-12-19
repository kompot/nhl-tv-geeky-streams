import axiosRestyped from "restyped-axios";
import * as cookie from "cookie";
import * as fs from "fs";
import * as luxon from "luxon";

import { NhlActivationRogersApi, NhlUserApi, USER_IDENTITY_TYPE } from "./nhlUserApi";
import {
  NhlMfApi,
  NhlMfApiBaseUrl,
  FORMAT,
  Response,
  STATUS_CODE,
  SUBJECT,
} from "./nhlMfApi";
import { timeXhrRequest, timeXhrRequestPost } from "./geekyStreamsApi";

const mfApi = axiosRestyped.create<NhlMfApi>({
  baseURL: NhlMfApiBaseUrl
});

// NOTE: This token is from the meta tag "control_plane_client_token" on https://www.nhl.com/login
const CLIENT_TOKEN =
  "d2ViX25obC12MS4wLjA6MmQxZDg0NmVhM2IxOTRhMThlZjQwYWM5ZmJjZTk3ZTM=";

const activationRogersApi = axiosRestyped.create<NhlActivationRogersApi>({
  baseURL: "https://activation-rogers.svc.nhl.com"
});

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

const nhltvSessionFile = "./tmp/session.nhltv.json";
const nhlLiveSessionFile = "./tmp/session.nhllive.json";
const sessionValidInMinutes = 4 * 60;

const getPreviousAuthSession = (sessionFile: string): AuthSession | undefined => {
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

const setNextAuthSession = (sessionFile: string, authSession: AuthSessionDisk) => {
  fs.writeFileSync(sessionFile, JSON.stringify(authSession, null, 2));
};

const requestNhltvLogin = async (accessToken: string, email: string, password: string): Promise<any> => {
  try {
    return await timeXhrRequestPost(
      userApi,
      {
        url: "/v2/user/identity",
        data: {
          email: {
            address: email
          },
          type: USER_IDENTITY_TYPE.EmailPassword,
          password: {
            value: password
          }
        },
        headers: {
          Authorization: accessToken
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
};

const requestNhlLiveLogin = async (accessToken: string, email: string, password: string): Promise<any> => {
  try {
    return await timeXhrRequestPost(
      activationRogersApi,
      {
        url: "/ws/subscription/flow/rogers.login",
        data: {
          rogerCredentials: {
            email,
            password,
          },
        },
        headers: {
          Authorization: accessToken
        },
      }

    );
  } catch (e: any) {
    if (e.response?.status === 401) {
      throw new Error(
        "Unable to login to nhllive.com. Username or password incorrect."
      );
    }
    throw e;
  }
};

export const getAuthSession = async (
  isNhltv: boolean,
  email: string,
  password: string,
  eventId: string
): Promise<AuthSession> => {
  const sessionFile = isNhltv ? nhltvSessionFile : nhlLiveSessionFile;
  const prevAuthData = getPreviousAuthSession(sessionFile);
  if (prevAuthData !== undefined) {
    return Promise.resolve(prevAuthData);
  }

  const { data: { access_token } } = await timeXhrRequestPost(
    userApi,
    {
      url: "/oauth/token?grant_type=client_credentials",
      headers: {
        Authorization: "Basic " + CLIENT_TOKEN
      },
    }
  );
  const r = await (isNhltv ? requestNhltvLogin(access_token, email, password) : requestNhlLiveLogin(access_token, email, password));
  const authorizationCookie = r.headers["set-cookie"]
    .map(cookie.parse)
    .find((ck: any) => ck.Authorization);
  if (!authorizationCookie) {
    throw new Error("Authorization cookie was not found.");
  }

  const authHeader = authorizationCookie.Authorization;

  const r2 = await timeXhrRequest(mfApi, {
    url: "/ws/media/mf/v2.4/stream",
    params: {
      eventId,
      format: FORMAT.JSON,
      subject: isNhltv ? SUBJECT.NHLTV : SUBJECT.NHLLIVE,
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

  setNextAuthSession(sessionFile, {
    authHeader,
    sessionKey,
    timestamp: new Date().getTime()
  });

  return {
    authHeader,
    sessionKey
  };
};
