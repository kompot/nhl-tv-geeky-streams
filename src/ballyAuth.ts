import { randomUUID } from "crypto";
import * as fs from "fs";
import * as luxon from "luxon";
import axiosRestyped from "restyped-axios";
import { parseStringPromise } from "xml2js";

import {
  BallyAuthApi,
  BallyDipsApi,
  RegistrationActivationResponse,
} from "./ballyAuthApi";
import {
  timeXhrFetch,
  timeXhrRequestPost,
} from "./geekyStreamsApi"

const ballyAuthApi = axiosRestyped.create<BallyAuthApi>({
  baseURL: "https://www.ballysports.deltatre.digital/api/v2/authorization"
});
const ballyDipsApi = axiosRestyped.create<BallyDipsApi>({
  baseURL: "https://www.ballysports.deltatre.digital/dips"
});

export interface BallyStreamAuthSession {
  streamUrl: string;
  streamAuth: string;
}

export interface IBallyAuthenticationSession {
  requestStreamAccessToken(allowInteraction: boolean, streamId: string): Promise<BallyStreamAuthSession>;
}

const sessionFile = "./tmp/session.bally.json";

const generateDeviceId = (): string => {
  return randomUUID().replace("-", "").substring(16);
};

const registerBallyDevice = async (): Promise<RegistrationActivationResponse> => {
  const deviceId = generateDeviceId();
  const codeResponse = await timeXhrRequestPost(ballyAuthApi, {
    url: "/adobe/device/code",
    data: {
      id: deviceId,
      type: "tv_android",
    },
  });
  const registrationCode = codeResponse.data.code;

  console.log(`In order to login, navigate to https://www.ballysports.com/activate and enter the code '${registrationCode}'`);

  while (true) {
    try {
      const registrationResponse = await timeXhrRequestPost(ballyAuthApi, {
        url: "/adobe/device",
        data: {
          code: registrationCode,
          id: deviceId,
        },
      });

      return registrationResponse.data[0];
    } catch (e: any) {
      if (e.response?.data?.code !== 3) {
        console.log(e);
        throw e;
      }
      // else still waiting for user to activate
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

const getBallyVideoDataUrl = async (streamId: string): Promise<string> => {
  const settingsXmlResponse = await timeXhrFetch("https://diva.d3-sinc.com/assets/diva/settings/tv_android/default.xml");
  const settingsJson = await parseStringPromise(settingsXmlResponse.data);
  
  const videoDataParameterObject = settingsJson.settings.videoData.find((x: any) => x.parameter);
  const videoDataPathParameter = videoDataParameterObject?.parameter.find((x: any) => x.$.name === "videoDataPath");
  if (!videoDataPathParameter) {
    throw new Error("invalid Bally device settings");
  }

  const videoDataPathTemplate: string = videoDataPathParameter.$.value;
  let videoDataUrl = videoDataPathTemplate.replace("{V.ID}", streamId);
  
  const pathOverrideParameterObject = settingsJson.settings.pathResolverOverrides.find((x: any) => x.parameter);
  if (pathOverrideParameterObject) {
    for (const pathOverrideParameter of pathOverrideParameterObject.parameter) {
      videoDataUrl = videoDataUrl.replace(`{n:${pathOverrideParameter.$.name}}`, pathOverrideParameter.$.value);    
    }
  }

  return videoDataUrl;
}

export const createBallyAuthSession = (): IBallyAuthenticationSession => {
  let prevSessionData: string | undefined;

  try {
    prevSessionData = fs.readFileSync(sessionFile).toString();
  } catch {}

  const authSession: BallyAuthenticationSessionData | null = prevSessionData ? JSON.parse(prevSessionData) : null;

  return new BallyAuthenticationSession(authSession);
};

const isTokenExpirationWithinGracePeriod = (tokenExpiration: Date): boolean => {
  const GRACE_TIME_SECONDS = 10800; // 3 hour grace time for token expiration
  return !isTokenExpired(tokenExpiration, GRACE_TIME_SECONDS);
};

const isTokenExpired = (tokenExpiration: Date, gracePeriodSeconds: number = 0): boolean => {
  return tokenExpiration.getTime() < (new Date().getTime() + gracePeriodSeconds);
}

interface BallyAuthenticationSessionData {
  expirationDate: string;
  value: string;
}

class BallyAuthenticationSession implements IBallyAuthenticationSession {
  private sessionData: BallyAuthenticationSessionData;
  private loginExpirationDate: Date | null;

  constructor(sessionData: BallyAuthenticationSessionData | null) {
    this.loginExpirationDate = sessionData?.expirationDate ? new Date(sessionData.expirationDate) : null;
    this.sessionData = sessionData ?? {
      expirationDate: "",
      value: "",
    };
  }

  persistSessionData(activationData: RegistrationActivationResponse) {
    this.sessionData = activationData;
    const serializedData = JSON.stringify(this.sessionData, null, 2);
    fs.writeFileSync(sessionFile, serializedData);

    this.loginExpirationDate = new Date(this.sessionData.expirationDate);
  }

  async requestStreamAccessToken(allowInteraction: boolean, streamId: string): Promise<BallyStreamAuthSession> {
    if (!(await this.ensureAuthentication(allowInteraction))) {
      throw new Error('Failed to authenticate to Bally Sports');
    }

    const videoDataUrl = await getBallyVideoDataUrl(streamId);
    const videoDataXmlResponse = await timeXhrFetch(videoDataUrl);
    const videoDataJson = await parseStringPromise(videoDataXmlResponse.data);
    const videoSources = videoDataJson.video.videoSources[0];
    const formatType = "DASH";
    const hlsVideoSource = videoSources?.videoSource.find((x: any) => x.$.format === formatType);
    if (!hlsVideoSource) {
      throw new Error("No supported stream types");
    }

    const drmType = "widevine";
    const drmConfig = hlsVideoSource.drm[0][drmType];
    if (!drmConfig) {
      throw new Error("Unexpected DRM type");
    }

    const tokenizeParams = {
      AssetState: videoDataJson.video.assetState[0],
      AuthType: drmConfig[0].authType[0],
      Challenge: randomUUID(),//???
      ContentKeyData: drmConfig[0].contentKeyData[0],
      DRMType: drmType,
      Other: `${randomUUID()}|tv_android|platform%3Dtv_android|0|`,//???
      PlayerType: "Android",
      Signature: "",//???
      Type: 1,//???
      User: this.sessionData.value,
      VideoId: streamId,
      VideoKind: "",
      VideoSource: hlsVideoSource.uri[0],
      VideoSourceFormat: hlsVideoSource.$.format,
      VideoSourceName: hlsVideoSource.$.name,
    };

    /*try {
      const tokenizeResponse = await timeXhrRequestPost(ballyDipsApi, {
        url: "/playback/tokenize",
        data: tokenizeParams,
      });
      console.log(JSON.stringify(tokenizeResponse.data, null, 2));
      return tokenizeResponse.data.AuthToken;
    } catch (e: any) {
      if (e.response) {
        console.log(e);
      }

      throw e;
    }*/

    return {
      streamUrl: tokenizeParams.VideoSource,
      streamAuth: this.sessionData.value,
    };
  }

  async ensureAuthentication(allowInteraction: boolean): Promise<boolean> {
    if (this.hasValidAuthenticationToken()) {
      return true;
    }

    if (!allowInteraction) {
      throw new Error('Bally Sports authentication required');
    }

    
    const activationData = await registerBallyDevice();
    this.persistSessionData(activationData);
    return true;
  }

  hasValidAuthenticationToken(): boolean {
    return !!this.sessionData.value && !!this.loginExpirationDate && isTokenExpirationWithinGracePeriod(this.loginExpirationDate);
  }
}