export class DixonColes {
    // Poisson PMF with log-factorial for numerical stability
    static poisson(k: number, lambda: number): number {
        if (lambda <= 0) return k === 0 ? 1 : 0;
        if (k < 0) return 0;
        let logFact = 0;
        for (let i = 2; i <= k; i++) logFact += Math.log(i);
        return Math.exp(k * Math.log(lambda) - lambda - logFact);
    }

    // Dixon-Coles tau adjustment for low-scoring outcomes (CRITICAL for Over 1.5)
    static tau(x: number, y: number, l: number, m: number, r: number): number {
        let v = 1;
        if (x === 0 && y === 0) v = 1 - (l * m * r);
        else if (x === 0 && y === 1) v = 1 + (l * r);
        else if (x === 1 && y === 0) v = 1 + (m * r);
        else if (x === 1 && y === 1) v = 1 - r;
        return Math.max(0.0001, v);
    }

    // Build the full 9x9 score probability matrix
    static calculateScoreMatrix(hL: number, aM: number, r: number = -0.11, max: number = 8): number[][] {
        const m = Array.from({ length: max + 1 }, (_, h) =>
            Array.from({ length: max + 1 }, (_, a) =>
                this.poisson(h, hL) * this.poisson(a, aM) * this.tau(h, a, hL, aM, r)
            )
        );
        const s = m.reduce((acc, row) => acc + row.reduce((ra, p) => ra + p, 0), 0);
        return m.map(row => row.map(p => p / (s || 1)));
    }

    // DIRECT: Over 1.5 probability (no Monte Carlo nonsense)
    static calculateOver15Probability(matrix: number[][]): number {
        const p00 = matrix[0][0];
        const p10 = matrix[1][0];
        const p01 = matrix[0][1];
        return 1 - (p00 + p10 + p01);
    }

    // DIRECT: Under 3.5 probability (no Monte Carlo nonsense)
    static calculateUnder35Probability(matrix: number[][]): number {
        let prob = 0;
        for (let h = 0; h <= 3; h++) {
            for (let a = 0; a <= (3 - h); a++) {
                prob += matrix[h][a];
            }
        }
        return prob;
    }

    // Fit rho parameter via maximum likelihood estimation
    static fitRho(matches: { x: number; y: number; lambda: number; mu: number; weight?: number }[]): { rho: number; sigmaRho: number } {
        let r = -0.11, fC = 0;
        for (let i = 0; i < 50; i++) {
            let g = 0, c = 0;
            for (const { x, y, lambda: l, mu: m, weight = 1.0 } of matches) {
                const t = this.tau(x, y, l, m, r);
                let d1 = 0, d2 = 0;
                if (x === 0 && y === 0) { d1 = -l * m / t; d2 = -Math.pow(l * m, 2) / (t * t); }
                else if (x === 0 && y === 1) { d1 = l / t; d2 = -(l * l) / (t * t); }
                else if (x === 1 && y === 0) { d1 = m / t; d2 = -(m * m) / (t * t); }
                else if (x === 1 && y === 1) { d1 = -1 / t; d2 = -1 / (t * t); }
                g += d1 * weight;
                c += d2 * weight;
            }
            fC = c;
            if (Math.abs(c) < 1e-10) break;
            const delta = g / c;
            r = Math.max(-0.25, Math.min(0.25, r - delta));
            if (Math.abs(delta) < 1e-6) break;
        }
        return { rho: r, sigmaRho: fC < 0 ? Math.sqrt(-1 / fC) : 0.05 };
    }
}


