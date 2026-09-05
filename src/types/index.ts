export interface TeamStats { name:string; goalsScored:number; goalsConceded:number; avgXG:number; avgXGA:number; npxG:number; cleanSheets:number; dataPurity:number; }
export interface TeamStyleProfile { teamId:string; ppda:number; possessionFinalThird:number; purity:number; }
export interface MatchIntel {
    injuries: { team: string; player: string; status: string; impact: string }[];
    tacticalNews: string[];
    lineupRumors: { team: string; predictedLineup: string[] }[];
    weatherImpact: string;
    marketSentiment: string;
}
export interface Citation { source:string; url:string; value:number; timestamp:string; }
export interface MatchContext { homeStyle?:TeamStyleProfile; awayStyle?:TeamStyleProfile; league?:string; homeSeasonXG?:number; awaySeasonXG?:number; homeSeasonXGA?:number; awaySeasonXGA?:number; date?:string; marketOdds?:{ pinnacleOver15?:number; pinnacleUnder15?:number; pinnacleUnder35?:number; pinnacleOver35?:number; }; groundingLog?:{ citations:Citation[]; varianceAlerts:string[]; }; audit?:{ signalIntegrity:string; sampleSize:number; }; intel?: MatchIntel; }
export interface MatchHistory { homeTeam:string; awayTeam:string; homeGoals:number; awayGoals:number; homeXG?:number; awayXG?:number; homeShotsOnTarget?:number; awayShotsOnTarget?:number; homeRedCards?:number; awayRedCards?:number; date:string; league?:string; weight?:number; isVerified?: boolean; }
export interface AnalysisResult { probability:number; summary:string; homeStats:TeamStats; awayStats:TeamStats; homeXG:number; awayXG:number; predictionType:'OVER_15'|'UNDER_35'|'NO_BET'; predictionLabel:string; purity:number; signalStrength:number; marketOdds:number; marketImpliedProb:number; edge:number; verdict:'EXECUTE_BET'|'NO_BET'; context:MatchContext; dataSource:'LIVE'|'FALLBACK_STATIC'; }

export interface RhoData {
    rho: number;
    sigmaRho: number;
}

export interface LeagueTraits {
    defensiveRanks: Record<string, number>;
}

export interface LeagueContext extends LeagueTraits {
    avgHG: number;
    avgAG: number;
    varHG: number;
    varAG: number;
    rhoData: RhoData;
    matches: MatchHistory[];
    audit: {
        signalIntegrity: string;
        sampleSize: number;
    };
}
