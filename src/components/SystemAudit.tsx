
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Shield, Terminal, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react';
import { fetchWithTimeout } from '../utils';

interface MonitorStats {
    stats: Record<string, {
        total: number;
        success: number;
        failed: number;
        blocked: number;
        successRate: string;
        lastHourRate: string;
    }>;
}

interface ProxyStats {
    requestsToday: number;
    limit: number;
    remaining: number;
    resetIn: number;
}

export const SystemAudit: React.FC = () => {
    const [monitor, setMonitor] = useState<MonitorStats | null>(null);
    const [proxy, setProxy] = useState<ProxyStats | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const [mRes, pRes, lRes] = await Promise.all([
                fetchWithTimeout('/api/monitor/stats'),
                fetchWithTimeout('/api/proxy/stats'),
                fetchWithTimeout('/api/logs?lines=20')
            ]);
            
            setMonitor(await mRes.json());
            setProxy(await pRes.json());
            const logData = await lRes.json();
            setLogs(logData.logs || []);
        } catch (err) {
            console.error('Audit sync failed:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isExpanded) refresh();
    }, [isExpanded]);

    return (
        <div className="border-t border-neutral-900 pt-32">
            <div className="max-w-6xl mx-auto space-y-12">
                <div className="flex items-center justify-between">
                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold text-white uppercase tracking-tighter">Forensic System Audit</h3>
                        <p className="text-neutral-500 text-sm max-w-lg uppercase tracking-tight font-medium">Real-time surveillance of the extraction layer and neural signal grounding health.</p>
                    </div>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-3 px-6 py-3 bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 transition-all rounded-xl text-[10px] font-black text-neutral-400 uppercase tracking-widest"
                    >
                        {isExpanded ? 'Collapse Audit' : 'Initialize Audit View'}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                </div>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-12 overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* Proxy Health */}
                                <div className="p-10 bg-neutral-950 border border-neutral-900 rounded-3xl space-y-8">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">Proxy Liquidity</span>
                                        <Shield className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-4xl font-black text-white tracking-tighter">{proxy?.remaining || 0}</p>
                                            <span className="text-[10px] text-neutral-600 font-bold uppercase">Requests Remaining</span>
                                        </div>
                                        <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-500" 
                                                style={{ width: `${((proxy?.remaining || 0) / (proxy?.limit || 4500)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Extraction Stats */}
                                <div className="p-10 bg-neutral-950 border border-neutral-900 rounded-3xl space-y-8 md:col-span-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">Extraction Resilience</span>
                                        <Activity className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                                        {monitor?.stats && Object.entries(monitor.stats).slice(0, 4).map(([url, s], i) => (
                                            <div key={i} className="space-y-2">
                                                <span className="text-[9px] text-neutral-600 font-bold uppercase truncate block tracking-tighter">
                                                    {url}
                                                </span>
                                                <p className="text-2xl font-black text-white tracking-tighter">{s.successRate}</p>
                                                <div className={`text-[8px] font-black uppercase px-2 py-0.5 inline-block rounded-sm ${parseFloat(s.lastHourRate) > 70 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {s.lastHourRate} 1H
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Recent Logs */}
                            <div className="bg-neutral-950 border border-neutral-900 rounded-3xl overflow-hidden">
                                <div className="p-8 border-b border-neutral-900 flex items-center justify-between bg-neutral-900/50">
                                    <div className="flex items-center gap-3">
                                        <Terminal className="w-4 h-4 text-emerald-500" />
                                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Forensic Signal Logs</span>
                                    </div>
                                    <button 
                                        onClick={refresh}
                                        disabled={loading}
                                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors group"
                                    >
                                        <RefreshCcw className={`w-3 h-3 text-neutral-500 group-hover:text-white ${loading ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                <div className="p-8 font-mono text-[10px] space-y-2 max-h-64 overflow-y-auto">
                                    {logs.length > 0 ? logs.map((log, i) => (
                                        <div key={i} className="flex gap-4 border-b border-neutral-900/50 pb-2 last:border-0">
                                            <span className="text-neutral-700 shrink-0">[{i.toString().padStart(2, '0')}]</span>
                                            <span className={`
                                                ${log.includes('FAILED') ? 'text-red-500' : 
                                                  log.includes('PREDICT') ? 'text-emerald-500' : 
                                                  log.includes('SCRAPE') ? 'text-blue-400' : 'text-neutral-400'}
                                            `}>
                                                {log}
                                            </span>
                                        </div>
                                    )) : (
                                        <div className="text-center py-12 text-neutral-600 font-sans italic">
                                            No recent forensic signals detected.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
