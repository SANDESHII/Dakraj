
import React from 'react';
import { Zap, Shield, Target, Activity, LucideIcon, Binary } from 'lucide-react';
import { AnalysisResult, AnalysisConfidence } from '../types';

interface ResultGridProps {
    analysis: AnalysisResult;
    surety: AnalysisConfidence;
}

const StatCard: React.FC<{ label: string; value: string | number; subValue?: string; icon: LucideIcon }> = ({ label, value, subValue, icon: Icon }) => (
    <div className="bg-neutral-900/30 p-10 rounded-2xl border border-neutral-900 flex flex-col justify-between space-y-8 hover:bg-neutral-900/50 transition-all group shadow-sm">
        <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em]">{label}</span>
            <Icon className="w-4 h-4 text-neutral-700 group-hover:text-emerald-500 transition-colors" />
        </div>
        <div className="space-y-2">
            <h4 className="text-5xl font-black text-white tracking-tighter tabular-nums leading-none">{value}</h4>
            <p className="text-[10px] font-black text-neutral-600 uppercase tracking-widest leading-none">{subValue}</p>
        </div>
    </div>
);

export const ResultGrid: React.FC<ResultGridProps> = ({ analysis }) => {
    return (
        <div className="space-y-24">
            {/* Header Status */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10 pb-16 border-b border-neutral-900/50">
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                        <span className="text-[10px] font-black tracking-[0.3em] text-neutral-600 uppercase">
                            {analysis.dataSource === 'LIVE' ? 'Neural Signal Integrity: 100%' : 'Archetype Projection Mode'}
                        </span>
                    </div>
                    <h2 className="text-7xl md:text-8xl font-black text-white tracking-tighter leading-[0.8] uppercase max-w-2xl">
                        {analysis.predictionLabel}
                    </h2>
                </div>
                <div className="flex flex-col items-end gap-3">
                    <span className="text-9xl font-black text-emerald-500 tracking-tighter leading-none drop-shadow-2xl shadow-emerald-500/10">{analysis.probability}%</span>
                    <span className="text-[11px] font-black text-neutral-600 uppercase tracking-[0.25em]">Probability Signal</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-8 space-y-16">
                    {/* Primary Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <StatCard label="Model Edge" value={`${analysis.edge > 0 ? '+' : ''}${analysis.edge}%`} subValue="Alpha vs Market" icon={Zap} />
                        <StatCard label="Risk Unit" value={`${analysis.recommendedStake}%`} subValue="Optimal Allocation" icon={Shield} />
                        <StatCard label="Live Odds" value={analysis.marketOdds.toFixed(2)} subValue="True Value Anchor" icon={Target} />
                    </div>

                    {/* Team Deep Dive */}
                    <div className="bg-neutral-900/20 border border-neutral-900/80 rounded-[40px] p-16">
                        <div className="flex items-center gap-4 mb-16">
                            <Binary className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.3em]">Scoring Architectures</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                            {[
                                { team: analysis.homeStats, xG: analysis.homeXG, role: 'HOME' },
                                { team: analysis.awayStats, xG: analysis.awayXG, role: 'AWAY' }
                            ].map((item, idx) => (
                                <div key={idx} className="space-y-12">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-neutral-700 uppercase tracking-widest">{item.role}</span>
                                        <h4 className="text-3xl font-black text-white tracking-tighter uppercase">{item.team.name}</h4>
                                    </div>
                                    <div className="grid grid-cols-2 gap-12">
                                        <div className="space-y-3">
                                            <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Adjusted xG</span>
                                            <p className="text-4xl font-bold text-white tabular-nums tracking-tighter">{item.xG.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-3">
                                            <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Stability</span>
                                            <p className="text-4xl font-bold text-emerald-500 tabular-nums tracking-tighter">{item.team.defensiveStability.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-3">
                                            <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Tactical Bias</span>
                                            <p className="text-4xl font-bold text-white tabular-nums tracking-tighter">{item.team.homeAwayBias.toFixed(2)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tactical Narrative */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-neutral-500" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Tactical Reasoning</h3>
                        </div>
                        <p className="text-lg text-neutral-400 leading-relaxed max-w-3xl italic">
                            "{analysis.summary}"
                        </p>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    {/* Verdict Card: Syndicate Trading Mode */}
                    <div className="bg-emerald-500 p-10 rounded-2xl text-neutral-950 space-y-8">
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Trading Signal</span>
                            <h2 className="text-5xl font-black tracking-tighter uppercase leading-none">
                                {analysis.verdict === 'EXECUTE_BET' ? 'EXECUTE BET' : 'NO BET'}
                            </h2>
                        </div>
                        <p className="text-sm font-medium leading-relaxed">
                            {analysis.verdict === 'EXECUTE_BET' 
                                ? `Positive Expected Value (+EV) identified. Recommended risk: ${analysis.recommendedStake}% of bankroll.`
                                : "Market is efficient. No mathematical edge exists. Preserve capital."}
                        </p>
                        
                        {analysis.verdict === 'EXECUTE_BET' && (
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-950/20">
                                <div>
                                    <span className="text-[10px] font-bold uppercase opacity-60">Model Edge</span>
                                    <p className="text-2xl font-black">+{analysis.edge}%</p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold uppercase opacity-60">Target Odds</span>
                                    <p className="text-2xl font-black">{analysis.marketOdds?.toFixed(2)}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Audit Info */}
                    <div className="p-8 border border-neutral-900 rounded-2xl space-y-8">
                        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                            <Target className="w-3 h-3" /> Technical Audit
                        </h4>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-bold uppercase text-neutral-400">
                                    <span>Signal Purity</span>
                                    <span>{analysis.purity}%</span>
                                </div>
                                <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${analysis.purity}%` }} />
                                </div>
                            </div>
                            {analysis.context.referee && (
                                <div className="pt-6 border-t border-neutral-900 space-y-4">
                                    <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Referee Influence</span>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-white">{analysis.context.referee.name}</span>
                                        <span className="text-[10px] px-2 py-1 bg-neutral-900 rounded text-neutral-400 font-bold uppercase tracking-tight">
                                            {analysis.context.referee.tendency}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {analysis.context.audit && (
                                <div className="pt-6 border-t border-neutral-900 grid grid-cols-2 gap-y-6 gap-x-4">
                                    {[
                                        { label: 'Signal Integrity', value: analysis.context.audit.signalIntegrity },
                                        { label: 'Variance Mode', value: analysis.context.audit.redCardRegime },
                                        { label: 'Recency Alpha', value: analysis.context.audit.alphaAdjustment },
                                        { label: 'Data Fidelity', value: analysis.context.audit.dataReliability }
                                    ].map((item, i) => (
                                        <div key={i} className="space-y-1">
                                            <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest block leading-none">{item.label}</span>
                                            <p className="text-[10px] font-bold text-neutral-400 leading-tight">{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

