
/**
 * STATIC ARCHETYPE FALLBACKS
 * WARNING: These are hardcoded snapshots (2023/24 baseline).
 * The MatchEngine will attempt to override these dynamically using ArchetypeEngine.compute()
 * if sufficient league data is available.
 */
export const ELITE_TEAMS = ["MAN_CITY", "LIVERPOOL", "ARSENAL", "REAL_MADRID", "BARCELONA", "BAYERN_MUNICH"];
export const STRONG_TEAMS = ["CHELSEA", "TOTTENHAM", "MAN_UTD", "ATLETICO_MADRID", "B_DORTMUND", "INTER_MILAN", "AC_MILAN", "PSG", "LEVERKUSEN", "ASTON_VILLA"];

export const ARCHETYPE_STATS = {
    ELITE: { npxG: 1.95, avgXGA: 0.95, cleanSheets: 0.38 },
    STRONG: { npxG: 1.65, avgXGA: 1.20, cleanSheets: 0.22 },
    STANDARD: { npxG: 1.25, avgXGA: 1.55, cleanSheets: 0.12 }
};
