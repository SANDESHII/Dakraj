import { MatchHistory } from '../types';
import { ARCHETYPE_STATS } from './archetypes';
import { LEAGUE_CONVERSION_RATES, DATA_CONSTANTS } from './constants';

export class ArchetypeEngine {
    /**
     * Computes archetype stats dynamically from a set of matches.
     * This ensures fallbacks are calibrated to the current league/season environment.
     */
    static compute(matches: MatchHistory[]): typeof ARCHETYPE_STATS {
        if (!matches || matches.length < 50) {
            return ARCHETYPE_STATS; // Fallback to baseline if data is too thin
        }

        const teamStats: Record<string, { xG: number; xGA: number; games: number; cleanSheets: number; delta: number; score: number }> = {};
        const totalGoals = matches.reduce((a, m) => a + (m.homeGoals ?? 0) + (m.awayGoals ?? 0), 0);
        const lAvg = (totalGoals / (matches.length * 2)) || DATA_CONSTANTS.DEFAULT_LEAGUE_AVG;

        matches.forEach(m => {
            const hId = m.homeTeam, aId = m.awayTeam;
            const r = LEAGUE_CONVERSION_RATES[m.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
            
            [hId, aId].forEach(id => {
                if (!teamStats[id]) teamStats[id] = { xG: 0, xGA: 0, games: 0, cleanSheets: 0, delta: 0, score: 0 };
            });

            const hXG = m.homeXG ?? ((m.homeShotsOnTarget || 0) * r);
            const aXG = m.awayXG ?? ((m.awayShotsOnTarget || 0) * r);

            teamStats[hId].xG += hXG;
            teamStats[hId].xGA += aXG;
            teamStats[hId].games++;
            if (m.awayGoals === 0) teamStats[hId].cleanSheets++;
            teamStats[hId].delta += (m.homeGoals - hXG);

            teamStats[aId].xG += aXG;
            teamStats[aId].xGA += hXG;
            teamStats[aId].games++;
            if (m.homeGoals === 0) teamStats[aId].cleanSheets++;
            teamStats[aId].delta += (m.awayGoals - aXG);
        });

        Object.values(teamStats).forEach(s => {
            if (s.games > 0) s.score = (s.xG - s.xGA) / s.games;
        });

        const sorted = Object.entries(teamStats)
            .filter(([_, s]) => s.games >= 3)
            .sort((a, b) => b[1].score - a[1].score);

        if (sorted.length < 10) return ARCHETYPE_STATS;

        const getTier = (startPct: number, endPct: number) => {
            const start = Math.floor(sorted.length * startPct);
            const end = Math.floor(sorted.length * endPct);
            const group = sorted.slice(start, Math.max(start + 1, end));
            if (!group.length) return null;

            let tXG = 0, tXGA = 0, tCS = 0, tCE = 0, n = group.length;
            group.forEach(([_, s]) => {
                tXG += s.xG / s.games;
                tXGA += s.xGA / s.games;
                tCS += s.cleanSheets / s.games;
                tCE += s.delta / s.games;
            });

            const avgXGA = tXGA / n;
            return {
                npxG: Number((tXG / n).toFixed(2)),
                avgXGA: Number((avgXGA).toFixed(2)),
                defensiveStability: Number(Math.max(0.3, Math.min(0.9, 1 - (avgXGA / (lAvg * 2)))).toFixed(2)),
                cleanSheets: Number((tCS / n).toFixed(2)),
                clinicalEdge: Number((tCE / n).toFixed(2))
            };
        };

        return {
            ELITE: getTier(0, 0.1) || ARCHETYPE_STATS.ELITE,
            STRONG: getTier(0.1, 0.3) || ARCHETYPE_STATS.STRONG,
            STANDARD: getTier(0.3, 1.0) || ARCHETYPE_STATS.STANDARD
        };
    }
}
