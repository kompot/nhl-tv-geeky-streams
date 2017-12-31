export enum USER_IDENTITY_TYPE {
  EmailPassword = "email-password"
}

enum TokenType {
  Bearer = "Bearer"
}

export interface NhlUserApi {
  "/v2/user/identity": {
    POST: {
      body: {
        email: {
          address: string;
        };
        type: USER_IDENTITY_TYPE;
        password: {
          value: string;
        };
      };
      response: {};
    };
  };
  "/oauth/token?grant_type=client_credentials": {
    POST: {
      response: {
        token_type: TokenType;
        access_token: string;
        expires_at: number;
        refresh_token: string;
      };
    };
  };
}
