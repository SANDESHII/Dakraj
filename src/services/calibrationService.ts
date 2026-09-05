import { MatchEngine } from './engine';
import { DataService } from './dataService';
import { ProfileService } from './profileService';
import { BACKTEST_CONFIG } from '../core/constants';

export interface CalibrationResult {
    brierScore: number;
    totalMatches: number;
    edgeHitRate: number;
}

export class CalibrationService {
    // Simple validation only - no grid search optimization
    static async validate(league: string = 'EPL'): Promise<CalibrationResult> {
        const { matches: all } = await DataService.getLeagueContext(league);
        const samples = all.filter(m => m.homeGoals != null).slice(-BACKTEST_CONFIG.SAMPLE_SIZE);

        let totalBrier = 0;
        let edgeBets = 0;
        let edgeHits = 0;

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

            const math = MatchEngine.calculate(h, a, { date: m.date });

            const tg = (m.homeGoals || 0) + (m.awayGoals || 0);
            const isO = tg > 1.5;
            const isU = tg < 3.5;

            const prob = (math.predictionType === 'OVER_15' ? math.probability : (100 - math.probability)) / 100;
            const outcome = math.predictionType === 'OVER_15' ? isO : isU;

            totalBrier += Math.pow(prob - (outcome ? 1 : 0), 2);

            if (math.verdict === 'EXECUTE_BET') {
                edgeBets++;
                if (outcome) edgeHits++;
            }
        }

        return {
            brierScore: totalBrier / samples.length,
            totalMatches: samples.length,
            edgeHitRate: edgeBets > 0 ? edgeHits / edgeBets : 0
        };
    }
}
