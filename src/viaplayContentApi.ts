export interface ViaplayContentApi {
  "/sport/ishockey": {
    GET: {
      params: {};
      response: ViaplayContentSportResponse;
    };
  };
};

export interface ViaplayContentSportResponse {
  _embedded: ViaplayContentSportBlocks;
}

export interface ViaplayContentSportBlocks {
  "viaplay:blocks": ViaplayContentBlock[];
}

export interface ViaplayContentBlock {
  type: string;
  _embedded: ViaplayContentSportProducts;
}

export interface ViaplayContentSportProducts {
  "viaplay:products": ViaplayContentProduct[];
}

export interface ViaplayContentProduct {
  type: string;
  content: ViaplayContentProductContent;
  epg: ViaplayContentProductEpg;
  system: ViaplayContentProductSystem;
  hour: string;
}

export interface ViaplayContentProductContent {
  format: ViaplayContentProductContentFormat;
  description: ViaplayContentProductContentDescription;
  title: string;
}

export interface ViaplayContentProductEpg {
  start: string;
  startTime?: string;
  end: string;
  endTime?: string;
}

export interface ViaplayContentProductSystem {
  flags: string[];
}

export interface ViaplayContentProductContentFormat {
  title: string;
}

export interface ViaplayContentProductContentDescription {
  location: ViaplayContentProductContentKeyValue;
}

export interface ViaplayContentProductContentKeyValue {
  key: string;
  value: string;
}