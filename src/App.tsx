
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Info } from 'lucide-react';
import { AnalysisResult } from './types';
import { Header } from './components/Header';
import { LoadingOverlay } from './components/LoadingOverlay';
import { AnalysisForm } from './components/AnalysisForm';
import { ResultGrid } from './components/ResultDisplay';
import { GroundingLog } from './components/GroundingLog';
import { BacktestDisplay } from './components/BacktestDisplay';
import { fetchWithTimeout } from './utils';
import { LOADING_MESSAGES } from './core/constants';

export const App: React.FC = () => {
    const [inputs, setInputs] = useState({ home: '', away: '', league: 'EPL', time: '' });
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [isSearchEnabled, setIsSearchEnabled] = useState<boolean>(true);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [loadingStage, setLoadingStage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [lastRequestTime, setLastRequestTime] = useState<number>(0);
    const RATE_LIMIT_MS = 15000;

    useEffect(() => {
        let interval: any;
        if (loadingAnalysis) {
            interval = setInterval(() => {
                setLoadingStage(prev => (prev + 1) % LOADING_MESSAGES.length);
            }, 1200);
        } else {
            setLoadingStage(0);
        }
        return () => clearInterval(interval);
    }, [loadingAnalysis]);

    const handleAnalyze = async () => {
        if (loadingAnalysis || !inputs.home || !inputs.away) return;
        
        const now = Date.now();
        if (now - lastRequestTime < RATE_LIMIT_MS) {
            const waitSec = Math.ceil((RATE_LIMIT_MS - (now - lastRequestTime)) / 1000);
            setError(`RATE LIMIT: Please wait ${waitSec}s.`);
            return;
        }

        setError(null);
        setLoadingAnalysis(true);
        setAnalysis(null);
        setLastRequestTime(now);

        try {
            const response = await fetchWithTimeout('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    homeTeam: inputs.home, awayTeam: inputs.away,
                    league: inputs.league || 'STANDARD', kickoff: inputs.time || 'UPCOMING',
                    isSearchEnabled
                })
            }, 60000);

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'ANALYSIS FAILED');
            }

            setAnalysis(await response.json());
        } catch (err: any) {
            setError(err.message || 'ANALYSIS FAILED');
        } finally {
            setLoadingAnalysis(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-200 selection:bg-emerald-500/30 font-sans antialiased">
            <Header />
            <LoadingOverlay loading={loadingAnalysis} stage={loadingStage} messages={LOADING_MESSAGES} />

            <main className="max-w-6xl mx-auto px-6 pt-32 pb-24 space-y-32">
                {!analysis && !loadingAnalysis && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="max-w-4xl mx-auto text-center space-y-12 py-20"
                    >
                    <div className="flex flex-col items-center gap-12">
                        <div className="space-y-4">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.3em]">Institutional Grade</span>
                            <h2 className="text-8xl md:text-9xl font-bold tracking-tight text-white leading-[0.9] text-balance">
                                Alpha <span className="text-emerald-500">Terminal</span>
                            </h2>
                        </div>
                        <p className="text-neutral-400 text-lg max-w-xl mx-auto leading-relaxed">
                            Probabilistic edge detection and market inefficiency hunting for the Over 1.5 market.
                        </p>
                    </div>
                    </motion.div>
                )}

                <div className="relative z-10">
                    <AnalysisForm 
                        home={inputs.home} setHome={(v) => setInputs(prev => ({ ...prev, home: v }))}
                        away={inputs.away} setAway={(v) => setInputs(prev => ({ ...prev, away: v }))}
                        league={inputs.league} setLeague={(v) => setInputs(prev => ({ ...prev, league: v }))}
                        time={inputs.time} setTime={(v) => setInputs(prev => ({ ...prev, time: v }))}
                        isSearchEnabled={isSearchEnabled} setIsSearchEnabled={setIsSearchEnabled}
                        onAnalyze={handleAnalyze} loading={loadingAnalysis}
                    />
                </div>

                {error && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-xl mx-auto p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center gap-4 text-red-400 text-sm"
                    >
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">{error}</span>
                        <button onClick={() => setError(null)} className="ml-auto text-xs font-bold hover:text-white transition-colors">DISMISS</button>
                    </motion.div>
                )}

                {analysis && analysis.surety && !loadingAnalysis && (
                    <motion.div 
                        initial={{ opacity: 0, y: 40 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-16"
                    >
                        <ResultGrid analysis={analysis} surety={analysis.surety} />
                        <GroundingLog context={analysis.context} />
                    </motion.div>
                )}

                <section className="pt-32 border-t border-neutral-900">
                    <div className="space-y-12">
                        <div className="space-y-4">
                            <h3 className="text-2xl font-bold text-white">Historical Performance</h3>
                            <p className="text-neutral-500 text-sm">Real-time backtesting across the last 300 league fixtures.</p>
                        </div>
                        <BacktestDisplay />
                    </div>
                </section>
            </main>

            <footer className="max-w-6xl mx-auto px-6 py-20 border-t border-neutral-900 text-xs text-neutral-600 font-medium tracking-tight">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <span>&copy; 2025 ALPHA TERMINAL.</span>
                    <div className="flex gap-8">
                        <a href="#" className="hover:text-emerald-500 transition-colors">Documentation</a>
                        <a href="#" className="hover:text-emerald-500 transition-colors">Methodology</a>
                        <a href="#" className="hover:text-emerald-500 transition-colors">Contact</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};
