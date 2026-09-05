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
        const oddsO15 = context.marketOdds?.pinnacleOver15 || 1.50;
        const oddsU15 = context.marketOdds?.pinnacleUnder15;
        const oddsU35 = context.marketOdds?.pinnacleUnder35 || 1.50;
        const oddsO35 = context.marketOdds?.pinnacleOver35;

        const computeOverround = (o1: number, o2?: number) => {
            if (o2) return (1 / o1 + 1 / o2) - 1;
            return 0.04; // Conservative fallback
        };

        const overroundO15 = computeOverround(oddsO15, oddsU15);
        const overroundU35 = computeOverround(oddsU35, oddsO35);

        const mP_O15_raw = 1 / oddsO15;
        const mP_U35_raw = 1 / oddsU35;

        const mPO15 = mP_O15_raw / (1 + overroundO15);
        const mPU35 = mP_U35_raw / (1 + overroundU35);

        // Step 5: Simple Bayesian blend (one parameter: w)
        const w = BAYESIAN_CONFIG.BASE_TRUST; // Fixed weight, no dynamic purity scaling
        const pBlendedO15 = (pO15_raw * w) + (mPO15 * (1 - w));
        const pBlendedU35 = (pU35_raw * w) + (mPU35 * (1 - w));

        // Step 6: Calculate edge
        const edgeO15 = pBlendedO15 - mP_O15_raw;
        const edgeU35 = pBlendedU35 - mP_U35_raw;

        const type = edgeO15 > edgeU35 ? 'OVER_15' : 'UNDER_35';
        const p = type === 'OVER_15' ? pBlendedO15 : pBlendedU35;
        const mOdds = type === 'OVER_15' ? oddsO15 : oddsU35;
        const mP = type === 'OVER_15' ? mPO15 : mPU35;
        const rawEdge = type === 'OVER_15' ? edgeO15 : edgeU35;

        const edge = Math.min(rawEdge, 0.12); // Safety cap
        const hasEdge = edge > 0.025; // 2.5% minimum edge threshold

        return {
            probability: Math.round(p * 100),
            summary: hasEdge
                ? `Edge detected. Model sees ${Math.round(p * 100)}% true probability. Market implies ${Math.round(mP * 100)}%.`
                : `No Edge. Market odds (${mOdds.toFixed(2)}) are efficient.`,
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
            purity: 100,
            signalStrength: p,
            context,
            dataSource: 'LIVE'
        };
    }
}
