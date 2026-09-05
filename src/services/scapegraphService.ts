
import { ScrapeGraphAI, ScrapeGraphAIClient } from 'scrapegraph-js';
import { 
    IntelRequest, 
    MatchIntel, 
    MatchOdds, 
    TeamXGData, 
    ScrapedHistoricalMatch as HistoricalMatch, 
    LeagueStanding, 
    Fixture 
} from '../types';

// ─────────────────────────────────────────────
// League URL Mappings
// ─────────────────────────────────────────────

const LEAGUE_URLS: Record<string, { fbref: string; understat: string; name: string }> = {
    EPL: {
        fbref: 'https://fbref.com/en/comps/9/Premier-League-Stats',
        understat: 'https://understat.com/league/EPL',
        name: 'Premier League'
    },
    LA_LIGA: {
        fbref: 'https://fbref.com/en/comps/12/La-Liga-Stats',
        understat: 'https://understat.com/league/La_liga',
        name: 'La Liga'
    },
    BUNDESLIGA: {
        fbref: 'https://fbref.com/en/comps/20/Bundesliga-Stats',
        understat: 'https://understat.com/league/Bundesliga',
        name: 'Bundesliga'
    },
    SERIE_A: {
        fbref: 'https://fbref.com/en/comps/11/Serie-A-Stats',
        understat: 'https://understat.com/league/Serie_A',
        name: 'Serie A'
    },
    LIGUE_1: {
        fbref: 'https://fbref.com/en/comps/13/Ligue-1-Stats',
        understat: 'https://understat.com/league/Ligue_1',
        name: 'Ligue 1'
    }
};

// ─────────────────────────────────────────────
// Main Service
// ─────────────────────────────────────────────

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

    // 1. MATCH INTEL
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
            const response = await client.extract({
                url: `https://www.google.com/search?q=${encodeURIComponent(`${req.homeTeam} vs ${req.awayTeam} team news injuries ${req.league}`)}`,
                prompt: prompt
            });
            if (response.status === 'error') throw new Error(response.error);
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

    // 2. HISTORICAL MATCH DATA
    static async scrapeHistoricalMatches(league: string, season?: string): Promise<HistoricalMatch[]> {
        const client = this.getClient();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const seasonLabel = season || '2024-2025';
        const prompt = `
            Extract ALL match results from this page.
            For each match return:
            - date (YYYY-MM-DD format)
            - home team name
            - away team name
            - home goals (integer)
            - away goals (integer)
            - home xG (float, if available)
            - away xG (float, if available)
            Return as a JSON array:
            [{"date": "2024-08-17", "homeTeam": "Arsenal", "awayTeam": "Wolves", "homeGoals": 2, "awayGoals": 0, "homeXG": 2.1, "awayXG": 0.4}]
            Include ALL matches on the page. Do not skip any.
        `;
        try {
            const response = await client.extract({
                url: `${config.fbref}/schedule/${seasonLabel.replace('-', '-')}-scores-and-Fixtures`,
                prompt: prompt
            });
            if (response.status === 'error') throw new Error(response.error);
            const raw = (response.data?.json || []) as any[];
            return raw.map(m => ({
                date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
                homeGoals: parseInt(m.homeGoals) || 0, awayGoals: parseInt(m.awayGoals) || 0,
                homeXG: parseFloat(m.homeXG) || undefined, awayXG: parseFloat(m.awayXG) || undefined,
                league: config.name, season: seasonLabel
            }));
        } catch (error) {
            console.error('[SCAPEGRAPH] Historical Match Scraping Failed:', error);
            return [];
        }
    }

    // 3. TEAM xG STATS
    static async getTeamXG(teamSlug: string, _league: string): Promise<TeamXGData | null> {
        const client = this.getClient();
        const prompt = `
            Extract the team's expected goals (xG) statistics for the current season.
            Return: team name, season, xG, xGA, npxG, total matches played.
            Return as JSON: {"team": "string", "season": "2024-2025", "xG": 45.2, "xGA": 32.1, "npxG": 42.8, "matches": 30}
        `;
        try {
            const response = await client.extract({
                url: `https://understat.com/team/${teamSlug}`,
                prompt: prompt
            });
            if (response.status === 'error') throw new Error(response.error);
            const data = response.data?.json as any;
            return {
                team: data?.team || teamSlug, season: data?.season || '2024-2025',
                xG: parseFloat(data?.xG) || 0, xGA: parseFloat(data?.xGA) || 0,
                npxG: parseFloat(data?.npxG) || 0, matches: parseInt(data?.matches) || 0,
                source: 'understat'
            };
        } catch (error) {
            console.error(`[SCAPEGRAPH] xG Extraction Failed for ${teamSlug}:`, error);
            return null;
        }
    }

    // 4. LEAGUE STANDINGS WITH xG
    static async getLeagueStandings(league: string): Promise<LeagueStanding[]> {
        const client = this.getClient();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const prompt = `
            Extract the full league standings table from this page.
            For each team return: team name, matches played, wins, draws, losses, goals for, goals against, points, xG, xGA.
            Return as a JSON array sorted by points descending:
            [{"team": "Arsenal", "played": 30, "wins": 22, "draws": 5, "losses": 3, "goalsFor": 70, "goalsAgainst": 25, "points": 71, "xG": 68.5, "xGA": 27.2}]
        `;
        try {
            const response = await client.extract({ url: config.fbref, prompt: prompt });
            if (response.status === 'error') throw new Error(response.error);
            return ((response.data?.json || []) as any[]).map(t => ({
                team: t.team, played: parseInt(t.played) || 0, wins: parseInt(t.wins) || 0,
                draws: parseInt(t.draws) || 0, losses: parseInt(t.losses) || 0,
                goalsFor: parseInt(t.goalsFor) || 0, goalsAgainst: parseInt(t.goalsAgainst) || 0,
                points: parseInt(t.points) || 0, xG: parseFloat(t.xG) || 0, xGA: parseFloat(t.xGA) || 0
            }));
        } catch (error) {
            console.error('[SCAPEGRAPH] Standings Extraction Failed:', error);
            return [];
        }
    }

    // 5. MARKET ODDS
    static async getMarketOdds(homeTeam: string, awayTeam: string, league: string): Promise<MatchOdds[]> {
        const client = this.getClient();
        const prompt = `
            Extract all bookmaker odds for the match ${homeTeam} vs ${awayTeam}.
            Focus specifically on: Over 1.5 Goals, Under 1.5 Goals, Over 3.5 Goals, Under 3.5 Goals.
            For each bookmaker return: {"bookmaker": "Pinnacle", "over15": 1.35, "under15": 3.20, "over35": 2.80, "under35": 1.45}
            Return as a JSON array. Include ALL bookmakers found.
        `;
        try {
            const response = await client.extract({
                url: `https://www.google.com/search?q=${encodeURIComponent(`${homeTeam} vs ${awayTeam} over under goals odds ${league}`)}`,
                prompt: prompt
            });
            if (response.status === 'error') throw new Error(response.error);
            return ((response.data?.json || []) as any[]).map(o => ({
                bookmaker: o.bookmaker || 'Unknown',
                over15: parseFloat(o.over15) || 0, under15: parseFloat(o.under15) || 0,
                over35: parseFloat(o.over35) || 0, under35: parseFloat(o.under35) || 0
            }));
        } catch (error) {
            console.error('[SCAPEGRAPH] Odds Extraction Failed:', error);
            return [];
        }
    }

    // 6. UPCOMING FIXTURES
    static async getUpcomingFixtures(league: string): Promise<Fixture[]> {
        const client = this.getClient();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const prompt = `
            Extract all upcoming/scheduled matches from this fixtures page.
            For each match return: date (YYYY-MM-DD), time (HH:MM), home team, away team.
            Return as JSON array: [{"date": "2025-03-15", "time": "15:00", "homeTeam": "Arsenal", "awayTeam": "Chelsea"}]
        `;
        try {
            const response = await client.extract({
                url: `${config.fbref}/schedule/Scores-and-Fixtures`,
                prompt: prompt
            });
            if (response.status === 'error') throw new Error(response.error);
            return ((response.data?.json || []) as any[]).map(f => ({
                date: f.date, time: f.time || 'TBD',
                homeTeam: f.homeTeam, awayTeam: f.awayTeam, league: config.name
            }));
        } catch (error) {
            console.error('[SCAPEGRAPH] Fixtures Extraction Failed:', error);
            return [];
        }
    }

    // 7. TEAM FORM (last 5 matches)
    static async getTeamForm(teamSlug: string, league: string): Promise<HistoricalMatch[]> {
        const client = this.getClient();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const prompt = `
            Extract the last 5 match results for this team.
            For each match return: date, home team, away team, home goals, away goals, home xG (if available), away xG (if available).
            Return as JSON array: [{"date": "2025-03-01", "homeTeam": "Arsenal", "awayTeam": "Chelsea", "homeGoals": 2, "awayGoals": 1, "homeXG": 1.8, "awayXG": 0.9}]
        `;
        try {
            const response = await client.extract({
                url: `https://fbref.com/en/squads/${teamSlug}`,
                prompt: prompt
            });
            if (response.status === 'error') throw new Error(response.error);
            return ((response.data?.json || []) as any[]).map(m => ({
                date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
                homeGoals: parseInt(m.homeGoals) || 0, awayGoals: parseInt(m.awayGoals) || 0,
                homeXG: parseFloat(m.homeXG) || undefined, awayXG: parseFloat(m.awayXG) || undefined,
                league: config.name, season: '2024-2025'
            }));
        } catch (error) {
            console.error(`[SCAPEGRAPH] Form Extraction Failed for ${teamSlug}:`, error);
            return [];
        }
    }

    // 8. FULL MATCH CONTEXT (all-in-one parallel)
    static async getFullMatchContext(
        homeTeam: string, awayTeam: string,
        homeSlug: string, awaySlug: string, league: string
    ): Promise<{
        intel: MatchIntel;
        homeXG: TeamXGData | null;
        awayXG: TeamXGData | null;
        odds: MatchOdds[];
        homeForm: HistoricalMatch[];
        awayForm: HistoricalMatch[];
    }> {
        const [intel, homeXG, awayXG, odds, homeForm, awayForm] = await Promise.allSettled([
            this.getMatchIntel({ homeTeam, awayTeam, league }),
            this.getTeamXG(homeSlug, league),
            this.getTeamXG(awaySlug, league),
            this.getMarketOdds(homeTeam, awayTeam, league),
            this.getTeamForm(homeSlug, league),
            this.getTeamForm(awaySlug, league)
        ]);
        return {
            intel: intel.status === 'fulfilled' ? intel.value : {
                injuries: [], tacticalNews: [], lineupRumors: [],
                weatherImpact: 'Unknown', marketSentiment: 'Neutral'
            },
            homeXG: homeXG.status === 'fulfilled' ? homeXG.value : null,
            awayXG: awayXG.status === 'fulfilled' ? awayXG.value : null,
            odds: odds.status === 'fulfilled' ? odds.value : [],
            homeForm: homeForm.status === 'fulfilled' ? homeForm.value : [],
            awayForm: awayForm.status === 'fulfilled' ? awayForm.value : []
        };
    }
}
