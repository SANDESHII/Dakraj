import { GoogleGenAI, Type } from "@google/genai";
import { MatchEngine } from "./engine";
import { DataService } from "./dataService";
import { ProfileService } from "./profileService";
import { FootballDataProvider } from "./data/footballDataProvider";
import { CacheService } from "./cacheService";
import { ScapegraphService } from "./scapegraphService";
import { DataQuality } from "./dataQuality";
import { Logger } from "./logger";
import { AnalysisResult, MatchHistory, LeagueContext, RhoData } from "../types";

const MODEL = 'gemini-3.7-flash', SYSTEM_PROMPT = `Expert Forensic Data Researcher. MISSION: High-Integrity Fact Retrieval for Quantitative Models.
1. DATA RETRIEVAL: Find missing npxG, xGA, and tactical metrics (PPDA).
2. NEWS AUDIT: Identify confirmed lineup leaks, injury crisis (>3 starters), or extreme weather.
3. NO ANALYSIS: You are a DATA WORKER. Do not predict probabilities.
4. CITATION: Every number must have a source.
5. Output strictly valid JSON.`;

const AI_SCHEMA = {
    type: Type.OBJECT, properties: {
        researchConfidence: { type: Type.NUMBER },
        tacticalIntel: { type: Type.STRING },
        verifiedFacts: { type: Type.OBJECT, properties: {
            homeSeasonXG: { type: Type.NUMBER }, awaySeasonXG: { type: Type.NUMBER }, homeSeasonXGAs: { type: Type.NUMBER }, awaySeasonXGA: { type: Type.NUMBER },
            pinnacleOver15: { type: Type.NUMBER }, pinnacleUnder15: { type: Type.NUMBER }, pinnacleUnder35: { type: Type.NUMBER }, pinnacleOver35: { type: Type.NUMBER },
            citations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { source: { type: Type.STRING }, url: { type: Type.STRING }, value: { type: Type.NUMBER }, timestamp: { type: Type.STRING } } } },
            varianceAlerts: { type: Type.ARRAY, items: { type: Type.STRING } }
        }},
        styleMetrics: { type: Type.OBJECT, properties: {
            home: { type: Type.OBJECT, properties: { ppda: { type: Type.NUMBER }, possessionFinalThird: { type: Type.NUMBER } } },
            away: { type: Type.OBJECT, properties: { ppda: { type: Type.NUMBER }, possessionFinalThird: { type: Type.NUMBER } } }
        }}
    }, required: ["researchConfidence", "tacticalIntel"]
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const getFallback = async (req: { homeTeam: string; awayTeam: string; league: string; homeTeamName: string; awayTeamName: string; kickoff?: string }, matches: MatchHistory[], rho: RhoData): Promise<AnalysisResult> => {
    const asOf = (req.kickoff && req.kickoff !== 'UPCOMING') ? req.kickoff : undefined;
    return { 
        ...MatchEngine.calculate(
            DataService.standardize({ ...ProfileService.computeBaseline(req.homeTeam, matches, asOf), name: req.homeTeamName }), 
            DataService.standardize({ ...ProfileService.computeBaseline(req.awayTeam, matches, asOf), name: req.awayTeamName }), 
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
        matches: [], rhoData: { rho: -0.11, sigmaRho: 0.05 },
        defensiveRanks: {}, avgHG: 1.35, avgAG: 1.25, varHG: 1.1, varAG: 1.1,
        audit: { signalIntegrity: '0%', sampleSize: 0 }
    }));
    const matches = ctx.matches, rho = ctx.rhoData;

    // Pull ALL data from ScrapeGraphAI in parallel
    const fullContext = await ScapegraphService.getFullMatchContext(
        req.homeTeamName, req.awayTeamName,
        req.homeTeam.toLowerCase().replace(/\s+/g, '-'),
        req.awayTeam.toLowerCase().replace(/\s+/g, '-'),
        req.league || 'EPL'
    ).catch(() => null);

    const intel = fullContext?.intel || null;
    const scrapedOdds = fullContext?.odds || [];
    const homeXGData = fullContext?.homeXG || null;
    const awayXGData = fullContext?.awayXG || null;
    const homeForm = fullContext?.homeForm || [];
    const awayForm = fullContext?.awayForm || [];

    // Run Quality Validation
    const quality = DataQuality.validate(intel, homeXGData, awayXGData, scrapedOdds, homeForm, awayForm, req.kickoff);
    
    if (!quality.shouldProceed) {
        const fallback = await getFallback(req, matches, rho);
        return {
            ...fallback,
            summary: `[QUALITY BLOCKED] Analysis halted due to unreliable data: ${quality.warnings.join(' ')}`,
            dataSource: 'BLOCKED_LOW_QUALITY',
            dataQuality: quality
        };
    }

    // Best available odds (prefer Pinnacle, fallback to average)
    const bestOdds = scrapedOdds.length > 0 ? (() => {
        const pinnacle = scrapedOdds.find(o => o.bookmaker.toLowerCase().includes('pinnacle'));
        const avg = (field: 'over15' | 'under15' | 'over35' | 'under35') => {
            if (pinnacle && (pinnacle as any)[field] > 0) return (pinnacle as any)[field];
            const valid = scrapedOdds.filter(o => (o as any)[field] > 0);
            return valid.length > 0 ? valid.reduce((s, o) => s + (o as any)[field], 0) / valid.length : undefined;
        };
        return { 
            pinnacleOver15: avg('over15'), 
            pinnacleUnder15: avg('under15'), 
            pinnacleOver35: avg('over35'), 
            pinnacleUnder35: avg('under35') 
        };
    })() : null;

    try {
        const intelContext = intel ? `| REAL-TIME INTEL: ${JSON.stringify(intel)}` : '';
        const xgContext = (homeXGData && awayXGData)
            ? `| SCRAPED xG DATA: Home ${homeXGData.team} xG=${homeXGData.xG} xGA=${homeXGData.xGA} npxG=${homeXGData.npxG} (${homeXGData.matches} matches, source: ${homeXGData.source}) | Away ${awayXGData.team} xG=${awayXGData.xG} xGA=${awayXGData.xGA} npxG=${awayXGData.npxG} (${awayXGData.matches} matches, source: ${awayXGData.source})`
            : '';
        const oddsContext = bestOdds
            ? `| SCRAPED ODDS: Over1.5=${bestOdds.pinnacleOver15} Under1.5=${bestOdds.pinnacleUnder15} Over3.5=${bestOdds.pinnacleOver35} Under3.5=${bestOdds.pinnacleUnder35}`
            : '';
        const formContext = `| FORM: Home Last 5=${JSON.stringify(homeForm.slice(0, 3))} | Away Last 5=${JSON.stringify(awayForm.slice(0, 3))}`;

        const interactionPromise = ai.interactions.create({
            model: MODEL, system_instruction: SYSTEM_PROMPT,
            input: `MATCH: ${req.homeTeamName} vs ${req.awayTeamName} | KICKOFF: ${req.kickoff || 'UPCOMING'} | MANDATE: Fetch hard npxG stats. Sync Market. ${intelContext} ${xgContext} ${oddsContext} ${formContext}`,
            tools: [{ type: 'google_search' }], response_format: AI_SCHEMA as any
        });

        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Analysis Timeout: Research phase exceeded 15s limit.')), 15000)
        );

        const interaction = await Promise.race([interactionPromise, timeout]);
        const p = JSON.parse(interaction.output_text || '{}');
        const [hS, aS] = await Promise.all([
            ProfileService.getStyle(req.homeTeam), ProfileService.getStyle(req.awayTeam)
        ]);

        const asOf = (req.kickoff && req.kickoff !== 'UPCOMING') ? req.kickoff : undefined;
        const res = MatchEngine.calculate(
            DataService.standardize({ ...ProfileService.computeBaseline(req.homeTeam, matches, asOf), name: req.homeTeamName }),
            DataService.standardize({ ...ProfileService.computeBaseline(req.awayTeam, matches, asOf), name: req.awayTeamName }),
            {
                homeStyle: { ...(hS || {}), ...(p.styleMetrics?.home || {}), teamId: req.homeTeam },
                awayStyle: { ...(aS || {}), ...(p.styleMetrics?.away || {}), teamId: req.awayTeam },
                league: req.league,
                homeSeasonXG: homeXGData?.xG || p.verifiedFacts?.homeSeasonXG,
                awaySeasonXG: awayXGData?.xG || p.verifiedFacts?.awaySeasonXG,
                homeSeasonXGA: homeXGData?.xGA || p.verifiedFacts?.homeSeasonXGAs,
                awaySeasonXGA: awayXGData?.xGA || p.verifiedFacts?.awaySeasonXGA,
                marketOdds: {
                    pinnacleOver15: bestOdds?.pinnacleOver15 || p.verifiedFacts?.pinnacleOver15,
                    pinnacleUnder15: bestOdds?.pinnacleUnder15 || p.verifiedFacts?.pinnacleUnder15,
                    pinnacleUnder35: bestOdds?.pinnacleUnder35 || p.verifiedFacts?.pinnacleUnder35,
                    pinnacleOver35: bestOdds?.pinnacleOver35 || p.verifiedFacts?.pinnacleOver35
                },
                groundingLog: { citations: p.verifiedFacts?.citations || [], varianceAlerts: p.verifiedFacts?.varianceAlerts || [] },
                intel: intel || undefined,
                dataQuality: quality
            }, rho);

        // Append tactical intel to the math-driven summary
        res.summary = `${res.summary} Forensic intel: ${p.tacticalIntel}`;
        res.dataQuality = quality;
        
        Logger.prediction(`${req.homeTeamName} vs ${req.awayTeamName}`, quality.overall, res.probability * 100);

        // Save to Persistent Cache
        await CacheService.set(key, res);
        return res;
    } catch (e) { return getFallback(req, matches, rho); }
};



