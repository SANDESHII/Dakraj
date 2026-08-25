import { MatchEngine } from './engine';
import { DataService } from './dataService';
import { ProfileService } from './profileService';
import { BACKTEST_CONFIG } from '../core/constants';

export interface CalibrationResult {
    bestBaseTrust: number;
    bestPurityScale: number;
    minBrierScore: number;
}

export class CalibrationService {
    static async calibrate(league: string = 'EPL'): Promise<CalibrationResult> {
        const { matches: all } = await DataService.getLeagueContext(league);
        const samples = all.filter(m => m.homeGoals != null).slice(-BACKTEST_CONFIG.SAMPLE_SIZE);
        
        let minBrier = Infinity;
        let bestBase = 0.05;
        let bestScale = 0.8;

        // Grid search over base trust and purity scale
        for (let base = 0; base <= 0.2; base += 0.05) {
            for (let scale = 0.5; scale <= 0.95; scale += 0.05) {
                let totalBrier = 0;
                
                for (const m of samples) {
                    const history = all.filter(prev => new Date(prev.date) < new Date(m.date));
                    const h = DataService.standardize({ ...ProfileService.computeBaseline(m.homeTeam, history, m.date), name: m.homeTeam });
                    const a = DataService.standardize({ ...ProfileService.computeBaseline(m.awayTeam, history, m.date), name: m.awayTeam });
                    
                    const math = MatchEngine.calculate(h, a, { date: m.date, marketOdds: { pinnacleOver15: 1.5, pinnacleUnder35: 1.5 } }, undefined, { baseTrust: base, purityScale: scale });
                    
                    const tg = (m.homeGoals || 0) + (m.awayGoals || 0);
                    const isO = tg > 1.5;
                    const isU = tg < 3.5;
                    
                    const prob = (math.predictionType === 'OVER_15' ? math.probability : (100 - math.probability)) / 100;
                    const outcome = math.predictionType === 'OVER_15' ? isO : isU;
                    
                    totalBrier += Math.pow(prob - (outcome ? 1 : 0), 2);
                }

                const avgBrier = totalBrier / samples.length;
                if (avgBrier < minBrier) {
                    minBrier = avgBrier;
                    bestBase = base;
                    bestScale = scale;
                }
            }
        }

        return {
            bestBaseTrust: Math.round(bestBase * 100) / 100,
            bestPurityScale: Math.round(bestScale * 100) / 100,
            minBrierScore: minBrier
        };
    }
}
