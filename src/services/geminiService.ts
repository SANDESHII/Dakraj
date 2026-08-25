import { GoogleGenAI, Type } from "@google/genai";
import { MatchEngine } from "./engine";
import { DataService } from "./dataService";
import { ProfileService } from "./profileService";
import { FootballDataProvider } from "./data/footballDataProvider";
import { RefereeService } from "./refereeService";
import { CacheService } from "./cacheService";
import { AnalysisResult, MatchHistory, LeagueContext, RhoData } from "../types";

const MODEL = 'gemini-3.7-flash', SYSTEM_PROMPT = `Expert Quantitative Football Intelligence Analyst. MISSION: Rigorous Tactical Grounding for Europe's Top 5 Leagues & UCL. 
1. IDENTIFICATION: Identify the Referee and Stadium for the given match using search.
2. OUTLIER JAIL: Discard stats outside reality ranges (npxG/xGA 0.4-3.5). 
3. CHECKSUM: Verify (Season Goals / Matches). 
4. ADVERSARIAL: Compare FBRef vs Understat. Discard if >10% variance. 
5. MARKET SYNC: Sync with Pinnacle/Betfair. 
6. NO NARRATIVE: Atoms only. Output strictly valid JSON.
7. REFEREE IDENTIFICATION: Only identify the Referee Name. Do NOT return or guess statistics (avg cards, penalties, etc.). Our deterministic database will handle the numbers.`;

const AI_SCHEMA = {
    type: Type.OBJECT, properties: {
        groundingConfidence: { type: Type.NUMBER },
        verifiedFacts: { type: Type.OBJECT, properties: {
            matchContext: { type: Type.STRING }, tacticalDrift: { type: Type.STRING }, verifiedNewsSummary: { type: Type.STRING },
            homeSeasonXG: { type: Type.NUMBER }, awaySeasonXG: { type: Type.NUMBER }, homeSeasonXGAs: { type: Type.NUMBER }, awaySeasonXGAs: { type: Type.NUMBER },
            pinnacleOver15: { type: Type.NUMBER }, pinnacleUnder15: { type: Type.NUMBER }, pinnacleUnder35: { type: Type.NUMBER }, pinnacleOver35: { type: Type.NUMBER },
            // Only name is requested to prevent LLM hallucination of statistics
            referee: { type: Type.OBJECT, properties: { name: { type: Type.STRING } } },
            citations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { source: { type: Type.STRING }, url: { type: Type.STRING }, value: { type: Type.NUMBER }, timestamp: { type: Type.STRING } } } },
            varianceAlerts: { type: Type.ARRAY, items: { type: Type.STRING } }
        }},
        styleMetrics: { type: Type.OBJECT, properties: {
            home: { type: Type.OBJECT, properties: { ppda: { type: Type.NUMBER }, possessionFinalThird: { type: Type.NUMBER } } },
            away: { type: Type.OBJECT, properties: { ppda: { type: Type.NUMBER }, possessionFinalThird: { type: Type.NUMBER } } }
        }}, matchSummary: { type: Type.STRING }
    }, required: ["matchSummary", "groundingConfidence"]
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const getFallback = async (req: { homeTeam: string; awayTeam: string; league: string; homeTeamName: string; awayTeamName: string; kickoff?: string }, matches: MatchHistory[], rho: RhoData, bias: Record<string, number> = {}): Promise<AnalysisResult> => {
    const asOf = (req.kickoff && req.kickoff !== 'UPCOMING') ? req.kickoff : undefined;
    return { 
        ...MatchEngine.calculate(
            DataService.standardize({ ...ProfileService.computeBaseline(req.homeTeam, matches, asOf), name: req.homeTeamName, homeAwayBias: bias[req.homeTeam] }), 
            DataService.standardize({ ...ProfileService.computeBaseline(req.awayTeam, matches, asOf), name: req.awayTeamName, homeAwayBias: bias[req.awayTeam] }), 
            { league: req.league }, 
            rho
        ), 
        dataSource: 'FALLBACK_STATIC' 
    };
};

export const performAnalysis = async (raw: { homeTeam: string; awayTeam: string; league: string; kickoff?: string }): Promise<AnalysisResult> => {
    const l = FootballDataProvider.normalizeLeague(raw.league), hM = ProfileService.canonicalize(raw.homeTeam), aM = ProfileService.canonicalize(raw.awayTeam);
    const req = { ...raw, league: l, homeTeam: hM.id, awayTeam: aM.id, homeTeamName: ProfileService.getDisplayName(hM.id), awayTeamName: ProfileService.getDisplayName(aM.id) };
    const key = `${req.homeTeam}-${req.awayTeam}-${req.league}`.toLowerCase();
    
    // Persistent Firestore Cache
    const cached = await CacheService.get(key);
    if (cached) return cached;

    const ctx: LeagueContext = await DataService.getLeagueContext(req.league || 'EPL').catch(() => ({ 
        matches: [], rhoData: { rho: -0.11, sigmaRho: 0.05 }, homeAwayBias: {},
        defensiveRanks: {}, redCardPropensity: {}, clinicalEdge: {}, avgHG: 1.35, avgAG: 1.25, varHG: 1.1, varAG: 1.1,
        audit: { signalIntegrity: '0%', alphaAdjustment: 'None', redCardRegime: 'None', dataReliability: 'Low', sampleSize: 0 }
    }));
    const matches = ctx.matches, rho = ctx.rhoData, bias = ctx.homeAwayBias;

    try {
        const interactionPromise = ai.interactions.create({
            model: MODEL, system_instruction: SYSTEM_PROMPT,
            input: `MATCH: ${req.homeTeamName} vs ${req.awayTeamName} | KICKOFF: ${req.kickoff || 'UPCOMING'} | MANDATE: Identify Referee & Stadium. Fetch hard npxG stats. Sync Market.`,
            tools: [{ type: 'google_search' }], response_format: AI_SCHEMA as any
        });

        const timeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Analysis Timeout: Research phase exceeded 10s limit.')), 10000)
        );

        const interaction = await Promise.race([interactionPromise, timeout]);
        const p = JSON.parse(interaction.output_text || '{}');
        const [hS, aS, ref] = await Promise.all([
            ProfileService.getStyle(req.homeTeam), 
            ProfileService.getStyle(req.awayTeam),
            RefereeService.getRefereeStats(p.verifiedFacts?.referee?.name, req.league)
        ]);

        const asOf = (req.kickoff && req.kickoff !== 'UPCOMING') ? req.kickoff : undefined;
        const res = MatchEngine.calculate(
            DataService.standardize({ ...ProfileService.computeBaseline(req.homeTeam, matches, asOf), name: req.homeTeamName, homeAwayBias: bias[req.homeTeam] }), 
            DataService.standardize({ ...ProfileService.computeBaseline(req.awayTeam, matches, asOf), name: req.awayTeamName, homeAwayBias: bias[req.awayTeam] }), 
            { 
                referee: ref, homeStyle: { ...(hS || {}), ...(p.styleMetrics?.home || {}), teamId: req.homeTeam }, awayStyle: { ...(aS || {}), ...(p.styleMetrics?.away || {}), teamId: req.awayTeam }, league: req.league,
                homeSeasonXG: p.verifiedFacts?.homeSeasonXG, awaySeasonXG: p.verifiedFacts?.awaySeasonXG, homeSeasonXGA: p.verifiedFacts?.homeSeasonXGA, awaySeasonXGA: p.verifiedFacts?.awaySeasonXGA,
                marketOdds: { 
                    pinnacleOver15: p.verifiedFacts?.pinnacleOver15, 
                    pinnacleUnder15: p.verifiedFacts?.pinnacleUnder15,
                    pinnacleUnder35: p.verifiedFacts?.pinnacleUnder35,
                    pinnacleOver35: p.verifiedFacts?.pinnacleOver35
                },
                groundingLog: { citations: p.verifiedFacts?.citations || [], varianceAlerts: p.verifiedFacts?.varianceAlerts || [] }
            }, rho);

        res.summary = p.matchSummary || res.summary; res.surety.groundingCitations = p.verifiedFacts?.citations;
        
        // Save to Persistent Cache
        await CacheService.set(key, res);
        return res;
    } catch (e) { return getFallback(req, matches, rho, bias); }
};



