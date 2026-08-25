
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, CheckCircle2, XCircle, BarChart3, Play } from 'lucide-react';
import { BacktestSummary } from '../services/backtestService';
import { fetchWithTimeout } from '../utils';

export const BacktestDisplay: React.FC = () => {
    const [summary, setSummary] = useState<BacktestSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [ingesting, setIngesting] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const runBacktest = async () => {
        setLoading(true);
        try {
            const res = await fetchWithTimeout('/api/backtest', {}, 120000); // 120s for long backtests
            const data = await res.json();
            setSummary(data);
            setShowResults(true);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const runIngestion = async () => {
        setIngesting(true);
        try {
            const res = await fetchWithTimeout('/api/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ league: 'EPL' })
            }, 300000); // 5 min for deep ingestion
            const data = await res.json();
            alert(`Successfully ingested ${data.count} historical matches.`);
        } catch (err) {
            console.error(err);
            alert('Ingestion failed. Check console for details.');
        } finally {
            setIngesting(false);
        }
    };

    return (
        <div className="space-y-12">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">Neural Integrity Audit</h3>
                    <p className="text-3xl font-bold text-white tracking-tight uppercase">Stochastic Audit</p>
                </div>
                <div className="flex flex-wrap gap-4 w-full md:w-auto">
                    <button 
                        onClick={runIngestion}
                        disabled={ingesting || loading}
                        className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-tight transition-all border border-neutral-800"
                    >
                        {ingesting ? (
                            <Activity className="w-4 h-4 animate-spin text-emerald-500" />
                        ) : (
                            <Activity className="w-4 h-4 text-neutral-500" />
                        )}
                        {ingesting ? 'Synchronizing...' : 'Sync Data'}
                    </button>
                    <button 
                        onClick={runBacktest}
                        disabled={loading || ingesting}
                        className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-900 disabled:text-neutral-600 text-black rounded-xl text-xs font-bold uppercase tracking-tight transition-all group"
                    >
                        {loading ? (
                            <Activity className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4 fill-current transition-transform group-hover:scale-110" />
                        )}
                        {loading ? 'Simulating...' : 'Run Simulation'}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {showResults && summary && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-4 gap-8"
                    >
                        {[
                            { label: 'Total Samples', value: summary.totalMatches, icon: Activity },
                            { label: 'Brier Entropy', value: summary.brierScore.toFixed(4), icon: BarChart3, detail: 'Mean Squared Error' },
                            { label: 'Purity Score', value: summary.highPurityBrierScore.toFixed(4), icon: CheckCircle2, detail: `N=${summary.highPurityMatches} High Purity` },
                            { label: 'Convergence', value: `${((summary.over15Accuracy + summary.under35Accuracy) / 2).toFixed(1)}%`, icon: CheckCircle2 }
                        ].map((stat, i) => (
                            <div key={i} className="p-10 bg-neutral-950 border border-neutral-900 rounded-3xl space-y-6 hover:bg-neutral-900 transition-all">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">{stat.label}</span>
                                    <stat.icon className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-4xl font-black text-white tracking-tighter tabular-nums leading-none">{stat.value}</p>
                                    {stat.detail && <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-tight">{stat.detail}</span>}
                                </div>
                            </div>
                        ))}

                        <div className="md:col-span-4 p-12 bg-neutral-950 border border-neutral-900 rounded-3xl">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-12">Edge Distribution (Over 2.5)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                                {summary.edgeSegments.map((seg, i) => (
                                    <div key={i} className="space-y-8 p-10 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-all group">
                                        <div className="flex justify-between items-start">
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">{seg.segment}</span>
                                            <span className="text-[10px] font-bold uppercase px-3 py-1 bg-neutral-950 border border-neutral-800 text-emerald-500 rounded-lg">
                                                Win: {(seg.hitRate * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">
                                                <span>Sample Size</span>
                                                <span>{seg.count}</span>
                                            </div>
                                            <div className="h-1 bg-neutral-950 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-emerald-500/30 transition-all duration-1000 group-hover:bg-emerald-500" 
                                                    style={{ width: `${(seg.count / summary.totalMatches) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-6 border-t border-neutral-800/50">
                                            <span className="text-[10px] text-neutral-600 font-bold uppercase">Avg Edge</span>
                                            <span className="text-xl font-bold text-white tabular-nums tracking-tighter">+{(seg.avgEdge * 100).toFixed(2)} pts</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="md:col-span-4 overflow-hidden border border-neutral-900 rounded-2xl bg-neutral-900/50">
                            <table className="w-full text-left">
                                <thead className="bg-neutral-950/50">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-bold uppercase text-neutral-500 tracking-widest">Fixture</th>
                                        <th className="px-8 py-6 text-[10px] font-bold uppercase text-neutral-500 tracking-widest text-center">Outcome</th>
                                        <th className="px-8 py-6 text-[10px] font-bold uppercase text-neutral-500 tracking-widest text-center">Edge</th>
                                        <th className="px-8 py-6 text-[10px] font-bold uppercase text-neutral-500 tracking-widest">Signal</th>
                                        <th className="px-8 py-6 text-[10px] font-bold uppercase text-neutral-500 tracking-widest text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-900">
                                    {summary.matches.map((item, i) => {
                                        const predType = item.prediction.predictionType;
                                        const isCorrect = predType === 'OVER_15' ? item.isOver15Correct : item.isUnder35Correct;
                                        return (
                                            <tr key={i} className="hover:bg-neutral-950/30 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm font-bold text-white uppercase tracking-tight">{item.match.homeTeam} — {item.match.awayTeam}</span>
                                                            {item.prediction.purity >= 80 && (
                                                                <span className="text-[8px] px-2 py-0.5 bg-emerald-500 text-black rounded-sm font-bold uppercase tracking-tight">Purity 80+</span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-neutral-600 font-medium uppercase tracking-widest">{item.match.league}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <span className="px-3 py-1 bg-neutral-950 border border-neutral-800 rounded text-xs font-bold text-neutral-400 font-mono tracking-tighter">
                                                        {item.match.actualScore[0]} : {item.match.actualScore[1]}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    {item.marketEdge !== undefined ? (
                                                        <span className={`text-xs font-bold ${item.marketEdge > 0.05 ? 'text-emerald-500' : 'text-neutral-500'}`}>
                                                            {item.marketEdge > 0 ? '+' : ''}{(item.marketEdge * 100).toFixed(1)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-neutral-800">0.0</span>
                                                    )}
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-bold uppercase tracking-tight ${predType === 'OVER_15' ? 'text-emerald-500' : 'text-neutral-500'}`}>
                                                            {predType.replace('_', ' ')}
                                                        </span>
                                                        <span className="text-xs text-neutral-700 font-medium">{item.prediction.probability}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isCorrect ? 'text-emerald-500' : 'text-red-500/50'}`}>
                                                            {isCorrect ? 'Correct' : 'Miss'}
                                                        </span>
                                                        {isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500/30" />}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
