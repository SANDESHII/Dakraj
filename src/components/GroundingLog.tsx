
import React from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { MatchContext } from '../types';

interface GroundingLogProps {
    context: MatchContext;
}

export const GroundingLog: React.FC<GroundingLogProps> = ({ context }) => {
    if (!context.groundingLog) return null;

    const { citations, varianceAlerts } = context.groundingLog;

    return (
        <div className="space-y-12 bg-neutral-950 border border-neutral-900 rounded-3xl p-12 lg:p-16">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">Live Grounding Logic</h3>
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Source Verification</h2>
                    <p className="text-sm text-neutral-500 font-medium max-w-xl">Every quantitative atom is cross-verified against institutional data feeds (FBRef, Understat, Opta) and real-time market signals.</p>
                </div>
                <div className="px-6 py-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Protocol v2.4 SANCTIFIED</span>
                </div>
            </div>

            {varianceAlerts && varianceAlerts.length > 0 && (
                <div className="bg-neutral-900 border-l-2 border-red-500 p-8 space-y-4">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">Critical Variance Alerts</span>
                    </div>
                    <div className="space-y-2">
                        {varianceAlerts.map((alert, i) => (
                            <p key={i} className="text-sm text-neutral-400 font-medium leading-relaxed">— {alert}</p>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                {citations.map((cite, idx) => (
                    <div key={idx} className="bg-neutral-900 p-8 border border-neutral-800 flex flex-col justify-between space-y-8 hover:bg-neutral-800 transition-all group">
                        <div className="space-y-6">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.15em]">{cite.source}</span>
                                <a 
                                    href={cite.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="w-8 h-8 bg-neutral-950 border border-neutral-800 rounded flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </div>
                            <div className="space-y-2">
                                <span className="text-4xl font-bold text-white tabular-nums tracking-tighter">{cite.value}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Verified Signal</span>
                                </div>
                            </div>
                        </div>
                        <div className="pt-6 border-t border-neutral-800/50">
                            <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                                {cite.timestamp}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
