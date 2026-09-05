import { DataQualityReport, MatchIntel, TeamXGData, MatchOdds, ScrapedHistoricalMatch } from '../types';

export class DataQuality {
    static validate(
        intel: MatchIntel | null,
        homeXG: TeamXGData | null,
        awayXG: TeamXGData | null,
        odds: MatchOdds[],
        homeForm: ScrapedHistoricalMatch[],
        awayForm: ScrapedHistoricalMatch[],
        kickoffTime?: string
    ): DataQualityReport {
        const warnings: string[] = [];
        let score = 100;

        // 0. Recency / Kickoff Check
        if (kickoffTime && kickoffTime !== 'UPCOMING') {
            const koDate = new Date(kickoffTime);
            const now = new Date();
            const diffMinutes = (koDate.getTime() - now.getTime()) / (1000 * 60);
            
            if (diffMinutes < 65 && diffMinutes > -100) {
                if (!intel?.lineupRumors || intel.lineupRumors.length === 0) {
                    score -= 15;
                    warnings.push('Match is within the lineup window (<65 mins to KO) but no confirmed lineups were recovered.');
                }
            }
        }

        // 1. Intel Validation
        let intelStatus: 'ok' | 'failed' | 'partial' = 'ok';
        if (!intel || (intel.injuries.length === 0 && intel.tacticalNews.length === 0)) {
            intelStatus = 'failed';
            score -= 30;
            warnings.push('Forensic intelligence extraction failed or returned no meaningful data.');
        } else if (intel.injuries.length > 0 && intel.tacticalNews.length === 0) {
            intelStatus = 'partial';
            score -= 10;
            warnings.push('Tactical intelligence is missing, though injury data was recovered.');
        }

        // 2. xG Data Validation
        let homeXGStatus: 'ok' | 'failed' | 'missing' = 'ok';
        if (!homeXG) {
            homeXGStatus = 'missing';
            score -= 25;
            warnings.push('Home team xG performance data is missing.');
        } else if (homeXG.xG === 0) {
            homeXGStatus = 'failed';
            score -= 15;
            warnings.push('Home team xG data returned zero values, indicating a potential scrape failure.');
        }

        let awayXGStatus: 'ok' | 'failed' | 'missing' = 'ok';
        if (!awayXG) {
            awayXGStatus = 'missing';
            score -= 25;
            warnings.push('Away team xG performance data is missing.');
        } else if (awayXG.xG === 0) {
            awayXGStatus = 'failed';
            score -= 15;
            warnings.push('Away team xG data returned zero values, indicating a potential scrape failure.');
        }

        // 3. Odds Validation
        const oddsCount = odds.length;
        if (oddsCount === 0) {
            score -= 40;
            warnings.push('Betting market odds could not be synchronized.');
        } else if (oddsCount < 3) {
            score -= 10;
            warnings.push('Low betting market density; market consensus may be unreliable.');
        }

        // 4. Form Data Validation
        const hasForm = homeForm.length > 0 && awayForm.length > 0;
        if (!hasForm) {
            score -= 20;
            warnings.push('Recent team form data could not be recovered.');
        }

        // Final Assessment
        let overall: 'CLEAN' | 'DEGRADED' | 'UNRELIABLE' = 'CLEAN';
        if (score < 50) overall = 'UNRELIABLE';
        else if (score < 80) overall = 'DEGRADED';

        return {
            overall,
            confidence: Math.max(0, score),
            shouldProceed: overall !== 'UNRELIABLE',
            warnings,
            metrics: {
                intel: intelStatus,
                homeXG: homeXGStatus,
                awayXG: awayXGStatus,
                oddsCount,
                hasForm
            }
        };
    }
}
