
export interface BallyAuthApi {
  "/adobe/device/code": {
    POST: {
      body: {
        id: string;
        type: string;
      };
      response: RegistrationCodeResponse;
    };
  };
  "/adobe/device": {
    POST: {
      body: {
        code: string;
        id: string;
      };
      response: RegistrationActivationResponse[];
    };
  };
}

export interface BallyDipsApi {
  "/playback/tokenize": {
    POST: {
      body: {
        ContentKeyData: string;
        User: string;
        VideoId: string;
        DRMType: string;
        PlayerType: string;
        VideoSourceFormat: string;
        VideoSourceName: string;
        VideoKind: string;
        Challenge: string;
        Type: number;
        Signature: string;
        VideoSource: string;
        AssetState: string;
        AuthType: string;
        Other: string;
      };
      response: StreamTokenResponse;
    };
  };
}

export interface RegistrationActivationResponse {
  accountCreated: boolean; //false,
  type: string; //"UserAccount",
  refreshable: boolean; //false,
  expirationDate: string; //"2022-02-21T01:34:41.0042217Z",
  value: string; //"<long token string>",
}

export interface RegistrationPendingResponse {
  code: number;
  message: string;
}

export interface RegistrationCodeResponse {
  code: string;
}

export interface StreamTokenResponse {
  Response: string; //"OK",
  ResponseCode: number; //1,
  Message: string; //"",
  Action: string; //"",
  ContentUrl: string; //"<https url>",
  HeartBeatTime: number; //86400,
  ActionParameters: string; //"",
  AuthToken: string; //"<long token string>",
  LicenseURL: string; //"",
  Signature: string; //"<hex string>"
}