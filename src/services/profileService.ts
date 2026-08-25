import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { TeamStyleProfile, MatchHistory } from '../types';
import { LEAGUE_CONVERSION_RATES, DATA_CONSTANTS } from '../core/constants';
import { ELITE_TEAMS, STRONG_TEAMS } from '../core/archetypes';
import { ArchetypeEngine } from '../core/archetypeEngine';

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
        let wGS = 0, wGA = 0, tW = 0, cs = 0, tR = 0, tD = 0;
        rel.forEach(m => {
            const w = (m as any).weight || 1;
            const h = m.homeTeam === id;
            const sc = h ? (m.homeGoals ?? 0) : (m.awayGoals ?? 0);
            const co = h ? (m.awayGoals ?? 0) : (m.homeGoals ?? 0);
            const r = h ? (m.homeRedCards || 0) : (m.awayRedCards || 0);
            const s = h ? (m.homeShotsOnTarget || 0) : (m.awayShotsOnTarget || 0);
            const rate = LEAGUE_CONVERSION_RATES[m.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
            const xG = (h ? m.homeXG : m.awayXG) ?? (s * rate);
            const oXG = (h ? m.awayXG : m.homeXG) ?? ((h ? m.awayShotsOnTarget : m.homeShotsOnTarget) || 0) * rate;
            wGS += xG * w; wGA += oXG * w; tW += w; tR += r; tD += (sc - xG); if (co === 0) cs++;
        });

        // 5. Apply Bayesian Shrinkage (Shrink toward Archetype)
        // K = 10 (Trust the team more after 10 games)
        const K = 10;
        const n = rel.length;
        const purity = Math.min(1, n / 15);
        const totalGoals = history.reduce((a, m) => a + (m.homeGoals ?? 0) + (m.awayGoals ?? 0), 0);
        const lAvg = history.length ? (totalGoals / (history.length * 2)) : DATA_CONSTANTS.DEFAULT_LEAGUE_AVG;

        const blendedXG = (wGS + K * archetype.npxG) / (n + K);
        const blendedXGA = (wGA + K * archetype.avgXGA) / (n + K);
        const blendedCS = (cs + (K / 5) * archetype.cleanSheets) / (n + (K / 5)); // Lower K for noisy CS stat
        
        return { 
            name, 
            npxG: blendedXG, 
            avgXGA: blendedXGA, 
            defensiveStability: Math.max(0.3, Math.min(0.9, 1 - (blendedXGA / (lAvg * 2)))), 
            purity: purity, 
            redCardPropensity: tR / Math.max(1, rel.length), 
            clinicalEdge: tD / (Math.max(1, rel.length) + DATA_CONSTANTS.SHRINKAGE_K),
            form: rel.slice(-5).map(m => {
                const h = m.homeTeam === id;
                const rate = LEAGUE_CONVERSION_RATES[m.league || 'STANDARD'] || LEAGUE_CONVERSION_RATES.STANDARD;
                const tXG = (h ? m.homeXG : m.awayXG) ?? ((h ? m.homeShotsOnTarget : m.awayShotsOnTarget) || 0) * rate;
                const oXG = (h ? m.awayXG : m.homeXG) ?? ((h ? m.awayShotsOnTarget : m.homeShotsOnTarget) || 0) * rate;
                if (tXG > oXG + 0.5) return 1.0;
                if (tXG < oXG - 0.5) return 0.0;
                return 0.5;
            }), 
            cleanSheets: blendedCS
        };
    }

    static async getStyle(id: string): Promise<TeamStyleProfile | null> { const s = await getDoc(doc(db, 'team_style_profiles', id)); return s.exists() ? s.data() as TeamStyleProfile : null; }
    static async saveStyle(p: TeamStyleProfile) { await setDoc(doc(db, 'team_style_profiles', p.teamId), p, { merge: true }); }
}
