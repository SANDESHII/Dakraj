
import { ScrapeGraphAI, ScrapeGraphAIClient } from 'scrapegraph-js';

export interface IntelRequest {
    homeTeam: string;
    awayTeam: string;
    league: string;
}

export interface MatchIntel {
    injuries: { team: string; player: string; status: string; impact: string }[];
    tacticalNews: string[];
    lineupRumors: { team: string; predictedLineup: string[] }[];
    weatherImpact: string;
    marketSentiment: string;
}

export class ScapegraphService {
    private static client: ScrapeGraphAIClient | null = null;

    private static getClient(): ScrapeGraphAIClient {
        if (!this.client) {
            const apiKey = process.env.SGAI_API_KEY;
            if (!apiKey) {
                throw new Error('SGAI_API_KEY is not configured');
            }
            this.client = ScrapeGraphAI({ apiKey });
        }
        return this.client;
    }

    static async getMatchIntel(req: IntelRequest): Promise<MatchIntel> {
        const client = this.getClient();
        
        const prompt = `
            Extract current football intelligence for the match ${req.homeTeam} vs ${req.awayTeam} in ${req.league}.
            Focus on:
            1. Injuries and Suspensions for both teams (include player name and status).
            2. Tactical news or manager quotes from the last 48 hours.
            3. Predicted lineups or major lineup rumors.
            4. Local weather impact on match day.
            5. Betting market sentiment or significant steam moves.
            
            Return the data in a structured JSON format matching this schema:
            {
                "injuries": [{"team": "string", "player": "string", "status": "string", "impact": "string"}],
                "tacticalNews": ["string"],
                "lineupRumors": [{"team": "string", "predictedLineup": ["string"]}],
                "weatherImpact": "string",
                "marketSentiment": "string"
            }
        `;

        try {
            // Using extract for structured data
            const response = await client.extract({
                url: `https://www.google.com/search?q=${encodeURIComponent(`${req.homeTeam} vs ${req.awayTeam} team news injuries ${req.league}`)}`,
                prompt: prompt
            });

            if (response.status === 'error') {
                throw new Error(response.error);
            }

            return (response.data?.json || {}) as unknown as MatchIntel;
        } catch (error) {
            console.error('[SCAPEGRAPH] Intel Extraction Failed:', error);
            return {
                injuries: [],
                tacticalNews: ['Intelligence gathering failed. Proceed with baseline quantitative metrics.'],
                lineupRumors: [],
                weatherImpact: 'Unknown',
                marketSentiment: 'Neutral'
            };
        }
    }
}
