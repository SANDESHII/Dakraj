import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const getLogFile = () => path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);

const write = (level: string, tag: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] [${tag}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}\n`;
    if (level === 'ERROR') console.error(logLine.trim());
    else if (level === 'WARN') console.warn(logLine.trim());
    else console.log(logLine.trim());
    try { fs.appendFileSync(getLogFile(), logLine); } catch {}
};

export class Logger {
    static info(tag: string, message: string, data?: any) { write('INFO', tag, message, data); }
    static warn(tag: string, message: string, data?: any) { write('WARN', tag, message, data); }
    static error(tag: string, message: string, data?: any) { write('ERROR', tag, message, data); }
    static scrape(url: string, status: 'success' | 'failed' | 'blocked', duration: number) {
        write('SCRAPE', 'SGAI', `${status.toUpperCase()} ${url} (${duration}ms)`);
    }
    static prediction(match: string, quality: string, confidence: number) {
        write('PREDICT', 'ENGINE', `${match} | Quality: ${quality} | Confidence: ${confidence}%`);
    }
    static getRecentLogs(lines: number = 50): string[] {
        try {
            const content = fs.readFileSync(getLogFile(), 'utf-8');
            return content.split('\n').filter(Boolean).slice(-lines);
        } catch { return ['No logs found for today']; }
    }
}
