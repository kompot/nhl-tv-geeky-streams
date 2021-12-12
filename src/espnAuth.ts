import * as fs from "fs";
import * as luxon from "luxon";
import * as querystring from "querystring";
import axiosRestyped from "restyped-axios";
import * as npmWebSocket from "websocket";

import {
  BamAccountGrantInfo,
  BamAccountTokenExchange,
  BamDeviceGrantInfo,
  BamDeviceRefreshTokenExchange,
  BamDeviceTokenExchange,
  BamSdkConfigData,
  BamSdkConfigEndpointData,
  BamSdkTokenExchange,
  BAM_SDK_API_KEY,
  BAM_SDK_CONFIG_URL,
  DeviceType,
  EntitlementPath,
  FastCastHostApi,
  RegisterDisneyActivatedLicensePlateData,
  RegisterDisneyApi,
  RegisterDisneyRefreshedLicensePlateData,
} from "./espnAuthApi";
import {
  timeXhrFetch,
  timeXhrGet,
  timeXhrPost,
  timeXhrRequest,
  timeXhrRequestPost
} from "./geekyStreamsApi";

const registerDisneyApi = axiosRestyped.create<RegisterDisneyApi>({
  baseURL: "https://registerdisney.go.com/jgc/v6/client"
});

export interface IEspnAuthenticationSession {
  requestBamAccessToken(allowInteraction: boolean): Promise<string>;
}

interface EspnPlusAuthenticationSessionData {
  deviceActivation: RegisterDisneyActivatedLicensePlateData | null;
  deviceActivationGrantTime: number;
  refreshedDeviceActivation: RegisterDisneyRefreshedLicensePlateData | null;
  refreshedDeviceActivationGrantTime: number;
  accountTokenExchange: BamAccountTokenExchange | null;
  accountTokenExchangeGrantTime: number;
  idAssertion: BamAccountGrantInfo | null;
  deviceAssertion: BamDeviceGrantInfo | null;
  deviceTokenExchange: BamDeviceTokenExchange | null;
  deviceTokenExchangeGrantTime: number;
  deviceRefreshTokenExchange: BamDeviceRefreshTokenExchange | null;
  deviceRefreshTokenExchangeGrantTime: number;
}

interface RegisterDisneyApiKeyData {
  apikey: string;
  correlationId: string;
};

interface RegisterDisneyLicensePlateData {
  pairingCode: string;
  fastCastHost: string;
  fastCastProfileId: number;
  fastCastTopic: string;
};

interface FastCastWebsocketHostInfo {
  ip: string;
  token: string;
  port: number;
  securePort: number;
};

const sessionFile = "./tmp/session.espn.json";

const getRegisterDisneyApiKey = async (): Promise<RegisterDisneyApiKeyData> => {  
  try {
    const apikeyResponse = await timeXhrRequestPost(registerDisneyApi, {
      url: "/ESPN-OTT.GC.ANDTV-PROD/api-key",
    });

    return {
      apikey: apikeyResponse.headers["api-key"] as string,
      correlationId: apikeyResponse.headers["correlation-id"] as string,
    };
  }
  catch (e: any) {
    if (e?.response?.data?.error)
    {
      console.error(e.response.data.error);
    }
    throw e;
  }
};

const getRegisterDisneyLicensePlate = async (apiKeyData: RegisterDisneyApiKeyData): Promise<RegisterDisneyLicensePlateData> => {  
  try {
    const licensePlateResponse = await timeXhrRequestPost(registerDisneyApi, {
      url: "/ESPN-OTT.GC.ANDTV-PROD/license-plate",
      data: {
        content: {
          "correlation-id": apiKeyData.correlationId,
          deviceType: DeviceType.ANDTV,
          entitlementPath: EntitlementPath.Login,
          entitlements: [],
        },
        ttl: 0,
      },
      headers: {
        Authorization: "APIKEY " + apiKeyData.apikey,
      },
    });

    return licensePlateResponse.data.data;
  }
  catch (e: any) {
    if (e?.response?.data?.error)
    {
      console.error(e.response.data.error);
    }
    throw e;
  }
};

const activateRegisterDisneyLicensePlate = async (licensePlateData: RegisterDisneyLicensePlateData, fastCastData: FastCastWebsocketHostInfo): Promise<RegisterDisneyActivatedLicensePlateData> => {  
  return new Promise((resolve, reject) => {
    try {
      console.log(`In order to login, navigate to https://espn.com/activate and enter the code '${licensePlateData.pairingCode}'`);

      const fastcastWebsocket = new npmWebSocket.w3cwebsocket(`wss://${fastCastData.ip}:${fastCastData.securePort}/FastcastService/pubsub/profiles/${licensePlateData.fastCastProfileId}?TrafficManager-Token=${encodeURIComponent(fastCastData.token)}`);
  
      fastcastWebsocket.onmessage = (ev: npmWebSocket.IMessageEvent): void => {
        const evData = JSON.parse(ev.data as string);
        switch (evData.op as string) {
          case "C": {
            const resp = {
              op: "S",
              sid: evData.sid,
              tc: licensePlateData.fastCastTopic,
              rc: 200,
            };
            fastcastWebsocket.send(JSON.stringify(resp));
            break;
          }
          case "P": {
            const result: RegisterDisneyActivatedLicensePlateData = JSON.parse(evData.pl);
            resolve(result);
            fastcastWebsocket.close();
            break;
          }
        }
      };

      fastcastWebsocket.onerror = (ev: Error): any => {
        console.error(ev);
        reject(ev);
      };

      fastcastWebsocket.onopen = (): void => {
        const message = {
          op: "C",
        };
        fastcastWebsocket.send(JSON.stringify(message));
      };
    }
    catch (e: any) {
      if (e?.response?.data?.error)
      {
        console.error(e.response.data.error);
      }
      
      reject(e);
    }
  });
};

const getFastCastWebsocketInfo = async (licensePlateData: RegisterDisneyLicensePlateData): Promise<FastCastWebsocketHostInfo> => {  
  try {
    const fastCastApi = axiosRestyped.create<FastCastHostApi>({
      baseURL: licensePlateData.fastCastHost
    });
    const infoResponse = await timeXhrRequest(fastCastApi, {
      url: "/public/websockethost",
    });
    return infoResponse.data;
  }
  catch (e: any) {
    if (e?.response?.data?.error) {
      console.error(e.response.data.error);
    }

    throw e;
  }
};

const refreshRegisterDisney = async (deviceActivation: RegisterDisneyActivatedLicensePlateData): Promise<RegisterDisneyRefreshedLicensePlateData> => {
  try {
    const refreshAuthResponse = await timeXhrRequestPost(registerDisneyApi, {
      url: "/ESPN-OTT.GC.ANDTV-PROD/guest/refresh-auth",
      data: {
        refreshToken: deviceActivation.refresh_token,
      },
    });

    return refreshAuthResponse.data;
  }
  catch (e: any) {
    if (e?.response?.data?.error)
    {
      console.error(e.response.data.error);
    }
    throw e;
  }
}

const getBamSdkConfig = async (): Promise<BamSdkConfigData> => {
  try {
    const resp = await timeXhrFetch(BAM_SDK_CONFIG_URL);
    return resp.data as BamSdkConfigData;
  }
  catch (e: any) {
    if (e?.response?.data?.error) {
      console.error(e.response.data.error);
    }

    throw e;
  }
}

const sendBamSdkRequest = async <T>(
  endpoint: BamSdkConfigEndpointData,
  accessToken: string = '',
  body: any = null
  ): Promise<T> => {

  try {
    const headers: { [key: string]: string } = {};

    for (const k in endpoint.headers) {
      const v = endpoint.headers[k]
                        .replace("{apiKey}", BAM_SDK_API_KEY)
                        .replace("{accessToken}", accessToken);

      headers[k] = v;
    }

    const bamSdkEndpoint = axiosRestyped.create({
      baseURL: endpoint.href
    });

    let data: T;
    const config = { headers };

    if (endpoint.method === "POST" && endpoint.headers["Content-Type"] === "application/x-www-form-urlencoded") {
      const urlBody = querystring.stringify(body);
      const response = await timeXhrPost(bamSdkEndpoint, "", urlBody, config);
      data = response.data as T;
    } else if (endpoint.method === "POST") {
      const response = await timeXhrPost(bamSdkEndpoint, "", body, config);
      data = response.data as T;
    } else {
      const response = await timeXhrGet(bamSdkEndpoint, "", config);
      data = response.data as T;
    }

    return data;
  } catch (e: any) {
    if (e?.response?.data?.error) {
      console.error(e.response.data.error);
    }

    throw e;
  }
}

const createBamTokenExchange = async <T extends BamSdkTokenExchange>(bamSdkConfig: BamSdkConfigData, body: any): Promise<T> => {
  const endpoint = bamSdkConfig.services.token.client.endpoints.exchange;
  return sendBamSdkRequest<T>(endpoint, '', body);
}

const createDeviceGrant = async (bamSdkConfig: BamSdkConfigData): Promise<BamDeviceGrantInfo> => {
  const endpoint = bamSdkConfig.services.device.client.endpoints.createDeviceGrant;
  return sendBamSdkRequest(endpoint, '', {
    deviceFamily: 'browser',
    applicationRuntime: 'chrome',
    deviceProfile: 'linux',
    attributes: {},
  });
};

const createDeviceTokenExchange = async (bamSdkConfig: BamSdkConfigData, deviceGrant: BamDeviceGrantInfo): Promise<BamDeviceTokenExchange> => {
  return createBamTokenExchange(bamSdkConfig, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    latitude: 0,
    longitude: 0,
    platform: 'browser',
    setCookie: false,
    subject_token: deviceGrant.assertion,
    subject_token_type: "urn:bamtech:params:oauth:token-type:device",
  });
};

const createDeviceRefreshTokenExchange = async (bamSdkConfig: BamSdkConfigData, deviceTokenExchange: BamDeviceTokenExchange): Promise<BamDeviceRefreshTokenExchange> => {
  return createBamTokenExchange(bamSdkConfig, {
    grant_type: 'refresh_token',
    latitude: 0,
    longitude: 0,
    platform: 'browser',
    setCookie: false,
    refresh_token: deviceTokenExchange.refresh_token,
  });
};

const createAccountGrant = async (bamSdkConfig: BamSdkConfigData, deviceRefreshTokenExchange: BamDeviceRefreshTokenExchange, deviceActivation: RegisterDisneyActivatedLicensePlateData): Promise<BamAccountGrantInfo> => {
  const endpoint = bamSdkConfig.services.account.client.endpoints.createAccountGrant;
  return sendBamSdkRequest(endpoint, deviceRefreshTokenExchange.access_token, {
    id_token: deviceActivation.id_token,
  });
};

const createAccountTokenExchange = async (bamSdkConfig: BamSdkConfigData, accountGrant: BamAccountGrantInfo): Promise<BamAccountTokenExchange> => {
  return createBamTokenExchange(bamSdkConfig, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    latitude: 0,
    longitude: 0,
    platform: 'browser',
    setCookie: false,
    subject_token: accountGrant.assertion,
    subject_token_type: "urn:bamtech:params:oauth:token-type:account",
  });
};

export const createEspnAuthSession = (): IEspnAuthenticationSession => {
  let prevSessionData: string | undefined;

  try {
    prevSessionData = fs.readFileSync(sessionFile).toString();
  } catch {}

  const authSession: EspnPlusAuthenticationSessionData | null = prevSessionData ? JSON.parse(prevSessionData) : null;

  return new EspnAuthenticationSession(authSession);
};

const parseJwt = (token: string): any => {
  const firstDot = token.indexOf('.');
  const lastDot = token.lastIndexOf('.');
  const base64Url = token.substring(firstDot + 1, lastDot);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const fromBase64 = Buffer.from(base64, 'base64').toString();
  var jsonPayload = decodeURIComponent(fromBase64.split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return JSON.parse(jsonPayload);
};

const getRemainingTtl = (grantTime: number, ttl: number): number => {
  const elapsed = luxon.DateTime.local()
                                .diff(luxon.DateTime.fromMillis(grantTime))
                                .as("seconds");
  return ttl - elapsed;
}

class EspnPlusAuthenticationToken {
  private readonly jwtPayload: any;

  constructor(jwtString: string) {
    this.jwtPayload = parseJwt(jwtString);
  }
  
  isExpired(gracePeriodSeconds: number = 0): boolean {
    return this.jwtPayload.exp < (new Date().getTime() + gracePeriodSeconds);
  }
}

class EspnPlusAuthenticationTokenExchange {
  private readonly tokenExchange: BamSdkTokenExchange;
  private readonly grantTime: number;

  constructor(tokenExchange: BamSdkTokenExchange, grantTime: number) {
    this.tokenExchange = tokenExchange;
    this.grantTime = grantTime;
  }
  
  isExpired(gracePeriodSeconds: number = 0): boolean {
    const remainingTtl = getRemainingTtl(this.grantTime, this.tokenExchange.expires_in) - gracePeriodSeconds;
    return remainingTtl < 1;
  }
}

class EspnPlusAuthenticationSession {
  readonly sessionData: EspnPlusAuthenticationSessionData;
  private deviceAssertionJwt: EspnPlusAuthenticationToken | undefined;
  private deviceTokenExchange: EspnPlusAuthenticationTokenExchange | undefined;
  private deviceRefreshTokenExchange: EspnPlusAuthenticationTokenExchange | undefined;
  private idJwt: EspnPlusAuthenticationToken | undefined;
  private idAssertionJwt: EspnPlusAuthenticationToken | undefined;
  private accountTokenExchange: EspnPlusAuthenticationTokenExchange | undefined;

  constructor(sessionData: EspnPlusAuthenticationSessionData | null) {
    this.sessionData = sessionData ?? {
      deviceActivation: null,
      deviceActivationGrantTime: -1,
      refreshedDeviceActivation: null,
      refreshedDeviceActivationGrantTime: -1,
      accountTokenExchange: null,
      accountTokenExchangeGrantTime: -1,
      idAssertion: null,
      deviceAssertion: null,
      deviceTokenExchange: null,
      deviceTokenExchangeGrantTime: -1,
      deviceRefreshTokenExchange: null,
      deviceRefreshTokenExchangeGrantTime: -1,
    };

    this.loadTokens();
  }

  loadTokens() {
    let idJwt: EspnPlusAuthenticationToken | undefined;
    let accountTokenExchange: EspnPlusAuthenticationTokenExchange | undefined;
    let idAssertionJwt: EspnPlusAuthenticationToken | undefined;
    let deviceAssertionJwt: EspnPlusAuthenticationToken | undefined;
    let deviceTokenExchange: EspnPlusAuthenticationTokenExchange | undefined;
    let deviceRefreshTokenExchange: EspnPlusAuthenticationTokenExchange | undefined;

    if (this.sessionData.deviceActivation?.id_token) {
      idJwt = new EspnPlusAuthenticationToken(this.sessionData.deviceActivation.id_token);
    }

    if (this.sessionData.accountTokenExchange) {
      accountTokenExchange = new EspnPlusAuthenticationTokenExchange(this.sessionData.accountTokenExchange, this.sessionData.accountTokenExchangeGrantTime);
    }

    if (this.sessionData.idAssertion) {
      idAssertionJwt = new EspnPlusAuthenticationToken(this.sessionData.idAssertion.assertion);
    }

    if (this.sessionData.deviceAssertion) {
      deviceAssertionJwt = new EspnPlusAuthenticationToken(this.sessionData.deviceAssertion.assertion);
    }

    if (this.sessionData.deviceTokenExchange) {
      deviceTokenExchange = new EspnPlusAuthenticationTokenExchange(this.sessionData.deviceTokenExchange, this.sessionData.deviceTokenExchangeGrantTime);
    }

    if (this.sessionData.deviceRefreshTokenExchange) {
      deviceRefreshTokenExchange = new EspnPlusAuthenticationTokenExchange(this.sessionData.deviceRefreshTokenExchange, this.sessionData.deviceRefreshTokenExchangeGrantTime);
    }

    this.idJwt = idJwt;
    this.accountTokenExchange = accountTokenExchange;
    this.idAssertionJwt = idAssertionJwt;
    this.deviceAssertionJwt = deviceAssertionJwt;
    this.deviceTokenExchange = deviceTokenExchange;
    this.deviceRefreshTokenExchange = deviceRefreshTokenExchange;
  }

  useNewActivation(activationData: RegisterDisneyActivatedLicensePlateData) {
    this.sessionData.deviceActivation = activationData;
    this.sessionData.deviceActivationGrantTime = new Date().getTime();

    this.persistSessionData();
  }

  useRefreshedDeviceActivation(refreshedDeviceActivation: RegisterDisneyRefreshedLicensePlateData) {
    this.sessionData.deviceActivation!.id_token = refreshedDeviceActivation.data.token.id_token;
    this.sessionData.refreshedDeviceActivation = refreshedDeviceActivation;
    this.sessionData.refreshedDeviceActivationGrantTime = new Date().getTime();

    this.persistSessionData();
  }

  useNewAccountTokenExchange(accountTokenExchange: BamAccountTokenExchange) {
    this.sessionData.accountTokenExchange = accountTokenExchange;
    this.sessionData.accountTokenExchangeGrantTime = new Date().getTime();

    this.persistSessionData();
  }

  useNewIdAssertion(idAssertion: BamAccountGrantInfo) {
    this.sessionData.idAssertion = idAssertion;

    this.persistSessionData();
  }

  useNewDeviceGrant(deviceGrantData: BamDeviceGrantInfo) {
    this.sessionData.deviceAssertion = deviceGrantData;

    this.persistSessionData();
  }

  useNewDeviceTokenExchange(deviceTokenExchange: BamDeviceTokenExchange) {
    this.sessionData.deviceTokenExchange = deviceTokenExchange;
    this.sessionData.deviceTokenExchangeGrantTime = new Date().getTime();

    this.persistSessionData();
  }

  useNewDeviceRefreshTokenExchange(deviceRefreshTokenExchange: BamDeviceRefreshTokenExchange) {
    this.sessionData.deviceRefreshTokenExchange = deviceRefreshTokenExchange;
    this.sessionData.deviceRefreshTokenExchangeGrantTime = new Date().getTime();

    this.persistSessionData();
  }

  persistSessionData() {
    const serializedData = JSON.stringify(this.sessionData, null, 2);
    fs.writeFileSync(sessionFile, serializedData);

    this.loadTokens();
  }

  isAccountTokenExchangeWithinGracePeriod(): boolean {
    const GRACE_TIME_SECONDS = 10800; // 3 hour grace time for token expiration
    return !!this.accountTokenExchange && !this.accountTokenExchange.isExpired(GRACE_TIME_SECONDS);
  }

  isIdAssertionTokenValid(): boolean {
    return !!this.idAssertionJwt && !this.idAssertionJwt.isExpired();    
  }

  isDeviceRefreshTokenExchangeAccessValid(): boolean {
    return !!this.deviceRefreshTokenExchange && !this.deviceRefreshTokenExchange.isExpired();
  }

  isDeviceTokenExchangeRefreshValid(): boolean {
    return !!this.deviceTokenExchange && !this.deviceTokenExchange.isExpired();
  }

  isDeviceAssertionTokenValid(): boolean {
    return !!this.deviceAssertionJwt && !this.deviceAssertionJwt.isExpired(); 
  }

  isIdTokenValid(): boolean {
    return !!this.idJwt && !this.idJwt.isExpired();
  }

  isRefreshTokenValid(): boolean {
    if (!this.sessionData.deviceActivation?.refresh_token ||
        this.sessionData.deviceActivation.refresh_ttl <= 0 ||
        this.sessionData.deviceActivationGrantTime <= 0) {
      return false;
    }

    const remainingTtl = getRemainingTtl(this.sessionData.deviceActivationGrantTime, this.sessionData.deviceActivation.refresh_ttl);
    return remainingTtl > 0;
  }
}

class EspnAuthenticationSession implements IEspnAuthenticationSession {
  private readonly espnPlusSession: EspnPlusAuthenticationSession;
  private bamSdkConfig: BamSdkConfigData | undefined;

  constructor(sessionData: EspnPlusAuthenticationSessionData | null) {
    this.espnPlusSession = new EspnPlusAuthenticationSession(sessionData);
  }

  async registerWithEspnPlus(): Promise<boolean> {
    try {
      const apiKeyData = await getRegisterDisneyApiKey();
      const licensePlateData = await getRegisterDisneyLicensePlate(apiKeyData);
      const fastCastData = await getFastCastWebsocketInfo(licensePlateData);
      const activationData = await activateRegisterDisneyLicensePlate(licensePlateData, fastCastData);

      this.espnPlusSession.useNewActivation(activationData);

      return true;
    } catch {
      return false;
    }
  }

  canAccessEspnPlus(): boolean {
    return this.hasValidBamAccountAccessToken() ||
           this.hasValidLoginIdToken() ||
           this.hasValidDisneyRefreshToken();
  }

  async ensureEspnPlusAuthentication(allowInteraction: boolean): Promise<boolean> {
    if (!allowInteraction && !this.hasValidDisneyRefreshToken()) {
      throw new Error('ESPN+ authentication required');
    }

    return this.ensureBamAccountToken();
  }

  async requestBamAccessToken(allowInteraction: boolean): Promise<string> {
    if (!(await this.ensureEspnPlusAuthentication(allowInteraction))) {
      throw new Error('Failed to authenticate to ESPN+');
    }

    return this.espnPlusSession.sessionData!.accountTokenExchange!.access_token;
  }

  async ensureValidLoginIdToken(): Promise<boolean> {
    try {
      if (!this.hasValidLoginIdToken()) {
        if (!this.hasValidDisneyRefreshToken()) {
          if (!(await this.registerWithEspnPlus())) {
            console.error("registerWithEspnPlus failed");
            return false;
          }
        }

        const refreshedDeviceActivation = await refreshRegisterDisney(this.espnPlusSession.sessionData.deviceActivation!);
        this.espnPlusSession.useRefreshedDeviceActivation(refreshedDeviceActivation);
      }

      return true;
    } catch {
      return false;
    }
  }

  async ensureBamAccountToken(): Promise<boolean> {
    try {
      if (!this.hasValidBamAccountAccessToken()) {
        if (!(await this.ensureBamIdAssertionToken())) {
          console.error("ensureBamIdAssertionToken failed");
          return false;
        }

        if (!(await this.ensureBamSdkConfigAvailable()))
        {
          console.error("ensureBamSdkConfigAvailable failed");
          return false;
        }

        const accountTokenExchange = await createAccountTokenExchange(this.bamSdkConfig!, this.espnPlusSession.sessionData.idAssertion!);
        this.espnPlusSession.useNewAccountTokenExchange(accountTokenExchange);
      }

      return true;
    } catch {
      return false;
    }
  }

  async ensureBamIdAssertionToken(): Promise<boolean> {
    try {
      if (!this.espnPlusSession.isIdAssertionTokenValid()) {
        if (!(await this.ensureValidLoginIdToken())) {
          console.error("ensureValidLoginIdToken failed");
          return false;
        }

        if (!(await this.ensureBamDeviceRefreshToken())) {
          console.error("ensureBamDeviceRefreshToken failed");
          return false;
        }

        if (!(await this.ensureBamSdkConfigAvailable()))
        {
          console.error("ensureBamSdkConfigAvailable failed");
          return false;
        }

        const idAssertion = await createAccountGrant(this.bamSdkConfig!, this.espnPlusSession.sessionData.deviceRefreshTokenExchange!, this.espnPlusSession.sessionData.deviceActivation!);
        this.espnPlusSession.useNewIdAssertion(idAssertion);
      }

      return true;
    } catch {
      return false;
    }
  }

  async ensureBamDeviceRefreshToken(): Promise<boolean> {
    try {
      if (!this.espnPlusSession.isDeviceRefreshTokenExchangeAccessValid()) {
        if (!(await this.ensureBamDeviceToken())) {
          console.error("ensureBamDeviceToken failed");
          return false;
        }

        if (!(await this.ensureBamSdkConfigAvailable()))
        {
          console.error("ensureBamSdkConfigAvailable failed");
          return false;
        }

        const deviceRefreshTokenExchange = await createDeviceRefreshTokenExchange(this.bamSdkConfig!, this.espnPlusSession.sessionData.deviceTokenExchange!);
        this.espnPlusSession.useNewDeviceRefreshTokenExchange(deviceRefreshTokenExchange);
      }

      return true;
    } catch {
      return false;
    }
  }

  async ensureBamDeviceToken(): Promise<boolean> {
    try {
      if (!this.espnPlusSession.isDeviceTokenExchangeRefreshValid()) {
        if (!(await this.ensureBamDeviceAssertionToken())) {
          console.error("ensureBamDeviceAssertionToken failed");
          return false;
        }

        if (!(await this.ensureBamSdkConfigAvailable()))
        {
          console.error("ensureBamSdkConfigAvailable failed");
          return false;
        }
        
        const deviceTokenExchange = await createDeviceTokenExchange(this.bamSdkConfig!, this.espnPlusSession.sessionData.deviceAssertion!);
        this.espnPlusSession.useNewDeviceTokenExchange(deviceTokenExchange);
      }

      return true;
    } catch (e: any) {
      console.log(e);
      return false;
    }
  }

  async ensureBamDeviceAssertionToken(): Promise<boolean> {
    try {
      if (!this.espnPlusSession.isDeviceAssertionTokenValid()) {
        if (!(await this.ensureBamSdkConfigAvailable()))
        {
          console.error("ensureBamSdkConfigAvailable failed");
          return false;
        }
        
        const deviceGrantData = await createDeviceGrant(this.bamSdkConfig!);

        this.espnPlusSession.useNewDeviceGrant(deviceGrantData);
      }

      return true;
    } catch {
      return false;
    }
  }

  async ensureBamSdkConfigAvailable(): Promise<boolean> {
    try {
      if (!this.bamSdkConfig) {
        this.bamSdkConfig = await getBamSdkConfig();
      }

      return true;
    } catch {
      return false;
    }
  }

  hasValidBamAccountAccessToken(): boolean {
    return this.espnPlusSession.isAccountTokenExchangeWithinGracePeriod();
  }

  hasValidLoginIdToken(): boolean {
    return this.espnPlusSession.isIdTokenValid();
  }

  hasValidDisneyRefreshToken(): boolean {
    return this.espnPlusSession.isRefreshTokenValid();
  }
}