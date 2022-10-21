import axiosRestyped from "restyped-axios";
import { idPathVariableInterceptor } from "./geekyStreamsApi";

const NhltvCleengApiBaseUrl = 'https://nhltv.nhl.com/api';

export interface NhltvCleengApi {
  "/v2/events": {
    GET: {
      params: {
        date_time_from: string;
        date_time_to: string;
        sort_direction: string;
      };
      response: NhltvCleengEventsResponse;
    };
  };
  "/v3/cleeng/user": {
    GET: {
      params: {};
      response: {};
    };
  };
  "/v3/contents/:id/check-access": {
    POST: {
      params: {
        id: number;
      };
      body: {
        type: 'nhl';
      };
      response: NhltvCleengCheckFeedAccessResponse;
    };
  };
  "/v3/contents/:id/player-settings": {
    POST: {
      params: {
        id: number;
      };
      body: {};
      response: NhltvCleengFeedPlayerSettingsResponse;
    };
  };
  "/v3/sso/nhl/sign-in": {
    POST: {
      body: {
        email: string;
        password: string;
        code: string | null;
        gCaptchaResponse: string | null;
      };
      response: {};
    }
  };
};

export interface NhltvCleengStreamAccessApi {
  "": {
    POST: {
      body: {};
      response: NhltvCleengStreamAccessResponse;
    }
  };
}

export const nhltvCleengApi = axiosRestyped.create<NhltvCleengApi>({
  baseURL: NhltvCleengApiBaseUrl,
});
nhltvCleengApi.interceptors.request.use(idPathVariableInterceptor);

export enum NHLTV_CLEENG_MEDIA_STATE {
  UPCOMING = "Announced",
  LIVE = "Live",
  DELIVERED = "Delivered",
}

export interface NhltvCleengEventsResponse {
  data: NhltvCleengEvent[];
}

export interface NhltvCleengEvent {
  srMatchId: string;
  startTime: string;
  homeCompetitor: NhltvCleengEventCompetitor;
  awayCompetitor: NhltvCleengEventCompetitor;
  content: NhltvCleengEventContentItem[];
}

export interface NhltvCleengEventCompetitor {
  name: string;
  shortName: string;
}

export interface NhltvCleengEventContentItem {
  id: number;
  editorial: NhltvCleengEventContentItemEditorial;
  status: NhltvCleengEventContentItemStatus;
  contentType: NhltvCleengEventContentItemContentType;
  clientContentMetadata: NhltvCleengEventContentItemClientContentMetadata[];
}

export interface NhltvCleengEventContentItemEditorial {
  translations: { [key: string]: NhltvCleengEventContentItemEditorialTranslation };
}

export interface NhltvCleengEventContentItemEditorialTranslation {
  title: string;
  description: string;
}

export interface NhltvCleengEventContentItemStatus {
  name: NHLTV_CLEENG_MEDIA_STATE;
  isLive: boolean;
  isDelivered: boolean;
}

export interface NhltvCleengEventContentItemContentType {
  id: number;
  name: string;
}

export interface NhltvCleengEventContentItemClientContentMetadata {
  name: string;
}

export interface NhltvCleengCheckFeedAccessResponse {
  data: string | null;
}

export interface NhltvCleengFeedPlayerSettingsResponse {
  streamAccess: string;
}

export interface NhltvCleengStreamAccessResponse {
  data: NhltvCleengStreamAccessResponseData;
  message: string;
}

export interface NhltvCleengStreamAccessResponseData {
  stream: string;
}
  