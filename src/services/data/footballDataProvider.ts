import Papa from 'papaparse';
import { MatchHistory } from '../../types';
import { ProfileService } from '../profileService';
import { fetchWithTimeout, retry } from '../../utils';
import { FOOTBALL_DATA_CONFIG } from '../../core/constants';

export class FootballDataProvider {
    static sanitize(v: string | number | null | undefined): number {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        const p = parseFloat(String(v).replace(/%/g, '').replace(/[^0-9.-]/g, ''));
        return isNaN(p) ? 0 : p;
    }

    static validateMatch(row: Record<string, any>, league: string): MatchHistory | null {
        const home = ProfileService.canonicalize(row.homeTeam || row.HomeTeam).id;
        const away = ProfileService.canonicalize(row.awayTeam || row.AwayTeam).id;
        const date = row.date || row.Date;
        if (!home || !away || !date) return null;

        const hg = this.sanitize(row.homeGoals ?? row.FTHG), ag = this.sanitize(row.awayGoals ?? row.FTAG);
        const hst = this.sanitize(row.HST ?? row.homeShotsOnTarget), ast = this.sanitize(row.AST ?? row.awayShotsOnTarget);
        if ((hg > 0 && hst === 0) || (ag > 0 && ast === 0) || hg > hst + 1 || ag > ast + 1) return null;

        return {
            homeTeam: home, awayTeam: away, date, homeGoals: hg, awayGoals: ag,
            homeXG: row.homeXG ? this.sanitize(row.homeXG) : undefined,
            awayXG: row.awayXG ? this.sanitize(row.awayXG) : undefined,
            homeShotsOnTarget: hst, awayShotsOnTarget: ast,
            homeRedCards: this.sanitize(row.HR ?? row.homeRedCards),
            awayRedCards: this.sanitize(row.AR ?? row.awayRedCards),
            league
        };
    }

    static normalizeLeague(league: string): string {
        const l = (league || '').toUpperCase().trim();
        if (l.includes('PREMIER') || l === 'EPL' || l === 'E0') return 'EPL';
        if (l.includes('LIGA') || l === 'SP1') return 'LA_LIGA';
        if (l.includes('SERIE') || l === 'I1') return 'SERIE_A';
        if (l.includes('BUNDES') || l === 'D1') return 'BUNDESLIGA';
        if (l.includes('LIGUE') || l === 'F1') return 'LIGUE_1';
        if (l.includes('CHAMPIONS LEAGUE') || l === 'UCL' || l.includes('UCL')) return 'UCL';
        return l;
    }

    static async fetchSeasonData(league: string, season: string): Promise<MatchHistory[]> {
        const normalized = this.normalizeLeague(league);
        const code = FOOTBALL_DATA_CONFIG.LEAGUE_MAP[normalized];
        if (!code) return [];
        const url = `${FOOTBALL_DATA_CONFIG.BASE_URL}/${season.replace('/', '')}/${code}.csv`;
        try {
            return await retry(async () => {
                const res = await fetchWithTimeout(url);
                if (!res.ok) return [];
                const parsed = Papa.parse(await res.text(), { header: true, skipEmptyLines: true });
                return parsed.data.map(r => this.validateMatch(r as Record<string, any>, league)).filter((r): r is MatchHistory => r !== null);
            });
        } catch { return []; }
    }

    static getBacklogSeasonStrings(count: number): string[] {
        const yr = new Date().getFullYear();
        return Array.from({ length: count }, (_, i) => {
            const y = yr - i - 1;
            return `${String(y).slice(-2)}${String(y + 1).slice(-2)}`;
        });
    }

    static getCurrentSeasonString(): string {
        const now = new Date();
        const year = now.getFullYear();
        // If we are in July or later, the "current" season is the one that just started (e.g. 2425 in Aug 2024)
        if (now.getMonth() >= 6) { // 0-indexed, 6 is July
            return `${String(year).slice(-2)}${String(year + 1).slice(-2)}`;
        }
        return `${String(year - 1).slice(-2)}${String(year).slice(-2)}`;
    }

    static async fetchBacklog(league: string, count = 5): Promise<MatchHistory[]> {
        const seasons = this.getBacklogSeasonStrings(count);
        // Include the current season in the backlog if we are in it
        const current = this.getCurrentSeasonString();
        if (!seasons.includes(current)) seasons.unshift(current);
        
        const res = await Promise.all(seasons.map(s => this.fetchSeasonData(league, s)));
        return res.flat();
    }
}
