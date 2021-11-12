export const BAM_SDK_CONFIG_URL = "https://bam-sdk-configs.bamgrid.com/bam-sdk/v2.0/espn-a9b93989/browser/v3.4/linux/chrome/prod.json";
export const BAM_SDK_API_KEY = "ZXNwbiZicm93c2VyJjEuMC4w.ptUt7QxsteaRruuPmGZFaJByOoqKvDP2a5YkInHrc7c";

export enum DeviceType {
  ANDTV = "ANDTV"
}

export enum EntitlementPath {
  Login = "login"
}

export interface RegisterDisneyApi {
  "/ESPN-OTT.GC.ANDTV-PROD/api-key": {
    POST: {
      body: {};
      response: {};
    };
  };
  "/ESPN-OTT.GC.ANDTV-PROD/license-plate": {
    POST: {
      body: {
        content: {
          //adId: string; // GUID
          "correlation-id": string; // GUID
          //deviceId: string; // GUID
          deviceType: DeviceType;
          entitlementPath: EntitlementPath;
          entitlements: string[];
        };
        ttl: number;
      };
      response: {
        data: {
          pairingCode: string;
          fastCastHost: string;
          fastCastProfileId: number;
          fastCastTopic: string; // GUID
          pairingSessionId?: string;
        };
        error: any;
      };
    };
  };
  "/ESPN-OTT.GC.ANDTV-PROD/guest/refresh-auth": {
    POST: {
      body: {
        refreshToken: string;
      };
      response: {
        data: {
          token: {
            id_token: string;
          };
        };
      };
    };
  };
}

export interface FastCastHostApi {
  "/public/websockethost": {
    GET: {
      response: {        
        ip: string;
        token: string;
        port: number;
        securePort: number;
      };
    };
  };
}

export interface RegisterDisneyActivatedLicensePlateData {
  access_token: string;
  ttl: number;
  refresh_token: string;
  refresh_ttl: number;
  swid: string;
  id_token: string;
}

export interface BamSdkConfigHeadersData {
  [key: string]: string;
}

export interface BamSdkConfigEndpointData {
  headers: BamSdkConfigHeadersData;
  href: string;
  method: string;
  templated: boolean;
  timeout: number;
  ttl: number;
}

export interface BamSdkConfigEndpointsData {
  [key: string]: BamSdkConfigEndpointData;
}

export interface BamSdkConfigClientData {
  endpoints: BamSdkConfigEndpointsData;
}

export interface BamSdkConfigServiceData {
  client: BamSdkConfigClientData;
}

export interface BamSdkConfigServicesData {
  account: BamSdkConfigServiceData;
  device: BamSdkConfigServiceData;
  token: BamSdkConfigServiceData;
}

export interface BamSdkConfigData {
  services: BamSdkConfigServicesData;
}

export interface BamSdkAssertion {
  assertion: string;
}
export interface BamSdkTokenExchange {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}
export interface BamAccountTokenExchange extends BamSdkTokenExchange { }
export interface BamAccountGrantInfo extends BamSdkAssertion { }
export interface BamDeviceGrantInfo extends BamSdkAssertion { }
export interface BamDeviceTokenExchange extends BamSdkTokenExchange { }
export interface BamDeviceRefreshTokenExchange extends BamSdkTokenExchange { }

export interface RegisterDisneyRefreshedLicensePlateData {
  data: {
    token: {
      id_token: string;
    }
  }
}
