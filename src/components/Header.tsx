import React from 'react';
import { Activity } from 'lucide-react';

export const Header: React.FC = () => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-neutral-950 border-b border-neutral-900 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-center">
                    <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <h1 className="text-sm font-bold tracking-tight text-white uppercase">
                    Alpha <span className="text-neutral-500 font-medium">Terminal</span>
                </h1>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-neutral-400 tracking-[0.1em] uppercase hidden md:block">System Status: Active</span>
                </div>
            </div>
        </div>
    </header>
);
