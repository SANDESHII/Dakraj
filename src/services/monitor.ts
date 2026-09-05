import { Logger } from './logger';

interface ScrapeStats {
    total: number;
    success: number;
    failed: number;
    blocked: number;
    lastHour: { time: number; status: string }[];
}

export class Monitor {
    private static stats: Record<string, ScrapeStats> = {};
    private static readonly ALERT_THRESHOLD = 0.7;
    private static lastAlert = 0;
    private static readonly ALERT_COOLDOWN = 30 * 60 * 1000;

    static recordScrape(endpoint: string, status: 'success' | 'failed' | 'blocked', duration: number) {
        if (!this.stats[endpoint]) {
            this.stats[endpoint] = { total: 0, success: 0, failed: 0, blocked: 0, lastHour: [] };
        }
        const s = this.stats[endpoint];
        s.total++;
        s[status]++;
        s.lastHour.push({ time: Date.now(), status });
        const oneHourAgo = Date.now() - 3600000;
        s.lastHour = s.lastHour.filter(e => e.time > oneHourAgo);
        Logger.scrape(endpoint, status, duration);
        this.checkAlert(endpoint, s);
    }

    private static checkAlert(endpoint: string, stats: ScrapeStats) {
        const recentTotal = stats.lastHour.length;
        if (recentTotal < 5) return;
        const recentSuccess = stats.lastHour.filter(e => e.status === 'success').length;
        const successRate = recentSuccess / recentTotal;
        if (successRate < this.ALERT_THRESHOLD && Date.now() - this.lastAlert > this.ALERT_COOLDOWN) {
            const msg = `[ALERT] Scrape success rate for ${endpoint} dropped to ${(successRate * 100).toFixed(1)}% (${recentSuccess}/${recentTotal} in last hour)`;
            Logger.error('MONITOR', msg);
            console.error(`🚨 ${msg}`);
            this.lastAlert = Date.now();
            this.sendWebhookAlert(msg);
        }
    }

    private static async sendWebhookAlert(message: string) {
        const webhookUrl = process.env.ALERT_WEBHOOK_URL;
        if (!webhookUrl) return;
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: message })
            });
        } catch {}
    }

    static getStats() {
        const result: Record<string, any> = {};
        for (const [endpoint, stats] of Object.entries(this.stats)) {
            const recentTotal = stats.lastHour.length;
            const recentSuccess = stats.lastHour.filter(e => e.status === 'success').length;
            result[endpoint] = {
                total: stats.total,
                success: stats.success,
                failed: stats.failed,
                blocked: stats.blocked,
                successRate: stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) + '%' : 'N/A',
                lastHourRate: recentTotal > 0 ? ((recentSuccess / recentTotal) * 100).toFixed(1) + '%' : 'N/A',
                lastHourRequests: recentTotal
            };
        }
        return result;
    }
}
