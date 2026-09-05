# Alpha Terminal: Forensic Football Analysis Protocol

Alpha Terminal is an elite quantitative football analysis engine designed to identify market inefficiencies in the **Over 1.5** and **Under 3.5** goal markets. By combining traditional Poisson modeling (Dixon-Coles) with modern expected goals (xG) forensics, it detects structural floors and inevitable outcome ranges.

## 🔬 Core Methodology
- **Dixon-Coles Engine**: Standard Poisson modeling adjusted for low-scoring outcomes (tau correction) and historical recency.
- **Neural xG extraction**: Real-time deep-web scraping via ScrapeGraphAI to extract npxG (non-penalty xG) and xT (expected threat) metrics.
- **Forensic Signal Grounding**: Automated tactical grounding that cross-references quantitative projections with team news, injury reports, and betting market "steam".
- **Bayesian Market Blend**: Intelligent blending of model projections with closing market prices to calculate precise edge (+EV).

## 🛠️ System Architecture
- **Frontend**: React 19, Tailwind CSS, Motion, Lucide Icons.
- **Backend**: Express 5, TSX, Rate Limiting.
- **Extraction**: ScrapeGraphAI SDK with Google Search fallback resilience.
- **Persistence**: Firestore for historical match data and signal logs.

## 🛡️ Forensic Audit Layer
The terminal includes a real-time system audit view to monitor:
- **Extraction Resilience**: Success rates across FBRef, Understat, and Google Search.
- **Proxy Liquidity**: Tracking remaining request quotas to ensure signal continuity.
- **Signal Logs**: Low-level forensic logs tracking every prediction and scrape event.

## 🚀 Getting Started
1. Configure environment variables in `.env` (see `.env.example`).
2. Run `npm install`.
3. Run `npm run dev` to start the terminal.

*Disclaimer: This is a quantitative tool for informational purposes. Probability is not certainty.*
