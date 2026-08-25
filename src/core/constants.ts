
export const LEAGUE_CONVERSION_RATES: Record<string, number> = { 'EPL': 0.33, 'LA_LIGA': 0.31, 'SERIE_A': 0.29, 'BUNDESLIGA': 0.35, 'LIGUE_1': 0.30, 'STANDARD': 0.31 };
export const LEAGUE_CONFIGS: Record<string, { goalRate: number; homeAdvantage: number }> = { 'EPL': { goalRate: 1.02, homeAdvantage: 0.28 }, 'LA_LIGA': { goalRate: 0.94, homeAdvantage: 0.32 }, 'SERIE_A': { goalRate: 0.98, homeAdvantage: 0.26 }, 'BUNDESLIGA': { goalRate: 1.12, homeAdvantage: 0.24 }, 'LIGUE_1': { goalRate: 0.92, homeAdvantage: 0.30 }, 'STANDARD': { goalRate: 1.0, homeAdvantage: 0.25 } };
export const FOOTBALL_DATA_CONFIG = { BASE_URL: 'https://www.football-data.co.uk/mmz4281', LEAGUE_MAP: { 'EPL': 'E0', 'LA_LIGA': 'SP1', 'SERIE_A': 'I1', 'BUNDESLIGA': 'D1', 'LIGUE_1': 'F1' } as Record<string, string> };
export const BACKTEST_CONFIG = { SEGMENTS: [{ segment: 'Low Edge (0-3%)', min: 0, max: 3, count: 0, hits: 0 }, { segment: 'Mid Edge (3-7%)', min: 3, max: 7, count: 0, hits: 0 }, { segment: 'High Edge (7%+)', min: 7, max: 100, count: 0, hits: 0 }], SAMPLE_SIZE: 150 };
export const FATIGUE_CONFIG = { DISTANCE_THRESHOLD: 1000, DECAY_SCALE: 200, MAX_PENALTY: 0.02, FLOOR: 0.98 };
export const DATA_CONSTANTS = { SHRINKAGE_K: 12, DEFAULT_LEAGUE_AVG: 1.35, MIN_STABILITY: 0.1, MAX_STABILITY: 0.9, RECENCY_DECAY: 0.00385, MATCH_LIMIT: 2000, SYNC_THRESHOLD: 200, RHO_SAMPLE_SIZE: 500, MOMENTUM_CAP: 0.2 };
export const BAYESIAN_CONFIG = { BASE_TRUST: 0.23, PURITY_SCALE: 0.4 }; // Calibrated via grid search on EPL data
export const ELITE_LEAGUES = ['EPL', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A', 'LIGUE_1', 'UCL'];
export const LOADING_MESSAGES = [
    "Initializing Stochastic Engine...", "Ingesting De-Censored Data...", "Modeling Tail-Risk Variance...",
    "Sampling Overdispersion...", "Projecting Clinical Edge...", "Finalizing Neural Signal..."
];

