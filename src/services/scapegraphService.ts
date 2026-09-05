
import { ScrapeGraphAI, ScrapeGraphAIClient } from 'scrapegraph-js';
import { Monitor } from './monitor';
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
    },
    UCL: {
        fbref: 'https://fbref.com/en/comps/8/Champions-League-Stats',
        understat: 'https://understat.com/league/Champions_League',
        name: 'Champions League'
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

    /**
     * Resilient extraction that bypasses double-proxying and provides search fallbacks.
     */
    private static async resilientExtract(url: string, prompt: string, searchFallbackQuery?: string): Promise<any> {
        const client = this.getClient();
        
        // Strategy 1: Direct Scrape (let ScrapeGraphAI handle its own proxies)
        try {
            const response = await client.extract({ url, prompt });
            if (response.status === 'success') return response.data?.json;
            if (response.status === 'error' && !response.error?.includes('502')) {
                 throw new Error(response.error);
            }
        } catch (e) {
            console.warn(`[SCAPEGRAPH] Direct extraction failed for ${url}, attempting search fallback...`);
        }

        // Strategy 2: Search Fallback if direct URL failed or was unreliable
        if (searchFallbackQuery) {
            try {
                const searchResponse = await client.extract({
                    url: `https://www.google.com/search?q=${encodeURIComponent(searchFallbackQuery)}`,
                    prompt: `Find the official statistics page for the requested query and extract the data requested: ${prompt}`
                });
                if (searchResponse.status === 'success') return searchResponse.data?.json;
            } catch (e) {
                console.error('[SCAPEGRAPH] Search fallback also failed:', e);
            }
        }

        throw new Error(`Failed to extract data from ${url}`);
    }

    // 1. MATCH INTEL
    static async getMatchIntel(req: IntelRequest): Promise<MatchIntel> {
        const start = Date.now();
        const query = `${req.homeTeam} vs ${req.awayTeam} team news injuries lineups ${req.league}`;
        const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const prompt = `
            Act as a Senior Forensic Football Analyst. Extract current intelligence for the match ${req.homeTeam} vs ${req.awayTeam} in ${req.league}.
            
            MANDATORY DATA POINTS:
            1. INJURIES & SUSPENSIONS: Extract specific player names, their role, their injury status (e.g., 'Doubtful', 'Out'), and the tactical impact of their absence.
            2. TACTICAL INTELLIGENCE: Search for manager press conferences from the last 24-48 hours. Extract specific tactical shifts mentioned (e.g., "high press", "low block", "rest rotation").
            3. LINEUP FORENSICS: Find predicted XIs from reliable sources.
            4. EXTERNAL VARIABLES: Extract local weather forecasts for the match time and any mentioned "betting steam" or sharp moves in the market.

            Return JSON structure:
            {
                "injuries": [{"team": "string", "player": "string", "status": "string", "impact": "string"}],
                "tacticalNews": ["string"],
                "lineupRumors": [{"team": "string", "predictedLineup": ["string"]}],
                "weatherImpact": "string",
                "marketSentiment": "string"
            }
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt);
            const duration = Date.now() - start;
            Monitor.recordScrape('Google Search (Intel)', 'success', duration);
            return (data || {}) as unknown as MatchIntel;
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('Google Search (Intel)', 'failed', duration);
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
        const start = Date.now();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const seasonLabel = season || '2024-2025';
        const targetUrl = `${config.fbref}/schedule/${seasonLabel.replace('-', '-')}-scores-and-Fixtures`;
        const prompt = `
            Extract ALL match results from the historical schedule page.
            DATA REQUIREMENTS:
            - date (YYYY-MM-DD)
            - homeTeam (canonical name)
            - awayTeam (canonical name)
            - homeGoals (int)
            - awayGoals (int)
            - homeXG (float, extract precisely if present)
            - awayXG (float, extract precisely if present)

            Return as JSON array:
            [{"date": "YYYY-MM-DD", "homeTeam": "string", "awayTeam": "string", "homeGoals": 0, "awayGoals": 0, "homeXG": 0.0, "awayXG": 0.0}]
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt);
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Historical)', 'success', duration);
            const raw = (data || []) as any[];
            return raw.map(m => ({
                date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
                homeGoals: parseInt(m.homeGoals) || 0, awayGoals: parseInt(m.awayGoals) || 0,
                homeXG: parseFloat(m.homeXG) || undefined, awayXG: parseFloat(m.awayXG) || undefined,
                league: config.name, season: seasonLabel
            }));
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Historical)', 'failed', duration);
            console.error('[SCAPEGRAPH] Historical Match Scraping Failed:', error);
            return [];
        }
    }

    // 3. TEAM xG STATS
    static async getTeamXG(teamSlug: string, league: string): Promise<TeamXGData | null> {
        const start = Date.now();
        // Understat usually uses Underscores for team pages
        const normalizedSlug = teamSlug.replace(/[-]/g, '_');
        const targetUrl = `https://understat.com/team/${normalizedSlug}`;
        const prompt = `
            Extract the team's professional expected goals (xG) statistics for the current season.
            REQUIRED FIELDS:
            - team: official name
            - season: current season string
            - xG: Total Expected Goals
            - xGA: Total Expected Goals Against
            - npxG: Non-penalty Expected Goals (CRITICAL)
            - matches: total matches played

            Return as JSON: {"team": "string", "season": "2024-2025", "xG": 0.0, "xGA": 0.0, "npxG": 0.0, "matches": 0}
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt, `${teamSlug} understat stats current season ${league}`);
            const duration = Date.now() - start;
            Monitor.recordScrape('Understat (xG)', 'success', duration);
            return {
                team: data?.team || teamSlug, season: data?.season || '2024-2025',
                xG: parseFloat(data?.xG) || 0, xGA: parseFloat(data?.xGA) || 0,
                npxG: parseFloat(data?.npxG) || 0, matches: parseInt(data?.matches) || 0,
                source: 'understat'
            };
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('Understat (xG)', 'failed', duration);
            console.error(`[SCAPEGRAPH] xG Extraction Failed for ${teamSlug}:`, error);
            return null;
        }
    }

    // 4. LEAGUE STANDINGS WITH xG
    static async getLeagueStandings(league: string): Promise<LeagueStanding[]> {
        const start = Date.now();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const targetUrl = config.fbref;
        const prompt = `
            Extract full league standings including advanced xG metrics.
            REQUIRED PER TEAM: team, played, wins, draws, losses, goalsFor, goalsAgainst, points, xG, xGA.
            
            Return JSON array: [{"team": "string", "played": 0, "wins": 0, "draws": 0, "losses": 0, "goalsFor": 0, "goalsAgainst": 0, "points": 0, "xG": 0.0, "xGA": 0.0}]
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt);
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Standings)', 'success', duration);
            return ((data || []) as any[]).map(t => ({
                team: t.team, played: parseInt(t.played) || 0, wins: parseInt(t.wins) || 0,
                draws: parseInt(t.draws) || 0, losses: parseInt(t.losses) || 0,
                goalsFor: parseInt(t.goalsFor) || 0, goalsAgainst: parseInt(t.goalsAgainst) || 0,
                points: parseInt(t.points) || 0, xG: parseFloat(t.xG) || 0, xGA: parseFloat(t.xGA) || 0
            }));
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Standings)', 'failed', duration);
            console.error('[SCAPEGRAPH] Standings Extraction Failed:', error);
            return [];
        }
    }

    // 5. MARKET ODDS
    static async getMarketOdds(homeTeam: string, awayTeam: string, league: string): Promise<MatchOdds[]> {
        const start = Date.now();
        const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(`${homeTeam} vs ${awayTeam} betting odds goals ${league} pinnacle`)}`;
        const prompt = `
            Extract closing market betting odds for Over/Under goals.
            TARGET MARKETS:
            1. Over 1.5 / Under 1.5
            2. Over 3.5 / Under 3.5
            
            Prioritize Pinnacle, SBOBET, and Market Average if multiple found.
            
            Return JSON array: [{"bookmaker": "string", "over15": 0.0, "under15": 0.0, "over35": 0.0, "under35": 0.0}]
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt);
            const duration = Date.now() - start;
            Monitor.recordScrape('Google Search (Odds)', 'success', duration);
            return ((data || []) as any[]).map(o => ({
                bookmaker: o.bookmaker || 'Unknown',
                over15: parseFloat(o.over15) || 0, under15: parseFloat(o.under15) || 0,
                over35: parseFloat(o.over35) || 0, under35: parseFloat(o.under35) || 0
            }));
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('Google Search (Odds)', 'failed', duration);
            console.error('[SCAPEGRAPH] Odds Extraction Failed:', error);
            return [];
        }
    }

    // 6. UPCOMING FIXTURES
    static async getUpcomingFixtures(league: string): Promise<Fixture[]> {
        const start = Date.now();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        const targetUrl = `${config.fbref}/schedule/Scores-and-Fixtures`;
        const prompt = `
            Extract upcoming fixtures.
            Return JSON array: [{"date": "YYYY-MM-DD", "time": "HH:MM", "homeTeam": "string", "awayTeam": "string"}]
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt);
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Fixtures)', 'success', duration);
            return ((data || []) as any[]).map(f => ({
                date: f.date, time: f.time || 'TBD',
                homeTeam: f.homeTeam, awayTeam: f.awayTeam, league: config.name
            }));
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Fixtures)', 'failed', duration);
            console.error('[SCAPEGRAPH] Fixtures Extraction Failed:', error);
            return [];
        }
    }

    // 7. TEAM FORM (last 5 matches)
    static async getTeamForm(teamSlug: string, league: string): Promise<HistoricalMatch[]> {
        const start = Date.now();
        const config = LEAGUE_URLS[league] || LEAGUE_URLS.EPL;
        // FBRef team pages often use Dashes
        const normalizedSlug = teamSlug.replace(/[_]/g, '-');
        const targetUrl = `https://fbref.com/en/squads/${normalizedSlug}`;
        const prompt = `
            Extract last 5 match results for this team.
            Return JSON array: [{"date": "YYYY-MM-DD", "homeTeam": "string", "awayTeam": "string", "homeGoals": 0, "awayGoals": 0, "homeXG": 0.0, "awayXG": 0.0}]
        `;
        try {
            const data = await this.resilientExtract(targetUrl, prompt, `${teamSlug} fbref fixtures results current season ${league}`);
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Form)', 'success', duration);
            return ((data || []) as any[]).map(m => ({
                date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
                homeGoals: parseInt(m.homeGoals) || 0, awayGoals: parseInt(m.awayGoals) || 0,
                homeXG: parseFloat(m.homeXG) || undefined, awayXG: parseFloat(m.awayXG) || undefined,
                league: config.name, season: '2024-2025'
            }));
        } catch (error) {
            const duration = Date.now() - start;
            Monitor.recordScrape('FBRef (Form)', 'failed', duration);
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
