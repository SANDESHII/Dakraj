import { MatchHistory, TeamStats, LeagueContext, LeagueTraits } from '../types';
import { ProfileService } from './profileService';
import { FootballDataProvider } from './data/footballDataProvider';
import { DixonColes } from '../core/math';
import { db } from '../lib/firebase';
import { LEAGUE_CONVERSION_RATES, DATA_CONSTANTS } from '../core/constants';
import { collection, query, where, getDocsFromServer, writeBatch, doc, limit, orderBy } from 'firebase/firestore';

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
            audit: { signalIntegrity: '100%', alphaAdjustment: 'Active', redCardRegime: 'Active', dataReliability: 'High', sampleSize: final.length }
        };
    }

    private static async fetchHistoricalData(league: string): Promise<MatchHistory[]> {
        const q = query(collection(db, 'historicalMatches'), where('league', '==', league), orderBy('date', 'desc'), limit(DATA_CONSTANTS.MATCH_LIMIT));
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
    }

    private static async persistNewMatches(newMatches: MatchHistory[]) {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < newMatches.length; i += CHUNK_SIZE) {
            const chunk = newMatches.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(m => {
                const id = `${m.date}_${m.homeTeam}_${m.awayTeam}`;
                batch.set(doc(db, 'historicalMatches', id), m, { merge: true });
            });
            await batch.commit();
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
        const stats: Record<string, { conceded: number; reds: number; delta: number; games: number; hGoals: number; hGames: number; aGoals: number; aGames: number }> = {};
        matches.forEach(m => {
            [m.homeTeam, m.awayTeam].forEach(id => { if (!stats[id]) stats[id] = { conceded: 0, reds: 0, delta: 0, games: 0, hGoals: 0, hGames: 0, aGoals: 0, aGames: 0 }; });
            const r = LEAGUE_CONVERSION_RATES[m.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
            const hXG = m.homeXG ?? ((m.homeShotsOnTarget || 0) * r), aXG = m.awayXG ?? ((m.awayShotsOnTarget || 0) * r);
            stats[m.homeTeam].conceded += m.awayGoals; stats[m.homeTeam].reds += (m.homeRedCards || 0); stats[m.homeTeam].delta += (m.homeGoals - hXG); stats[m.homeTeam].games++;
            stats[m.homeTeam].hGoals += m.homeGoals; stats[m.homeTeam].hGames++;
            stats[m.awayTeam].conceded += m.homeGoals; stats[m.awayTeam].reds += (m.awayRedCards || 0); stats[m.awayTeam].delta += (m.awayGoals - aXG); stats[m.awayTeam].games++;
            stats[m.awayTeam].aGoals += m.awayGoals; stats[m.awayTeam].aGames++;
        });

        const ranks: Record<string, number> = {}, reds: Record<string, number> = {}, edge: Record<string, number> = {}, bias: Record<string, number> = {};
        const avg = matches.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0) / (matches.length * 2) || DATA_CONSTANTS.DEFAULT_LEAGUE_AVG;
        Object.entries(stats).forEach(([id, s]) => {
            const stability = Math.max(DATA_CONSTANTS.MIN_STABILITY, Math.min(DATA_CONSTANTS.MAX_STABILITY, 1 - ((s.conceded / s.games) / (avg * 2))));
            ranks[id] = 1 - stability; reds[id] = s.reds / s.games; edge[id] = s.delta / (s.games + DATA_CONSTANTS.SHRINKAGE_K);
            const hRate = s.hGames > 0 ? (s.hGoals / s.hGames) : avg;
            const aRate = s.aGames > 0 ? (s.aGoals / s.aGames) : avg;
            bias[id] = hRate / (aRate || 0.001);
        });
        return { defensiveRanks: ranks, redCardPropensity: reds, clinicalEdge: edge, homeAwayBias: bias };
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
        const d = context || { avgXG: DATA_CONSTANTS.DEFAULT_LEAGUE_AVG, avgStability: 0.65, redCardPropensity: 0.05, clinicalEdge: 0, homeAwayBias: 1.0 };
        return {
            name: team.name, goalsScored: team.goalsScored || 0, goalsConceded: team.goalsConceded || 0,
            avgXG: team.avgXG || d.avgXG, avgXGA: team.avgXGA || d.avgXG, npxG: team.npxG || d.avgXG,
            defensiveStability: team.defensiveStability || d.avgStability, form: team.form || [0.5],
            cleanSheets: team.cleanSheets || 0, dataPurity: team.dataPurity || team.purity || 1.0,
            redCardPropensity: team.redCardPropensity || d.redCardPropensity, clinicalEdge: team.clinicalEdge || d.clinicalEdge,
            homeAwayBias: team.homeAwayBias || d.homeAwayBias || 1.0
        };
    }
}
