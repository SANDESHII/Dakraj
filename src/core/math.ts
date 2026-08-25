export class DixonColes {
    static poisson(k:number, l:number):number { if (l <= 0) return k === 0 ? 1 : 0; if (k < 0) return 0; let logFact = 0; for (let i = 2; i <= k; i++) logFact += Math.log(i); return Math.exp(k * Math.log(l) - l - logFact); }
    static tau(x:number, y:number, l:number, m:number, r:number):number { let v = 1; if (x === 0 && y === 0) v = 1 - (l * m * r); else if (x === 0 && y === 1) v = 1 + (l * r); else if (x === 1 && y === 0) v = 1 + (m * r); else if (x === 1 && y === 1) v = 1 - r; return Math.max(0.0001, v); }
    static applyOverdispersion(lambda: number, mu: number, phi: number = 1.5): { l: number, m: number } {
        // Inflates variance slightly to account for unpredictable high-scoring blowouts
        // phi = 1.5 is a standard empirical starting point for football totals
        const lAdj = lambda * (1 + (lambda / phi));
        const mAdj = mu * (1 + (mu / phi));
        return { l: lAdj, m: mAdj };
    }

    static calculateScoreMatrix(hL:number, aM:number, r:number = -0.11, max:number = 8):number[][] { 
        const adj = this.applyOverdispersion(hL, aM);
        const m = Array.from({ length: max + 1 }, (_, h) => 
            Array.from({ length: max + 1 }, (_, a) => 
                this.poisson(h, adj.l) * this.poisson(a, adj.m) * this.tau(h, a, adj.l, adj.m, r)
            )
        ); 
        const s = m.reduce((acc, row) => acc + row.reduce((ra, p) => ra + p, 0), 0);
        return m.map(row => row.map(p => p / (s || 1)));
    }
    static calculateOverUnder(m:number[][], t:number):number { return m.reduce((acc, row, h) => acc + row.reduce((ra, p, a) => ra + (h + a > t ? p : 0), 0), 0); }
    static fitRho(matches:{x:number, y:number, lambda:number, mu:number, weight?:number}[]):{rho:number, sigmaRho:number} {
        let r = -0.11, fC = 0;
        for (let i = 0; i < 50; i++) {
            let g = 0, c = 0;
            for (const { x, y, lambda: l, mu: m, weight = 1.0 } of matches) {
                const t = this.tau(x, y, l, m, r); let d1 = 0, d2 = 0;
                if (x === 0 && y === 0) { d1 = -l * m / t; d2 = -Math.pow(l * m, 2) / (t * t); } else if (x === 0 && y === 1) { d1 = l / t; d2 = -(l * l) / (t * t); } else if (x === 1 && y === 0) { d1 = m / t; d2 = -(m * m) / (t * t); } else if (x === 1 && y === 1) { d1 = -1 / t; d2 = -1 / (t * t); }
                g += (d1 * weight); c += (d2 * weight);
            }
            fC = c; if (Math.abs(c) < 1e-10) break; const delta = g / c; r = Math.max(-0.25, Math.min(0.25, r - delta)); if (Math.abs(delta) < 1e-6) break;
        }
        return { rho: r, sigmaRho: fC < 0 ? Math.sqrt(-1 / fC) : 0.05 };
    }

    static calculateOver15Probability(matrix: number[][]): number {
        // Over 1.5 is simply 1 minus the probability of 0-0, 1-0, and 0-1
        const p00 = matrix[0][0];
        const p10 = matrix[1][0];
        const p01 = matrix[0][1];
        return 1 - (p00 + p10 + p01);
    }

    static calculateUnder35Probability(matrix: number[][]): number {
        // Sum all cells where home + away goals <= 3
        let prob = 0;
        for (let h = 0; h <= 3; h++) {
            for (let a = 0; a <= (3 - h); a++) {
                prob += matrix[h][a];
            }
        }
        return prob;
    }
}

