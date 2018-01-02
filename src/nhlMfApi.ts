import { EpgTitle, Url } from "./nhlStatsApi";

export enum PLAYBACK_SCENARIO {
  HTTP_CLOUD_WIRED_60 = "HTTP_CLOUD_WIRED_60"
}

export enum FORMAT {
  JSON = "json"
}

enum AUTH_STATUS {
  SUCCESS = "SuccessStatus",
  LOGIN_REQUIRED = "LoginRequiredStatus",
  NOT_AUTHORIZED = "NotAuthorizedStatus"
}

enum BLACKOUT_STATUS {
  SUCCESS = "SuccessStatus",
  BLACKED_OUT = "BlackedOutStatus"
}

export enum STATUS_CODE {
  OK = 1,
  MEDIA_NOT_FOUND = -1000,
  INVALID_MEDIA_STATE = -1600,
  INVALID_CREDENTIALS = -3000,
  LOGIN_THROTTLED = -3500,
  SYSTEM_ERROR = -4000
}

export enum CDN {
  AKAMAI = "MED2_AKAMAI_SECURE",
  LEVEL3 = "MED2_LEVEL3_SECURE"
}

export enum SESSION_ATTRIBUTE_NAME {
  MEDIA_AUTH_V2 = "mediaAuth_v2"
}

interface SessionAttribute {
  attributeName: SESSION_ATTRIBUTE_NAME;
  attributeValue: string;
}

enum MEDIA_ITEM_STATE {
  MEDIA_ARCHIVE = "MEDIA_ARCHIVE"
}

enum MEDIA_ITEM_TYPE {
  VIDEO = "video"
}

interface MediaItem {
  state: MEDIA_ITEM_STATE;
  auth_status: AUTH_STATUS;
  type: MEDIA_ITEM_TYPE;
  blackout_status: {
    status: BLACKOUT_STATUS;
  };
  url: Url;
}

interface UserVerifiedEvent {
  user_verified_content: UserVerifiedContent[];
}

interface UserVerifiedContent {
  type: MEDIA_ITEM_TYPE;
  content_id: number;
  user_verified_media_item: MediaItem[];
}

export namespace Response {
  export type Playlist = {
    status_code: STATUS_CODE;
    status_message: string;
    user_verified_event: UserVerifiedEvent[];
    session_info: {
      sessionAttributes: SessionAttribute[];
    };
  };
  export type SessionKey = {
    status_code: STATUS_CODE;
    status_message: string;
    session_key?: string;
    user_verified_event?: any[];
    determined_location?: {
      postal_code: string;
      country_code: string;
    };
  };
}

export const NhlMfApiBaseUrl = "https://mf.svc.nhl.com";

export interface NhlMfApi {
  "/ws/media/mf/v2.4/stream": {
    GET: {
      query:
        | {
            contentId: number;
            playbackScenario: PLAYBACK_SCENARIO;
            sessionKey: string;
            auth: string;
            format: FORMAT;
            cdnName: CDN;
          }
        | {
            eventId: string;
            format: FORMAT;
            subject: EpgTitle;
          };
      response: Response.Playlist | Response.SessionKey;
    };
  };
}
