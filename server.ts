import express from "express"; import path from "path"; import { createServer as createViteServer } from "vite"; import { DataService } from "./src/services/dataService";
import { performAnalysis } from "./src/services/geminiService";
import { ScapegraphService } from "./src/services/scapegraphService";
import { DataQuality } from "./src/services/dataQuality";
import { ProxyService } from "./src/services/proxy";
import { Logger } from "./src/services/logger";
import { Monitor } from "./src/services/monitor";
import rateLimit from "express-rate-limit";

async function startServer() {
  const app = express(), PORT = 3000; 
  app.set('trust proxy', 1);
  app.use(express.json());
  
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: "Tactical override: Rate limit exceeded to protect quotas." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const auth = (req: any, res: any, next: any) => {
    const key = req.headers['x-api-key'];
    const expected = process.env.INTERNAL_API_KEY || process.env.VITE_INTERNAL_API_KEY;
    if (expected && key !== expected) {
      return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }
    next();
  };

  app.get("/api/health", (_, res) => res.json({ status: "ok" }));
  
  // Protected Routes
  app.post("/api/ingest", auth, async (req, res) => { try { const { league } = req.body; const { matches } = await DataService.getLeagueContext(league || 'EPL'); res.json({ success: true, count: matches.length }); } catch (e) { res.status(500).json({ error: "Sync Failed" }); } });
  app.post("/api/analyze", limiter, auth, async (req, res) => { try { res.json(await performAnalysis(req.body)); } catch (e: any) { res.status(500).json({ error: e.message }); } });
  app.post("/api/intel", limiter, auth, async (req, res) => { try { res.json(await ScapegraphService.getMatchIntel(req.body)); } catch (e: any) { res.status(500).json({ error: e.message }); } });
  
  app.post("/api/scrape/history", auth, async (req, res) => {
      try {
          const { league, season } = req.body;
          const matches = await ScapegraphService.scrapeHistoricalMatches(league || 'EPL', season);
          res.json({ success: true, count: matches.length, matches });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/xg", auth, async (req, res) => {
      try {
          const { team, league } = req.body;
          const xg = await ScapegraphService.getTeamXG(team, league || 'EPL');
          res.json({ success: true, data: xg });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/standings", auth, async (req, res) => {
      try {
          const { league } = req.body;
          const standings = await ScapegraphService.getLeagueStandings(league || 'EPL');
          res.json({ success: true, count: standings.length, standings });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/odds", auth, async (req, res) => {
      try {
          const { homeTeam, awayTeam, league } = req.body;
          const odds = await ScapegraphService.getMarketOdds(homeTeam, awayTeam, league || 'EPL');
          res.json({ success: true, count: odds.length, odds });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/fixtures", auth, async (req, res) => {
      try {
          const { league } = req.body;
          const fixtures = await ScapegraphService.getUpcomingFixtures(league || 'EPL');
          res.json({ success: true, count: fixtures.length, fixtures });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/form", auth, async (req, res) => {
      try {
          const { team, league } = req.body;
          const form = await ScapegraphService.getTeamForm(team, league || 'EPL');
          res.json({ success: true, count: form.length, form });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/context", auth, async (req, res) => {
      try {
          const { homeTeam, awayTeam, homeSlug, awaySlug, league } = req.body;
          const context = await ScapegraphService.getFullMatchContext(homeTeam, awayTeam, homeSlug, awaySlug, league || 'EPL');
          res.json({ success: true, ...context });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scrape/quality", auth, async (req, res) => {
      try {
          const { homeTeam, awayTeam, homeSlug, awaySlug, league, kickoff } = req.body;
          const ctx = await ScapegraphService.getFullMatchContext(homeTeam, awayTeam, homeSlug, awaySlug, league || 'EPL');
          const report = DataQuality.validate(ctx.intel, ctx.homeXG, ctx.awayXG, ctx.odds, ctx.homeForm, ctx.awayForm, kickoff);
          res.json({ success: true, report });
      } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/proxy/stats", auth, (_req, res) => {
      res.json(ProxyService.getStats());
  });

  app.get("/api/logs", auth, (req, res) => {
      const lines = parseInt(req.query.lines as string) || 50;
      res.json({ success: true, logs: Logger.getRecentLogs(lines) });
  });

  app.get("/api/monitor/stats", auth, (_req, res) => {
      res.json({ success: true, stats: Monitor.getStats() });
  });

  app.post("/api/system/reset", auth, async (_req, res) => {
      try {
          // 1. Clear Logs
          Logger.clearLogs();
          // 2. Clear Monitor Stats
          Monitor.reset();
          // 3. Clear Cache and Profiles (Firestore)
          await DataService.clearAllData();
          
          res.json({ success: true, message: "System purged. Forensic slate is clean." });
      } catch (e: any) {
          res.status(500).json({ error: e.message });
      }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" }); app.use(vite.middlewares);
    app.get("*all", async (req, res, next) => { if (req.url.startsWith("/api")) return next(); try { const fs = await import("fs"), html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8"), content = await vite.transformIndexHtml(req.url, html); res.status(200).set({ "Content-Type": "text/html" }).end(content); } catch (e) { vite.ssrFixStacktrace(e as Error); next(e); } });
  } else {
    const d = path.join(process.cwd(), "dist"); app.use(express.static(d)); app.get("*all", (_, res) => res.sendFile(path.join(d, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`[SERVER] active on port ${PORT}`));
}
startServer().catch(e => { console.error(e); process.exit(1); });
