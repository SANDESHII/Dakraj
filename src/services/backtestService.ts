import { ProfileService } from './profileService';
import { MatchEngine } from './engine';
import { DataService } from './dataService';
import { AnalysisResult } from '../types';
import { BACKTEST_CONFIG, BAYESIAN_CONFIG } from '../core/constants';

export interface BacktestSummary {
    totalMatches: number;
    over15Accuracy: number;
    under35Accuracy: number;
    brierScore: number;
    highPurityBrierScore: number;
    highPurityMatches: number;
    edgeSegments: any[];
    calibrationUsed: { baseTrust: number; purityScale: number };
    matches: Array<{
        match: any;
        prediction: AnalysisResult;
        isOver15Correct: boolean;
        isUnder35Correct: boolean;
        marketEdge?: number;
    }>;
}

export class BacktestService {
    static async runBacktest(league: string = 'EPL'): Promise<BacktestSummary> {
        const { matches: all } = await DataService.getLeagueContext(league);
        const samples = all.filter(m => m.homeGoals != null).slice(-BACKTEST_CONFIG.SAMPLE_SIZE);
        let totalB = 0, hpB = 0, hpC = 0, ovC = 0, unC = 0, ovT = 0, unT = 0;
        const results: any[] = [], segments = BACKTEST_CONFIG.SEGMENTS.map(s => ({ ...s }));

        for (const m of samples) {
            const history = all.filter(prev => new Date(prev.date) < new Date(m.date));
            const h = DataService.standardize({ ...ProfileService.computeBaseline(m.homeTeam, history, m.date), name: m.homeTeam });
            const a = DataService.standardize({ ...ProfileService.computeBaseline(m.awayTeam, history, m.date), name: m.awayTeam });
            const math = MatchEngine.calculate(h, a, { date: m.date });
            const tg = (m.homeGoals || 0) + (m.awayGoals || 0), isO = tg > 1.5, isU = tg < 3.5;
            const outcome = math.predictionType === 'OVER_15' ? isO : isU;
            const brier = Math.pow((math.probability / 100) - (outcome ? 1 : 0), 2);

            totalB += brier;
            if (h.dataPurity >= 0.8 && a.dataPurity >= 0.8) { hpB += brier; hpC++; }
            if (math.predictionType === 'OVER_15') { ovT++; if (isO) ovC++; }
            if (math.predictionType === 'UNDER_35') { unT++; if (isU) unC++; }

            const edge = math.surety.edgeValue, seg = segments.find(s => edge >= s.min && edge < s.max);
            if (seg) { seg.count++; if (outcome) seg.hits++; }

            results.push({ match: { ...m, actualScore: [m.homeGoals, m.awayGoals] }, prediction: math, isOver15Correct: isO, isUnder35Correct: isU, marketEdge: edge });
        }

        return {
            totalMatches: samples.length,
            over15Accuracy: ovT > 0 ? (ovC / ovT) * 100 : 0,
            under35Accuracy: unT > 0 ? (unC / unT) * 100 : 0,
            brierScore: totalB / samples.length,
            highPurityBrierScore: hpC > 0 ? hpB / hpC : 0,
            highPurityMatches: hpC,
            edgeSegments: segments.map(s => ({ segment: s.segment, count: s.count, hitRate: s.count > 0 ? s.hits / s.count : 0, avgEdge: s.min / 100 })),
            calibrationUsed: { baseTrust: BAYESIAN_CONFIG.BASE_TRUST, purityScale: BAYESIAN_CONFIG.PURITY_SCALE },
            matches: results
        };
    }

    static async calibrate(league: string = 'EPL'): Promise<{ baseTrust: number; purityScale: number; brierScore: number }> {
        const { matches: all } = await DataService.getLeagueContext(league);
        const samples = all.filter(m => m.homeGoals != null).slice(-BACKTEST_CONFIG.SAMPLE_SIZE);
    
        let bestBrier = Infinity;
        let bestConfig = { baseTrust: 0.05, purityScale: 0.8 };
    
        // Grid search over plausible ranges
        for (let baseTrust = 0.02; baseTrust <= 0.30; baseTrust += 0.03) {
            for (let purityScale = 0.3; purityScale <= 1.0; purityScale += 0.1) {
                let totalBrier = 0;
                for (const m of samples) {
                    const history = all.filter(prev => new Date(prev.date) < new Date(m.date));
                    const h = DataService.standardize({
                        ...ProfileService.computeBaseline(m.homeTeam, history, m.date),
                        name: m.homeTeam
                    });
                    const a = DataService.standardize({
                        ...ProfileService.computeBaseline(m.awayTeam, history, m.date),
                        name: m.awayTeam
                    });
                    const math = MatchEngine.calculate(h, a, { date: m.date }, undefined,
                        { baseTrust, purityScale });
                    const tg = (m.homeGoals || 0) + (m.awayGoals || 0);
                    const isO = tg > 1.5, isU = tg < 3.5;
                    const outcome = math.predictionType === 'OVER_15' ? isO : isU;
                    totalBrier += Math.pow((math.probability / 100) - (outcome ? 1 : 0), 2);
                }
                const avgBrier = totalBrier / samples.length;
                if (avgBrier < bestBrier) {
                    bestBrier = avgBrier;
                    bestConfig = { baseTrust, purityScale };
                }
            }
        }
        return { ...bestConfig, brierScore: bestBrier };
    }
}
