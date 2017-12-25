interface Team {
  id: number,
  name: string,
  abbreviation: string,
  teamName: string,
}

export interface NhlStatsApi {
  '/teams': {
    GET: {
      response: {
        teams: Team[]
      }
    }
  }
}
