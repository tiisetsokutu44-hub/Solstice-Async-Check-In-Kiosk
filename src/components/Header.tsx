import React from 'react';
import { Sparkles, Printer, RotateCcw, ShieldCheck, Activity, BookOpen, Camera } from 'lucide-react';

interface HeaderProps {
  activeJobsCount: number;
  activeTab: 'kiosk' | 'lab' | 'inspector' | 'architecture';
  setActiveTab: (tab: 'kiosk' | 'lab' | 'inspector' | 'architecture') => void;
  onReset: () => void;
  isResetting: boolean;
  onOpenScanner?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeJobsCount,
  activeTab,
  setActiveTab,
  onReset,
  isResetting,
  onOpenScanner
}) => {
  return (
    <header id="app-header" className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-100 tracking-tight">Solstice Events Co.</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-medium border border-amber-500/30">
                  Async Kiosk MVP
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Asynchronous Badge Printing & Webhook Resolution Engine
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              id="tab-kiosk"
              onClick={() => setActiveTab('kiosk')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'kiosk'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Kiosk View</span>
            </button>

            <button
              id="tab-lab"
              onClick={() => setActiveTab('lab')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'lab'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Test Scenarios & Lab</span>
            </button>

            <button
              id="tab-inspector"
              onClick={() => setActiveTab('inspector')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'inspector'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Webhook Feed</span>
              {activeJobsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-1" />
              )}
            </button>

            <button
              id="tab-architecture"
              onClick={() => setActiveTab('architecture')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'architecture'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden md:inline">Architecture & DB</span>
            </button>
          </nav>

          {/* Right Action: Camera Scanner & Reset Demo */}
          <div className="flex items-center space-x-2">
            {onOpenScanner && (
              <button
                id="btn-header-scanner"
                onClick={onOpenScanner}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                title="Open Camera QR Scanner"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Camera Scanner</span>
              </button>
            )}

            <button
              id="btn-reset-db"
              onClick={onReset}
              disabled={isResetting}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
              title="Reset attendees back to NOT_CHECKED_IN"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
