export interface TeamStats { name:string; goalsScored:number; goalsConceded:number; avgXG:number; avgXGA:number; npxG:number; defensiveStability:number; form:number[]; cleanSheets:number; dataPurity:number; redCardPropensity:number; clinicalEdge:number; homeAwayBias:number; }
export interface RefereeProfile { name:string; avgCardsPerGame:number; avgPenaltiesPerGame:number; homeWinRate:number; tendency:'STRICT'|'LENIENT'|'AVERAGE'; gamesOfficiated:number; }
export interface TeamStyleProfile { teamId:string; ppda:number; possessionFinalThird:number; purity:number; }
export interface Citation { source:string; url:string; value:number; timestamp:string; }
export interface MatchContext { referee?:RefereeProfile; homeStyle?:TeamStyleProfile; awayStyle?:TeamStyleProfile; league?:string; homeSeasonXG?:number; awaySeasonXG?:number; homeSeasonXGA?:number; awaySeasonXGA?:number; date?:string; marketOdds?:{ pinnacleOver15?:number; pinnacleUnder15?:number; pinnacleUnder35?:number; pinnacleOver35?:number; }; groundingLog?:{ citations:Citation[]; varianceAlerts:string[]; }; audit?:{ signalIntegrity:string; alphaAdjustment:string; redCardRegime:string; dataReliability:string; sampleSize:number; }; }
export interface MatchHistory { homeTeam:string; awayTeam:string; homeGoals:number; awayGoals:number; homeXG?:number; awayXG?:number; homeShotsOnTarget?:number; awayShotsOnTarget?:number; homeRedCards?:number; awayRedCards?:number; date:string; league?:string; weight?:number; isVerified?: boolean; }
export interface AnalysisConfidence { confidenceScore:number; edgeValue:number; groundingCitations?:Citation[]; }
export interface AnalysisResult { probability:number; summary:string; homeStats:TeamStats; awayStats:TeamStats; homeXG:number; awayXG:number; minimumExpectancy:number; potentialCeiling:number; predictionType:'OVER_15'|'UNDER_35'|'NO_BET'; predictionLabel:string; purity:number; signalStrength:number; marketOdds:number; marketImpliedProb:number; edge:number; recommendedStake:number; verdict:'EXECUTE_BET'|'NO_BET'; context:MatchContext; surety:AnalysisConfidence; dataSource:'LIVE'|'FALLBACK_STATIC'; }

export interface RhoData {
    rho: number;
    sigmaRho: number;
}

export interface LeagueTraits {
    defensiveRanks: Record<string, number>;
    redCardPropensity: Record<string, number>;
    clinicalEdge: Record<string, number>;
    homeAwayBias: Record<string, number>;
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
        alphaAdjustment: string;
        redCardRegime: string;
        dataReliability: string;
        sampleSize: number;
    };
}
