
import React from 'react';

import { ELITE_LEAGUES } from '../core/constants';

interface AnalysisFormProps {
    home: string;
    setHome: (v: string) => void;
    away: string;
    setAway: (v: string) => void;
    league: string;
    setLeague: (v: string) => void;
    time: string;
    setTime: (v: string) => void;
    onAnalyze: () => void;
    loading: boolean;
    isSearchEnabled: boolean;
    setIsSearchEnabled: (v: boolean) => void;
}

export const AnalysisForm: React.FC<AnalysisFormProps> = ({ 
    home, setHome, away, setAway, league, setLeague, time, setTime, 
    onAnalyze, loading, isSearchEnabled, setIsSearchEnabled
}) => (
    <form 
        onSubmit={(e) => { e.preventDefault(); if (!loading && home && away) onAnalyze(); }} 
        className="bg-neutral-950 p-12 lg:p-16 border border-neutral-900 max-w-5xl mx-auto"
    >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
            {[
                { label: 'Home Side', val: home, set: setHome, placeholder: 'ARSENAL' },
                { label: 'Away Side', val: away, set: setAway, placeholder: 'CHELSEA' },
                { label: 'League Code', val: league, set: setLeague, placeholder: 'EPL' },
                { label: 'Market Time', val: time, set: setTime, placeholder: '19:45' }
            ].map((f, i) => (
                <div key={i} className="space-y-4">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{f.label}</label>
                    <input 
                        type="text" 
                        value={f.val} 
                        onChange={(e) => f.set(e.target.value.toUpperCase())} 
                        className="w-full bg-transparent border-b border-neutral-800 px-0 py-4 text-4xl text-white focus:outline-none focus:border-emerald-500 transition-all font-bold placeholder:text-neutral-800 uppercase tracking-tighter" 
                        placeholder={f.placeholder} 
                    />
                    {f.label === 'League Code' && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {ELITE_LEAGUES.map(l => (
                                <button
                                    key={l}
                                    type="button"
                                    onClick={() => setLeague(l)}
                                    className={`px-3 py-1 text-[8px] font-black border transition-all ${league === l ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700'}`}
                                >
                                    {l.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
        <div className="mt-16 flex items-center justify-between p-8 bg-neutral-900 border border-neutral-800">
            <div className="space-y-1">
                <span className="text-xs font-black text-white uppercase tracking-widest">Neural Research Protocol</span>
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Real-time tactical signal grounding active</p>
            </div>
            <button 
                type="button" 
                onClick={() => setIsSearchEnabled(!isSearchEnabled)} 
                className={`relative w-12 h-6 transition-all duration-300 ${isSearchEnabled ? 'bg-emerald-500' : 'bg-neutral-800'}`}
            >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white transition-all duration-300 ${isSearchEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
        </div>
        <button 
            type="submit" 
            disabled={loading || !home || !away} 
            className={`w-full mt-12 py-10 font-black tracking-[0.2em] text-sm uppercase transition-all ${loading || !home || !away ? 'bg-neutral-900 text-neutral-700' : 'bg-white text-black hover:bg-emerald-500'}`}
        >
            {loading ? 'CALCULATING VARIANCES...' : 'GENERATE SANCTIFIED REPORT'}
        </button>
    </form>
);
