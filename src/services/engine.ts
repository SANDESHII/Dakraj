import { TeamStats, MatchContext, AnalysisResult } from '../types';
import { DixonColes, MonteCarloSimulator } from '../core/math';
import { MatchContextService } from './matchContext';
import { DATA_CONSTANTS, LEAGUE_CONFIGS, BAYESIAN_CONFIG } from '../core/constants';

export class MatchEngine {
    static calculate(home: TeamStats, away: TeamStats, context: MatchContext, rhoData = { rho: -0.11, sigmaRho: 0.05 }, calibration?: { baseTrust: number, purityScale: number }): AnalysisResult {
        const config_bayesian = calibration || { baseTrust: BAYESIAN_CONFIG.BASE_TRUST, purityScale: BAYESIAN_CONFIG.PURITY_SCALE };
        const config = LEAGUE_CONFIGS[context.league || 'EPL'] || LEAGUE_CONFIGS.STANDARD;
        let hA = context.homeSeasonXG || home.npxG, aA = context.awaySeasonXG || away.npxG;
        const lAvg = DATA_CONSTANTS.DEFAULT_LEAGUE_AVG, hXGA = context.homeSeasonXGA || home.avgXGA, aXGA = context.awaySeasonXGA || away.avgXGA;

        const hD = (hXGA / lAvg) * 0.6 + (home.defensiveStability / 0.65) * 0.4;
        const aD = (aXGA / lAvg) * 0.6 + (away.defensiveStability / 0.65) * 0.4;

        let hL = lAvg * (hA / lAvg) * aD * (1 + config.homeAdvantage / lAvg) * config.goalRate;
        let aM = lAvg * (aA / lAvg) * hD * config.goalRate;

        // POLISH: Apply Team-Specific Home/Away Bias (Dampened)
        const hBias = Math.pow(home.homeAwayBias || 1.0, 0.4);
        const aBias = Math.pow(away.homeAwayBias || 1.0, 0.4);
        hL *= hBias;
        aM *= (1 / aBias);

        const hM = (home.clinicalEdge || 0), aM_ = (away.clinicalEdge || 0);
        hL *= (1 + Math.sign(hM) * Math.min(Math.sqrt(Math.abs(hM)), DATA_CONSTANTS.MOMENTUM_CAP));
        aM *= (1 + Math.sign(aM_) * Math.min(Math.sqrt(Math.abs(aM_)), DATA_CONSTANTS.MOMENTUM_CAP)) * MatchContextService.calculateTravelFatigue(home.name.toUpperCase(), away.name.toUpperCase());

        if (context.referee && context.referee.gamesOfficiated) { 
            const leagueAvgPen = 0.2;
            const k = DATA_CONSTANTS.SHRINKAGE_K; // 12
            const n = context.referee.gamesOfficiated;
            const raw = context.referee.avgPenaltiesPerGame;
            // Shrink toward league average: more games = more trust in raw data
            const shrunk = (n * raw + k * leagueAvgPen) / (n + k);
            const rE = 1 + (shrunk - leagueAvgPen) * 0.2;
            hL *= rE; aM *= rE; 
        }
        



        const matrix = DixonColes.calculateScoreMatrix(hL, aM, rhoData.rho);
        const pO15_raw = DixonColes.calculateOverUnder(matrix, 1.5);
        const pU35_raw = 1 - DixonColes.calculateOverUnder(matrix, 3.5);
        
        // --- DYNAMIC OVERROUND REMOVAL ---
        const oddsO15 = context.marketOdds?.pinnacleOver15 || 1.50;
        const oddsU15 = context.marketOdds?.pinnacleUnder15;
        const oddsU35 = context.marketOdds?.pinnacleUnder35 || 1.50;
        const oddsO35 = context.marketOdds?.pinnacleOver35;
        
        const computeOverround = (o1: number, o2?: number) => {
            if (o2) return (1/o1 + 1/o2) - 1;
            return 0.04; // Conservative fallback for Pinnacle (4%)
        };

        const overroundO15 = computeOverround(oddsO15, oddsU15);
        const overroundU35 = computeOverround(oddsU35, oddsO35);

        const mP_O15_raw = 1 / oddsO15;
        const mP_U35_raw = 1 / oddsU35;
        
        const mPO15 = mP_O15_raw / (1 + overroundO15); 
        const mPU35 = mP_U35_raw / (1 + overroundU35);
        
        const purity = ((home.dataPurity || 0.1) + (away.dataPurity || 0.1)) / 2;
        const modelWeight = config_bayesian.baseTrust + (purity * config_bayesian.purityScale); 
        
        const pBlendedO15 = (pO15_raw * modelWeight) + (mPO15 * (1 - modelWeight));
        const pBlendedU35 = (pU35_raw * modelWeight) + (mPU35 * (1 - modelWeight));
        
        const edgeO15 = pBlendedO15 - mP_O15_raw;
        const edgeU35 = pBlendedU35 - mP_U35_raw;

        const type = edgeO15 > edgeU35 ? 'OVER_15' : 'UNDER_35';
        
        const p = type === 'OVER_15' ? pBlendedO15 : pBlendedU35;
        const mOdds = type === 'OVER_15' ? oddsO15 : oddsU35;
        const mP = type === 'OVER_15' ? mPO15 : mPU35;
        const mP_raw = type === 'OVER_15' ? mP_O15_raw : mP_U35_raw;
        const rawEdge = type === 'OVER_15' ? edgeO15 : edgeU35;

        const edge = Math.min(rawEdge, 0.12); // SAFETY CAP: Prevent over-betting on anomalies/hallucinations
        const p_bet = mP_raw + edge; // Probability used for stake calculation
        const b = mOdds - 1;
        
        // --- IMPROVED: Kelly scaling based on data purity and edge magnitude ---
        const kellyFraction = 0.15 * purity * (0.5 + (edge / 0.12));
        const stake = Math.max(0, (b * p_bet - (1 - p_bet)) / b) * kellyFraction; 
        const hasEdge = edge > 0.025; // Professional threshold

        const sim = MonteCarloSimulator.run(hL, aM, type === 'UNDER_35' ? 3.5 : 1.5, type === 'UNDER_35', rhoData.rho);
        
        return {
            probability: Math.round(p * 100),
            summary: hasEdge ? `Edge detected. Model sees ${Math.round(p * 100)}% true probability. Market implies ${Math.round(mP * 100)}%.` : `No Edge. Market odds (${mOdds.toFixed(2)}) are efficient.`,
            homeStats: home, awayStats: away, homeXG: hL, awayXG: aM,
            minimumExpectancy: sim.confidenceInterval[0], potentialCeiling: sim.confidenceInterval[1],
            predictionType: type, predictionLabel: type === 'OVER_15' ? 'Over 1.5 Goals' : 'Under 3.5 Goals',
            marketOdds: mOdds, marketImpliedProb: Math.round(mP * 100), edge: Math.round(edge * 100), 
            recommendedStake: Math.round(stake * 1000) / 10, verdict: hasEdge ? 'EXECUTE_BET' : 'NO_BET',
            purity: Math.round(purity * 100), signalStrength: p, context,
            dataSource: (home.dataPurity <= 0.1 && away.dataPurity <= 0.1) ? 'FALLBACK_STATIC' : 'LIVE',
            surety: { confidenceScore: p, edgeValue: Math.round(edge * 100) }
        };
    }
}
