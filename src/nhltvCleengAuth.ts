import * as cookie from "cookie";
import * as fs from "fs";

import {
  Config,
  timeXhrRequest,
  timeXhrRequestPost,
} from "./geekyStreamsApi";
import {
  nhltvCleengApi,
} from "./nhltvCleengApi";

export interface INhltvCleengAuthenticationSession {
  requestStreamAccessToken(feedId: number): Promise<string>;
}

const sessionFile = "./tmp/session.nhltv.cleeng.json";

export const createNhltvCleengAuthSession = (config: Config): INhltvCleengAuthenticationSession => {
  let prevSessionData: string | undefined;

  try {
    prevSessionData = fs.readFileSync(sessionFile).toString();
  } catch {}

  const authSession: NhltvCleengAuthenticationSessionData | null = prevSessionData ? JSON.parse(prevSessionData) : null;

  return new NhltvCleengAuthenticationSession(config, authSession);
};

interface NhltvCleengAuthenticationSessionData {
  token: string;
}

class NhltvCleengAuthenticationSession implements INhltvCleengAuthenticationSession {
  private config: Config;
  private sessionData: NhltvCleengAuthenticationSessionData;

  constructor(config: Config, sessionData: NhltvCleengAuthenticationSessionData | null) {
    this.config = config;
    this.sessionData = sessionData ?? {
      token: "",
    };
  }

  persistSessionData(sessionData: NhltvCleengAuthenticationSessionData) {
    this.sessionData = sessionData;
    const serializedData = JSON.stringify(this.sessionData, null, 2);
    fs.writeFileSync(sessionFile, serializedData);
  }
  
  async requestStreamAccessToken(feedId: number): Promise<string> {
    if (!(await this.ensureAuthentication())) {
      throw new Error('Failed to authenticate to NHL.TV');
    }
  
    try {
      const accessResult = await timeXhrRequestPost(nhltvCleengApi, {
        url: "/v3/contents/:id/check-access",
        params: {
          id: feedId,
        },
        data: {
          type: "nhl",
        },
        headers: {
          Cookie: `token=${this.sessionData.token}`,
        },
      });

      const accessToken = accessResult.data.data;
      if (!accessToken) {
        throw new Error("NHL.TV Feed access token was not found.");
      }

      return accessToken;
    } catch (e: any) {
      if (e?.response) {
        if (e.response.status === 403) {
          if (e.response.data) {
            console.log(e.response.data);
          }
  
          throw new Error("Forbidden to access the selected feed. This normally means the account doesn't have an active NHL.TV subscription.");
        }

        console.log(e.response);
      }

      throw e;
    }
  }

  async ensureAuthentication(): Promise<boolean> {
    if (await this.hasValidAuthenticationToken()) {
      return true;
    }

    try {
      const loginResult = await timeXhrRequestPost(nhltvCleengApi, {
        url: "/v3/sso/nhl/sign-in",
        data: {
          email: this.config.emailNhltv,
          password: this.config.passwordNhltv,
          code: null,
          gCaptchaResponse: null,
        },
      });
      
      const setCookieValues = loginResult.headers["set-cookie"] ?? [];
      const authorizationCookie = setCookieValues.map(x => cookie.parse(x))
                                                 .find(ck => ck.token);

      if (!authorizationCookie) {
        throw new Error("NHL.TV Authorization cookie was not found.");
      }

      const sessionData: NhltvCleengAuthenticationSessionData = {
        token: authorizationCookie.token,
      };
      this.persistSessionData(sessionData);
    } catch (e: any) {
      if (e.response?.status === 401) {
        throw new Error("Unable to login to nhltv.nhl.com. Username or password incorrect.");
      }
      throw e;
    }

    return true;
  }
  
  async hasValidAuthenticationToken(): Promise<boolean> {
    try {
      const userResult = await timeXhrRequest(nhltvCleengApi, {
        url: "/v3/cleeng/user",
        headers: {
          Cookie: `token=${this.sessionData.token}`,
        },
      });
      
      const setCookieValues = userResult.headers["set-cookie"] ?? [];
      const authorizationCookie = setCookieValues.map(x => cookie.parse(x))
                                                 .find(ck => ck.token);

      if (authorizationCookie) {
        const sessionData: NhltvCleengAuthenticationSessionData = {
          token: authorizationCookie.token,
        };
        this.persistSessionData(sessionData);
      }

      return true;
    } catch (e: any) {
      if (e.response?.status === 401) {
        return false;
      }
      throw e;
    }
  }
}
