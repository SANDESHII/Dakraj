import { TeamStats, MatchContext, AnalysisResult } from '../types';
import { DixonColes } from '../core/math';
import { DATA_CONSTANTS, LEAGUE_CONFIGS, BAYESIAN_CONFIG } from '../core/constants';

export class MatchEngine {
    static calculate(
        home: TeamStats,
        away: TeamStats,
        context: MatchContext,
        rhoData = { rho: -0.11, sigmaRho: 0.05 }
    ): AnalysisResult {
        const config = LEAGUE_CONFIGS[context.league || 'EPL'] || LEAGUE_CONFIGS.STANDARD;
        const lAvg = DATA_CONSTANTS.DEFAULT_LEAGUE_AVG;

        // Step 0: Calculate Signal Purity early for use in all branches
        const extractionConfidence = context.dataQuality?.confidence ?? 100;
        const historicalPurity = ((home.dataPurity || 1.0) + (away.dataPurity || 1.0)) / 2;
        
        // Final Signal Purity is a weighted blend of real-time extraction quality (70%) and historical sample volume (30%)
        const purity = (extractionConfidence * 0.7) + (historicalPurity * 100 * 0.3);

        // Step 1: Calculate base expected goals from team strength
        const hA = context.homeSeasonXG || home.npxG;
        const aA = context.awaySeasonXG || away.npxG;
        const hXGA = context.homeSeasonXGA || home.avgXGA;
        const aXGA = context.awaySeasonXGA || away.avgXGA;

        const hD = (hXGA / lAvg);
        const aD = (aXGA / lAvg);

        let hL = lAvg * (hA / lAvg) * aD * (1 + config.homeAdvantage / lAvg) * config.goalRate;
        let aM = lAvg * (aA / lAvg) * hD * config.goalRate;

        // Step 2: Build Dixon-Coles score matrix
        const matrix = DixonColes.calculateScoreMatrix(hL, aM, rhoData.rho);

        // Step 3: Direct probability calculation (no simulation)
        const pO15_raw = DixonColes.calculateOver15Probability(matrix);
        const pU35_raw = DixonColes.calculateUnder35Probability(matrix);

        // Step 4: Remove market overround (vig)
        const oddsO15 = context.marketOdds?.pinnacleOver15;
        const oddsU35 = context.marketOdds?.pinnacleUnder35;

        // CRITICAL: If odds are missing, we cannot calculate edge. 
        // We must not fall back to hardcoded numbers (AI Slop).
        if (!oddsO15 && !oddsU35) {
            return {
                probability: Math.round(pO15_raw * 100),
                summary: "Analysis incomplete: Real-time betting market odds could not be synchronized. Edge calculation suspended.",
                homeStats: home,
                awayStats: away,
                homeXG: hL,
                awayXG: aM,
                predictionType: 'NO_BET',
                predictionLabel: 'Market Data Missing',
                marketOdds: 0,
                marketImpliedProb: 0,
                edge: 0,
                verdict: 'NO_BET',
                purity: purity,
                signalStrength: pO15_raw,
                context,
                dataSource: 'BLOCKED_LOW_QUALITY'
            };
        }

        // Use the one that is available, or safe default for the other if calculating specific type
        const activeOddsO15 = oddsO15 || 1.01; 
        const activeOddsU35 = oddsU35 || 1.01;

        const oddsU15 = context.marketOdds?.pinnacleUnder15;
        const oddsO35 = context.marketOdds?.pinnacleOver35;

        const computeOverround = (o1: number, o2?: number) => {
            if (o2 && o1 > 0 && o2 > 0) return (1 / o1 + 1 / o2) - 1;
            return 0.05; // Slightly more conservative 5% fallback for single-sided odds
        };

        const overroundO15 = computeOverround(activeOddsO15, oddsU15);
        const overroundU35 = computeOverround(activeOddsU35, oddsO35);

        const mP_O15_raw = 1 / activeOddsO15;
        const mP_U35_raw = 1 / activeOddsU35;

        const mPO15 = mP_O15_raw / (1 + overroundO15);
        const mPU35 = mP_U35_raw / (1 + overroundU35);

        // Step 5: Dynamic Bayesian Trust Model
        // Instead of a fixed dial, we calculate trust based on Information Quality, Market Efficiency, and League Predictability.
        
        // A) League Base Trust: High-scoring, high-data leagues (EPL/Bundesliga) allow higher model confidence.
        const leagueRate = LEAGUE_CONVERSION_RATES[context.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
        
        // B) Model Confidence: Derived from Purity (Sample size + Data Integrity)
        // We scale the league rate by the purity of the specific data we found.
        const modelTrust = (purity / 100) * (leagueRate * 1.5); // Boost base rate by up to 50% if purity is perfect
        
        // C) Market Efficiency: Tighter markets (low overround) are harder to beat.
        const avgOverround = (overroundO15 + overroundU35) / 2;
        const marketEfficiencyFactor = 1 - Math.min(0.2, Math.max(0, avgOverround - 0.02) * 2.5);

        // D) Final Bayesian Blend Weight (w)
        // This is the true 'learning' dial: it moves based on how much signal vs noise we detect in this specific fixture.
        const w = Math.max(0.1, Math.min(0.65, modelTrust * marketEfficiencyFactor));
        
        const pBlendedO15 = (pO15_raw * w) + (mPO15 * (1 - w));
        const pBlendedU35 = (pU35_raw * w) + (mPU35 * (1 - w));

        // Step 6: Calculate edge
        const edgeO15 = pBlendedO15 - mP_O15_raw;
        const edgeU35 = pBlendedU35 - mP_U35_raw;

        const type = edgeO15 > edgeU35 ? 'OVER_15' : 'UNDER_35';
        const p = type === 'OVER_15' ? pBlendedO15 : pBlendedU35;
        const mOdds = (type === 'OVER_15' ? oddsO15 : oddsU35) || 0;
        const mP = type === 'OVER_15' ? mPO15 : mPU35;
        const rawEdge = type === 'OVER_15' ? edgeO15 : edgeU35;

        const edge = Math.min(rawEdge, 0.12); // Safety cap
        const hasEdge = edge > 0.025; // 2.5% minimum edge threshold

        // Generate Quantitative Summary (Math First)
        const mathSummary = `Dixon-Coles model projects ${hL.toFixed(2)} vs ${aM.toFixed(2)} xG. ${hasEdge ? `Model-to-Market variance of ${Math.round(edge * 100)}% indicates a structural inefficiency.` : 'Market convergence confirmed.'}`;

        return {
            probability: Math.round(p * 100),
            summary: mathSummary,
            homeStats: home,
            awayStats: away,
            homeXG: hL,
            awayXG: aM,
            predictionType: type,
            predictionLabel: type === 'OVER_15' ? 'Over 1.5 Goals' : 'Under 3.5 Goals',
            marketOdds: mOdds,
            marketImpliedProb: Math.round(mP * 100),
            edge: Math.round(edge * 100),
            verdict: hasEdge ? 'EXECUTE_BET' : 'NO_BET',
            purity: purity,
            signalStrength: p,
            context,
            dataSource: 'LIVE'
        };
    }
}
