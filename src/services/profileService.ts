import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { TeamStyleProfile, MatchHistory } from '../types';
import { LEAGUE_CONVERSION_RATES } from '../core/constants';
import { ELITE_TEAMS, STRONG_TEAMS } from '../core/archetypes';
import { ArchetypeEngine } from '../core/archetypeEngine';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export class ProfileService {
    private static readonly MAP: Record<string, string[]> = {
        "MAN_CITY": ["Man City", "Manchester City", "Man City FC"], "MAN_UTD": ["Man United", "Manchester United", "Man Utd", "Man Utd FC"],
        "LIVERPOOL": ["Liverpool", "Liverpool FC"], "ARSENAL": ["Arsenal", "Arsenal FC"], "CHELSEA": ["Chelsea", "Chelsea FC"],
        "TOTTENHAM": ["Tottenham", "Spurs", "Tottenham Hotspur"], "BARCELONA": ["Barcelona", "FC Barcelona", "Barca"], "REAL_MADRID": ["Real Madrid", "Real Madrid CF"], "BAYERN_MUNICH": ["Bayern Munich", "FC Bayern"]
    };
    static canonicalize(name: string) {
        if (!name) return { id: "UNKNOWN", isMapped: false };
        const n = name.trim().toLowerCase();
        for (const [id, al] of Object.entries(this.MAP)) if (id.toLowerCase() === n || al.some(a => a.toLowerCase() === n)) return { id, isMapped: true };
        return { id: name.toUpperCase().replace(/\s+/g, '_'), isMapped: false };
    }
    static getDisplayName(id: string) { return this.MAP[id]?.[0] || id; }
    static computeBaseline(name: string, matches: MatchHistory[], asOfDate?: string) {
        const { id } = this.canonicalize(name);
        const history = asOfDate ? matches.filter(m => new Date(m.date) < new Date(asOfDate)) : matches;
        const rel = history.filter(m => {
            const hId = this.canonicalize(m.homeTeam).id;
            const aId = this.canonicalize(m.awayTeam).id;
            return hId === id || aId === id;
        });

        // 1. Compute Dynamic Archetypes from the current dataset
        const dyn = ArchetypeEngine.compute(history);

        // 2. Identify the team's ranking score
        const teamScores: Record<string, number> = {};
        history.forEach(m => {
            const hId = this.canonicalize(m.homeTeam).id, aId = this.canonicalize(m.awayTeam).id;
            const r = LEAGUE_CONVERSION_RATES[m.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
            const hXG = m.homeXG ?? ((m.homeShotsOnTarget || 0) * r);
            const aXG = m.awayXG ?? ((m.awayShotsOnTarget || 0) * r);
            if (!teamScores[hId]) teamScores[hId] = 0; if (!teamScores[aId]) teamScores[aId] = 0;
            teamScores[hId] += (hXG - aXG); teamScores[aId] += (aXG - hXG);
        });
        
        const statsArr = Object.entries(teamScores).map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
        const rank = statsArr.findIndex(s => s.id === id);
        const total = statsArr.length;
        
        // 3. Select Archetype Tier
        let archetype = dyn.STANDARD;
        if (rank !== -1 && total > 0) {
            const pct = rank / total;
            archetype = pct <= 0.1 ? dyn.ELITE : (pct <= 0.3 ? dyn.STRONG : dyn.STANDARD);
        } else {
            const e = ELITE_TEAMS.includes(id), s = STRONG_TEAMS.includes(id);
            archetype = e ? dyn.ELITE : (s ? dyn.STRONG : dyn.STANDARD);
        }

        // 4. Calculate Empirical Stats from specific history
        let wGS = 0, wGA = 0, tW = 0, cs = 0;
        rel.forEach(m => {
            const w = (m as any).weight || 1;
            const h = m.homeTeam === id;
            const co = h ? (m.awayGoals || 0) : (m.homeGoals || 0);
            const s = h ? (m.homeShotsOnTarget || 0) : (m.awayShotsOnTarget || 0);
            const rate = LEAGUE_CONVERSION_RATES[m.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
            const xG = (h ? m.homeXG : m.awayXG) ?? (s * rate);
            const oXG = (h ? m.awayXG : m.homeXG) ?? ((h ? m.awayShotsOnTarget : m.homeShotsOnTarget) || 0) * rate;
            wGS += xG * w; wGA += oXG * w; tW += w; if (co === 0) cs++;
        });

        // 5. Apply Bayesian Shrinkage (Shrink toward Archetype)
        const K = 10;
        const n = rel.length;
        const purity = Math.min(1, n / 15);

        const blendedXG = (wGS + K * archetype.npxG) / (n + K);
        const blendedXGA = (wGA + K * archetype.avgXGA) / (n + K);
        const blendedCS = (cs + (K / 5) * archetype.cleanSheets) / (n + (K / 5)); 
        
        return { 
            name, 
            npxG: blendedXG, 
            avgXGA: blendedXGA, 
            purity: purity, 
            cleanSheets: blendedCS
        };
    }

    static async getStyle(id: string): Promise<TeamStyleProfile | null> { 
        const COLLECTION = 'team_style_profiles';
        try {
            const s = await getDoc(doc(db, COLLECTION, id)); 
            return s.exists() ? s.data() as TeamStyleProfile : null; 
        } catch (error) {
            if (error instanceof Error && error.message.includes('permission')) {
                handleFirestoreError(error, OperationType.GET, COLLECTION);
            }
            throw error;
        }
    }
    static async saveStyle(p: TeamStyleProfile) { 
        const COLLECTION = 'team_style_profiles';
        try {
            await setDoc(doc(db, COLLECTION, p.teamId), p, { merge: true }); 
        } catch (error) {
            if (error instanceof Error && error.message.includes('permission')) {
                handleFirestoreError(error, OperationType.WRITE, COLLECTION);
            }
            throw error;
        }
    }
}
