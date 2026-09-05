
const PROXY_SERVICE = process.env.PROXY_SERVICE || 'scraperapi';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

export class ProxyService {
    private static requestCount = 0;
    private static lastReset = Date.now();
    private static readonly DAILY_LIMIT = 4500;

    static getProxiedUrl(url: string): string {
        if (!SCRAPER_API_KEY) {
            console.warn('[PROXY] No SCRAPER_API_KEY configured — using direct URL');
            return url;
        }

        this.requestCount++;
        if (Date.now() - this.lastReset > 86400000) {
            this.requestCount = 1;
            this.lastReset = Date.now();
        }

        if (this.requestCount > this.DAILY_LIMIT) {
            console.error('[PROXY] Daily limit reached — returning direct URL');
            return url;
        }

        console.log(`[PROXY] Request ${this.requestCount}/${this.DAILY_LIMIT} via ${PROXY_SERVICE}`);
        return `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true`;
    }

    static getStats() {
        return {
            requestsToday: this.requestCount,
            limit: this.DAILY_LIMIT,
            remaining: this.DAILY_LIMIT - this.requestCount,
            resetIn: Math.max(0, 86400000 - (Date.now() - this.lastReset))
        };
    }
}
