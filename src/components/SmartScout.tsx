
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ShieldAlert, Newspaper, Users, CloudRain, TrendingUp, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { MatchIntel } from '../services/scapegraphService';

interface SmartScoutProps {
    homeTeam: string;
    awayTeam: string;
    league: string;
    initialIntel?: MatchIntel;
}

export const SmartScout: React.FC<SmartScoutProps> = ({ homeTeam, awayTeam, league, initialIntel }) => {
    const [intel, setIntel] = useState<MatchIntel | null>(initialIntel || null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(!!initialIntel);

    const fetchIntel = async () => {
        setLoading(true);
        setExpanded(true);
        try {
            const response = await fetch('/api/intel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeTeam, awayTeam, league })
            });
            if (!response.ok) throw new Error('Failed to fetch intelligence');
            const data = await response.json();
            setIntel(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Search className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold tracking-tight">Smart Scout <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full ml-2 uppercase">Scapegraph AI</span></h3>
                        <p className="text-xs text-neutral-500">Real-time web intelligence and injury reports</p>
                    </div>
                </div>
                {!intel && !loading && (
                    <button 
                        onClick={fetchIntel}
                        className="px-4 py-2 bg-emerald-500 text-neutral-950 text-xs font-bold rounded-lg hover:bg-emerald-400 transition-colors uppercase tracking-widest"
                    >
                        Deploy Scout
                    </button>
                )}
                {intel && (
                    <button 
                        onClick={() => setExpanded(!expanded)}
                        className="p-2 text-neutral-400 hover:text-white transition-colors"
                    >
                        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                )}
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="border-t border-neutral-800"
                    >
                        <div className="p-6">
                            {loading ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Scouring web news and forums...</p>
                                </div>
                            ) : intel ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Injuries */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-emerald-500">
                                            <ShieldAlert className="w-4 h-4" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Injuries & Suspensions</span>
                                        </div>
                                        <div className="space-y-2">
                                            {intel.injuries.length > 0 ? intel.injuries.map((item, i) => (
                                                <div key={i} className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/50 flex justify-between items-center">
                                                    <div>
                                                        <p className="text-xs font-bold text-white">{item.player}</p>
                                                        <p className="text-[10px] text-neutral-500">{item.team}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-bold text-red-500 uppercase">{item.status}</p>
                                                        <p className="text-[10px] text-neutral-600">{item.impact}</p>
                                                    </div>
                                                </div>
                                            )) : <p className="text-xs text-neutral-600 italic">No critical injury alerts found.</p>}
                                        </div>
                                    </div>

                                    {/* Tactical News */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-blue-500">
                                            <Newspaper className="w-4 h-4" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Tactical Briefing</span>
                                        </div>
                                        <div className="space-y-2">
                                            {intel.tacticalNews.map((news, i) => (
                                                <div key={i} className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/50">
                                                    <p className="text-xs text-neutral-400 leading-relaxed italic">"{news}"</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Lineup Rumors */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-purple-500">
                                            <Users className="w-4 h-4" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Lineup Intel</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {intel.lineupRumors.map((team, i) => (
                                                <div key={i} className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/50">
                                                    <p className="text-[10px] font-bold text-white mb-2 uppercase">{team.team}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {team.predictedLineup.slice(0, 5).map((player, j) => (
                                                            <span key={j} className="text-[9px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">
                                                                {player}
                                                            </span>
                                                        ))}
                                                        {team.predictedLineup.length > 5 && <span className="text-[9px] text-neutral-600">+{team.predictedLineup.length - 5} more</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Environment & Market */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 h-full">
                                            <div className="flex-1 p-4 bg-neutral-950 rounded-xl border border-neutral-800/50 space-y-2">
                                                <div className="flex items-center gap-2 text-orange-500">
                                                    <CloudRain className="w-4 h-4" />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Weather</span>
                                                </div>
                                                <p className="text-xs text-white font-medium">{intel.weatherImpact}</p>
                                            </div>
                                            <div className="flex-1 p-4 bg-neutral-950 rounded-xl border border-neutral-800/50 space-y-2">
                                                <div className="flex items-center gap-2 text-emerald-500">
                                                    <TrendingUp className="w-4 h-4" />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Sentiment</span>
                                                </div>
                                                <p className="text-xs text-white font-medium">{intel.marketSentiment}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
