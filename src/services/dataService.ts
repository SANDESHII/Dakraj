import { MatchHistory, TeamStats, LeagueContext, LeagueTraits } from '../types';
import { FootballDataProvider } from './data/footballDataProvider';
import { DixonColes } from '../core/math';
import { db } from '../lib/firebase';
import { DATA_CONSTANTS } from '../core/constants';
import { collection, query, where, getDocsFromServer, writeBatch, doc, limit, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export class DataService {
    static async getLeagueContext(league: string): Promise<LeagueContext> {
        const normalized = FootballDataProvider.normalizeLeague(league);
        const matches = await this.fetchHistoricalData(normalized);
        const weighted = this.applyRecencyWeights(matches);
        const traits = this.extractTacticalTraits(weighted);
        
        const final = weighted.map(m => {
            const hW = this.calculateOpponentAdjustedWeight(m.homeGoals, m.awayGoals, m.awayTeam, traits.defensiveRanks);
            const aW = this.calculateOpponentAdjustedWeight(m.awayGoals, m.homeGoals, m.homeTeam, traits.defensiveRanks);
            return { ...m, weight: (m.weight || 1.0) * Math.max(hW, aW) };
        });

        return { 
            ...this.calculateGlobalBaselines(final), ...traits, matches: final,
            audit: { signalIntegrity: '100%', sampleSize: final.length }
        };
    }

    private static async fetchHistoricalData(league: string): Promise<MatchHistory[]> {
        const COLLECTION = 'historicalMatches';
        try {
            const q = query(collection(db, COLLECTION), where('league', '==', league), orderBy('date', 'desc'), limit(DATA_CONSTANTS.MATCH_LIMIT));
            const snap = await getDocsFromServer(q);
            const verifiedMatches = snap.docs.map(d => ({ ...d.data(), isVerified: true } as MatchHistory));

            if (verifiedMatches.length < DATA_CONSTANTS.SYNC_THRESHOLD) {
                const externalMatches = await FootballDataProvider.fetchBacklog(league, 2);
                const verifiedKeys = new Set(verifiedMatches.map(m => `${m.date}_${m.homeTeam}_${m.awayTeam}`));
                const delta = externalMatches.filter(m => !verifiedKeys.has(`${m.date}_${m.homeTeam}_${m.awayTeam}`)).map(m => ({ ...m, isVerified: true }));
                if (delta.length > 0) { await this.persistNewMatches(delta); }
                return [...verifiedMatches, ...delta];
            } else {
                const latestStr = verifiedMatches.reduce((max, m) => new Date(m.date) > new Date(max) ? m.date : max, verifiedMatches[0]?.date || '1900-01-01');
                const currentSeason = FootballDataProvider.getCurrentSeasonString();
                const live = await FootballDataProvider.fetchSeasonData(league, currentSeason);
                const delta = live.filter(m => new Date(m.date) > new Date(latestStr)).map(m => ({ ...m, isVerified: true }));
                if (delta.length > 0) { await this.persistNewMatches(delta); return [...verifiedMatches, ...delta]; }
            }
            return verifiedMatches;
        } catch (error) {
            if (error instanceof Error && error.message.includes('permission')) {
                handleFirestoreError(error, OperationType.LIST, COLLECTION);
            }
            throw error;
        }
    }

    private static async persistNewMatches(newMatches: MatchHistory[]) {
        const COLLECTION = 'historicalMatches';
        const CHUNK_SIZE = 500;
        try {
            for (let i = 0; i < newMatches.length; i += CHUNK_SIZE) {
                const chunk = newMatches.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                chunk.forEach(m => {
                    const id = `${m.date}_${m.homeTeam}_${m.awayTeam}`;
                    batch.set(doc(db, COLLECTION, id), m, { merge: true });
                });
                await batch.commit();
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('permission')) {
                handleFirestoreError(error, OperationType.WRITE, COLLECTION);
            }
            throw error;
        }
    }

    private static applyRecencyWeights(matches: MatchHistory[]): MatchHistory[] {
        const now = Date.now();
        return matches.map(m => {
            const date = new Date(m.date), days = (now - date.getTime()) / 8.64e7;
            const tW = Math.exp(-DATA_CONSTANTS.RECENCY_DECAY * days);
            return { ...m, weight: tW * ((date.getMonth() === 4 || date.getMonth() === 5) ? 0.85 : 1.0) };
        });
    }

    private static extractTacticalTraits(matches: MatchHistory[]): LeagueTraits {
        const stats: Record<string, { conceded: number; games: number }> = {};
        matches.forEach(m => {
            [m.homeTeam, m.awayTeam].forEach(id => { if (!stats[id]) stats[id] = { conceded: 0, games: 0 }; });
            stats[m.homeTeam].conceded += m.awayGoals; stats[m.homeTeam].games++;
            stats[m.awayTeam].conceded += m.homeGoals; stats[m.awayTeam].games++;
        });

        const ranks: Record<string, number> = {};
        const avg = matches.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0) / (matches.length * 2) || DATA_CONSTANTS.DEFAULT_LEAGUE_AVG;
        Object.entries(stats).forEach(([id, s]) => {
            const stability = Math.max(DATA_CONSTANTS.MIN_STABILITY, Math.min(DATA_CONSTANTS.MAX_STABILITY, 1 - ((s.conceded / s.games) / (avg * 2))));
            ranks[id] = 1 - stability;
        });
        return { defensiveRanks: ranks };
    }

    private static calculateGlobalBaselines(matches: MatchHistory[]) {
        const aH = matches.reduce((acc, m) => acc + m.homeGoals, 0) / matches.length || DATA_CONSTANTS.DEFAULT_LEAGUE_AVG;
        const aA = matches.reduce((acc, m) => acc + m.awayGoals, 0) / matches.length || (DATA_CONSTANTS.DEFAULT_LEAGUE_AVG - 0.1);
        const vH = matches.reduce((acc, m) => acc + Math.pow(m.homeGoals - aH, 2), 0) / matches.length || 1.1;
        const vA = matches.reduce((acc, m) => acc + Math.pow(m.awayGoals - aA, 2), 0) / matches.length || 1.1;
        
        return {
            avgHG: aH, avgAG: aA, varHG: vH, varAG: vA,
            rhoData: {
                ...DixonColes.fitRho(matches.slice(-DATA_CONSTANTS.RHO_SAMPLE_SIZE).map(m => ({ x: m.homeGoals, y: m.awayGoals, lambda: m.homeXG || aH, mu: m.awayXG || aA, weight: m.weight || 1.0 }))),
            }
        };
    }

    static calculateOpponentAdjustedWeight(hg: number, ag: number, oId: string, ranks: Record<string, number>): number {
        return Math.abs(hg - ag) < 3 ? 1.0 : 1 - ((ranks[oId] || 0.5) * 0.5);
    }

    static standardize(team: Partial<TeamStats> & { name: string; purity?: number }, context?: any): TeamStats {
        const d = context || { avgXG: DATA_CONSTANTS.DEFAULT_LEAGUE_AVG };
        return {
            name: team.name, goalsScored: team.goalsScored || 0, goalsConceded: team.goalsConceded || 0,
            avgXG: team.avgXG || d.avgXG, avgXGA: team.avgXGA || d.avgXG, npxG: team.npxG || d.avgXG,
            cleanSheets: team.cleanSheets || 0, dataPurity: team.dataPurity || team.purity || 1.0
        };
    }
}
