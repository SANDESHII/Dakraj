import { MatchContext } from '../types';

export class MatchContextService {
    static async enrich(league: string): Promise<MatchContext> {
        return {
            league,
            date: new Date().toISOString()
        };
    }
}
