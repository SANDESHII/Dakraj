import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { RefereeProfile } from '../types';

const VERIFIED_REGISTRY: Record<string, RefereeProfile> = {
    'MICHAEL_OLIVER': { name: 'Michael Oliver', avgCardsPerGame: 3.5, avgPenaltiesPerGame: 0.2, homeWinRate: 0.48, tendency: 'AVERAGE', gamesOfficiated: 120 },
    'ANTHONY_TAYLOR': { name: 'Anthony Taylor', avgCardsPerGame: 3.8, avgPenaltiesPerGame: 0.25, homeWinRate: 0.44, tendency: 'STRICT', gamesOfficiated: 115 },
    'PAUL_TIERNEY': { name: 'Paul Tierney', avgCardsPerGame: 3.7, avgPenaltiesPerGame: 0.15, homeWinRate: 0.46, tendency: 'AVERAGE', gamesOfficiated: 98 },
    'SIMON_HOOPER': { name: 'Simon Hooper', avgCardsPerGame: 4.2, avgPenaltiesPerGame: 0.1, homeWinRate: 0.42, tendency: 'STRICT', gamesOfficiated: 85 },
    'ROBERT_JONES': { name: 'Robert Jones', avgCardsPerGame: 4.5, avgPenaltiesPerGame: 0.25, homeWinRate: 0.40, tendency: 'STRICT', gamesOfficiated: 72 },
    'STUART_ATTWELL': { name: 'Stuart Attwell', avgCardsPerGame: 3.6, avgPenaltiesPerGame: 0.2, homeWinRate: 0.45, tendency: 'AVERAGE', gamesOfficiated: 105 },
    'CHRIS_KAVANAGH': { name: 'Chris Kavanagh', avgCardsPerGame: 3.4, avgPenaltiesPerGame: 0.12, homeWinRate: 0.47, tendency: 'LENIENT', gamesOfficiated: 88 },
    'JARRED_GILLETT': { name: 'Jarred Gillett', avgCardsPerGame: 4.0, avgPenaltiesPerGame: 0.18, homeWinRate: 0.43, tendency: 'AVERAGE', gamesOfficiated: 65 }
};

const LEAGUE_BASELINES: Record<string, RefereeProfile> = {
    'EPL': { name: 'EPL Baseline', avgCardsPerGame: 3.8, avgPenaltiesPerGame: 0.21, homeWinRate: 0.45, tendency: 'AVERAGE', gamesOfficiated: 500 },
    'DEFAULT': { name: 'Global Baseline', avgCardsPerGame: 4.0, avgPenaltiesPerGame: 0.23, homeWinRate: 0.45, tendency: 'AVERAGE', gamesOfficiated: 500 }
};

export class RefereeService {
    static async getRefereeStats(name: string, league: string = 'EPL'): Promise<RefereeProfile> {
        if (!name) return LEAGUE_BASELINES[league] || LEAGUE_BASELINES.DEFAULT;

        const id = name.toUpperCase().replace(/\s+/g, '_');
        
        // 1. Check Verified Registry (Static)
        if (VERIFIED_REGISTRY[id]) {
            return VERIFIED_REGISTRY[id];
        }

        // 2. Check Firestore (Verified History Cache)
        try {
            const refDoc = await getDoc(doc(db, 'referee_profiles', id));
            if (refDoc.exists()) {
                return refDoc.data() as RefereeProfile;
            }
        } catch (error) {
            console.error('Referee lookup failed:', error);
        }

        // 3. Fallback to League Baseline (Safety Rail)
        return {
            ...(LEAGUE_BASELINES[league] || LEAGUE_BASELINES.DEFAULT),
            name: `${name} (Estimated)`
        };
    }

    static async syncRefereeProfile(p: RefereeProfile) {
        // This would be used when we have a verified source to update the Firestore cache
        const id = p.name.toUpperCase().replace(/\s+/g, '_');
        // Only allow syncing if it's not already in the hardcoded registry to prevent tampering
        if (!VERIFIED_REGISTRY[id]) {
            // Logic to save to Firestore would go here
        }
    }
}
