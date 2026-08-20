import React, { useState, useEffect } from 'react';
import { Attendee, PrintJob, CheckInResponse } from '../types';
import { BadgePreview } from './BadgePreview';
import {
  QrCode,
  Scan,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Camera
} from 'lucide-react';

interface KioskSimulatorProps {
  attendees: Attendee[];
  activeJobs: PrintJob[];
  onScan: (attendeeId: string, options?: { printerDelayMs?: number; simulateFailure?: boolean }) => Promise<CheckInResponse>;
  onTriggerDuplicateScan: (attendeeId: string) => Promise<void>;
  selectedAttendeeId: string | null;
  onSelectAttendee: (id: string) => void;
  onOpenScanner?: () => void;
}

export const KioskSimulator: React.FC<KioskSimulatorProps> = ({
  attendees,
  activeJobs,
  onScan,
  onTriggerDuplicateScan,
  selectedAttendeeId,
  onSelectAttendee,
  onOpenScanner
}) => {
  const [customQrInput, setCustomQrInput] = useState('');
  const [printerDelayMs, setPrinterDelayMs] = useState(2500);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [kioskMessage, setKioskMessage] = useState<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null);
  const [currentActiveAttendeeId, setCurrentActiveAttendeeId] = useState<string | null>(selectedAttendeeId || 'ATT-101');

  const currentAttendee = attendees.find(a => a.id === currentActiveAttendeeId) || attendees[0];

  // Look for any active job for current attendee
  const currentJob = activeJobs.find(j => j.attendeeId === currentAttendee?.id && (j.status === 'QUEUED' || j.status === 'PROCESSING'));

  useEffect(() => {
    if (selectedAttendeeId) {
      setCurrentActiveAttendeeId(selectedAttendeeId);
    }
  }, [selectedAttendeeId]);

  const handleQuickScan = async (attendeeId: string) => {
    setCurrentActiveAttendeeId(attendeeId);
    onSelectAttendee(attendeeId);
    setIsProcessingScan(true);
    setKioskMessage(null);

    try {
      const res = await onScan(attendeeId, { printerDelayMs, simulateFailure });
      if (!res.success) {
        setKioskMessage({ text: res.message, type: res.code === 'PRINT_ALREADY_PENDING' || res.code === 'ALREADY_CHECKED_IN' ? 'warn' : 'error' });
      }
    } catch (err: any) {
      setKioskMessage({ text: err.message || 'Scan error', type: 'error' });
    } finally {
      setIsProcessingScan(false);
    }
  };

  const handleCustomScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQrInput.trim()) return;

    setIsProcessingScan(true);
    setKioskMessage(null);
    try {
      const res = await onScan(customQrInput.trim(), { printerDelayMs, simulateFailure });
      if (res.attendee) {
        setCurrentActiveAttendeeId(res.attendee.id);
        onSelectAttendee(res.attendee.id);
      }
      if (!res.success) {
        setKioskMessage({ text: res.message, type: 'warn' });
      }
      setCustomQrInput('');
    } catch (err: any) {
      setKioskMessage({ text: err.message || 'Scan error', type: 'error' });
    } finally {
      setIsProcessingScan(false);
    }
  };

  const handleTestDuplicateScan = async () => {
    if (!currentAttendee) return;
    setIsProcessingScan(true);
    try {
      await onTriggerDuplicateScan(currentAttendee.id);
    } finally {
      setIsProcessingScan(false);
    }
  };

  return (
    <div id="kiosk-simulator" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left / Main Kiosk Terminal Screen */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-slate-800 relative overflow-hidden">
          {/* Top Kiosk Bezel Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
            <div className="flex items-center space-x-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-xs text-slate-300 font-semibold tracking-wider uppercase">
                Kiosk #01 • Solstice Main Lobby
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {onOpenScanner && (
                <button
                  id="btn-kiosk-live-camera"
                  onClick={onOpenScanner}
                  className="flex items-center space-x-1.5 text-xs font-semibold text-amber-300 bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 px-2.5 py-1 rounded-full border border-amber-500/30 transition shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera Scanner</span>
                </button>
              )}
              <div className="flex items-center space-x-2 text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                <Printer className="w-3.5 h-3.5" />
                <span>Thermal-01 Ready</span>
              </div>
            </div>
          </div>

          {/* Alert Message Banner if any */}
          {kioskMessage && (
            <div
              id="kiosk-alert-banner"
              className={`mb-6 p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center space-x-3 transition-all ${
                kioskMessage.type === 'warn'
                  ? 'bg-amber-950/80 text-amber-200 border border-amber-500/40'
                  : kioskMessage.type === 'error'
                  ? 'bg-rose-950/80 text-rose-200 border border-rose-500/40'
                  : 'bg-blue-950/80 text-blue-200 border border-blue-500/40'
              }`}
            >
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-bold block">
                  {kioskMessage.type === 'warn' ? 'Idempotency Protection Triggered' : 'System Notice'}
                </span>
                <span>{kioskMessage.text}</span>
              </div>
            </div>
          )}

          {/* DYNAMIC KIOSK SCREEN STATES */}
          {(!currentAttendee || currentAttendee.status === 'NOT_CHECKED_IN') && (
            <div id="kiosk-state-idle" className="flex flex-col items-center justify-center py-6 text-center">
              {/* Scan Viewfinder (clickable to open camera scanner) */}
              <div
                id="kiosk-viewfinder-box"
                onClick={onOpenScanner ? onOpenScanner : undefined}
                className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-3xl border-2 border-dashed border-amber-400/60 bg-slate-900/80 flex flex-col items-center justify-center p-4 group overflow-hidden ${
                  onOpenScanner ? 'cursor-pointer hover:border-amber-400 hover:bg-slate-900 transition shadow-[0_0_25px_rgba(245,158,11,0.15)]' : ''
                }`}
                title={onOpenScanner ? 'Click to open Camera Scanner View' : 'QR Scan Viewfinder'}
              >
                {/* Laser animation */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#f59e0b] animate-bounce" />

                <QrCode className="w-14 h-14 text-amber-400/80 group-hover:scale-110 transition-transform duration-300" />
                <span className="text-xs font-mono text-slate-300 mt-2 uppercase tracking-wider font-semibold">
                  Position QR Badge
                </span>
                {onOpenScanner && (
                  <span className="text-[10px] text-amber-400 font-mono mt-1 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                    <Camera className="w-3 h-3" />
                    <span>Click for Camera</span>
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-6 tracking-tight">
                Welcome to Solstice Summit
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm max-w-md mt-1">
                Scan your registration QR code with your camera or select your profile below to print your physical badge.
              </p>

              {/* Primary Camera Scanner Action Button */}
              {onOpenScanner && (
                <div className="mt-4">
                  <button
                    id="btn-kiosk-open-scanner-modal"
                    onClick={onOpenScanner}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center space-x-2 shadow-lg shadow-amber-500/20 hover:scale-[1.02] transition active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Open Camera Scanner View</span>
                  </button>
                </div>
              )}

              {/* Quick Scan Selection Tiles */}
              <div className="w-full mt-6 grid grid-cols-3 gap-2">
                {attendees.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    id={`btn-quick-tile-${a.id}`}
                    onClick={() => handleQuickScan(a.id)}
                    disabled={isProcessingScan}
                    className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-400/60 rounded-xl text-left transition flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-mono text-amber-400 font-bold">{a.id}</span>
                      <Scan className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition" />
                    </div>
                    <div className="mt-2">
                      <div className="font-bold text-xs text-slate-200 group-hover:text-white truncate">
                        {a.name?.split(' ')[0] || a.id}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{a.company || 'Attendee'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentAttendee && currentAttendee.status === 'PRINT_PENDING' && (
            <div id="kiosk-state-pending" className="flex flex-col items-center justify-center py-6 text-center">
              {/* Animated Printer Icon */}
              <div className="relative">
                <div className="w-24 h-24 rounded-3xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                  <Printer className="w-12 h-12 animate-pulse" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-slate-900 p-1.5 rounded-full border border-amber-400 text-amber-400">
                  <Clock className="w-4 h-4 animate-spin" />
                </div>
              </div>

              {/* Progress Title */}
              <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-5">
                Printing Badge...
              </h2>
              <p className="text-amber-300 font-mono text-xs mt-1 font-semibold">
                Job ID: {currentAttendee.currentJobId || 'PENDING'}
              </p>

              {/* Clarification Callout */}
              <div className="mt-5 p-4 rounded-xl bg-slate-900 border border-slate-800 max-w-md text-left">
                <div className="flex items-start space-x-3">
                  <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-slate-200">
                      Asynchronous Printing Flow:
                    </p>
                    <p className="text-slate-400 leading-relaxed">
                      The scan was accepted and queued. The kiosk is now waiting for the vendor printer webhook before transitioning to <span className="text-emerald-400 font-semibold">Checked In</span>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Duplicate Scan Demonstration Trigger */}
              <div className="mt-6 flex flex-col sm:flex-row items-center gap-2">
                <button
                  id="btn-test-duplicate"
                  onClick={handleTestDuplicateScan}
                  disabled={isProcessingScan}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center space-x-2 transition"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Test Duplicate Scan (Simulate Rapid 2nd Tap)</span>
                </button>
              </div>
            </div>
          )}

          {currentAttendee && currentAttendee.status === 'CHECKED_IN' && (
            <div id="kiosk-state-checked-in" className="flex flex-col items-center justify-center py-4 text-center">
              {/* Success Badge */}
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h2 className="text-2xl font-extrabold text-white">
                ✓ Checked In!
              </h2>
              <p className="text-slate-300 text-sm mt-1">
                Welcome to Solstice, <span className="text-white font-bold">{currentAttendee.name}</span>!
              </p>

              <div className="my-4 flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                <span>Webhook Verified via {currentAttendee.currentJobId || 'PRINTER-01'}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">
                  {currentAttendee.checkedInAt ? new Date(currentAttendee.checkedInAt).toLocaleTimeString() : 'Verified'}
                </span>
              </div>

              <p className="text-xs text-slate-400 max-w-sm mb-4">
                Please collect your printed badge from the dispenser tray below.
              </p>

              <div className="flex items-center space-x-3">
                <button
                  id="btn-scan-next"
                  onClick={() => {
                    const next = attendees.find(a => a.status === 'NOT_CHECKED_IN') || attendees[0];
                    if (next) {
                      setCurrentActiveAttendeeId(next.id);
                      onSelectAttendee(next.id);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg transition"
                >
                  <span>Scan Next Attendee</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {currentAttendee && currentAttendee.status === 'PRINT_FAILED' && (
            <div id="kiosk-state-failed" className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-rose-400 mb-4">
                <AlertTriangle className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-extrabold text-rose-300">
                Print Hardware Error
              </h2>
              <p className="text-xs text-slate-300 font-mono mt-1 max-w-md bg-rose-950/60 p-3 rounded-xl border border-rose-500/30">
                {currentAttendee.failureReason || 'Thermal ribbon jam reported via webhook.'}
              </p>

              <div className="mt-6 flex items-center space-x-3">
                <button
                  id="btn-retry-print"
                  onClick={() => handleQuickScan(currentAttendee.id)}
                  disabled={isProcessingScan}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-2 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Print Job</span>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Custom Barcode / QR Input Box */}
          <div className="mt-6 pt-4 border-t border-slate-800">
            <form onSubmit={handleCustomScanSubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Scan className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="input-custom-scan"
                  type="text"
                  placeholder="Manual barcode / QR input (e.g. ATT-101 or SOLSTICE:ATT-102)..."
                  value={customQrInput}
                  onChange={(e) => setCustomQrInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isProcessingScan || !customQrInput.trim()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                Scan
              </button>
            </form>
          </div>
        </div>

        {/* Simulation Controls Card */}
        <div id="sim-controls-card" className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-slate-600" />
              <h3 className="font-bold text-sm text-slate-900">Printer Simulator Parameters</h3>
            </div>
            <span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">
              Mock Vendor API
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Delay Slider */}
            <div>
              <div className="flex justify-between text-xs text-slate-600 font-medium mb-1">
                <span>Simulated Print Latency:</span>
                <span className="font-mono font-bold text-amber-600">{(printerDelayMs / 1000).toFixed(1)}s</span>
              </div>
              <input
                id="slider-printer-delay"
                type="range"
                min={800}
                max={6000}
                step={200}
                value={printerDelayMs}
                onChange={(e) => setPrinterDelayMs(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>0.8s (Fast)</span>
                <span>3.0s (Normal)</span>
                <span>6.0s (Slow)</span>
              </div>
            </div>

            {/* Failure Toggle */}
            <div className="flex flex-col justify-center">
              <label className="flex items-center space-x-3 cursor-pointer select-none">
                <input
                  id="checkbox-sim-failure"
                  type="checkbox"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Simulate Hardware Failure (Paper Jam)
                </span>
              </label>
              <p className="text-[11px] text-slate-400 ml-7 mt-0.5">
                Vendor printer webhook will return <code className="font-mono text-rose-600">status: 'FAILED'</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Physical Badge Dispenser View */}
      <div className="lg:col-span-5 flex flex-col items-center">
        <div className="w-full bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col items-center">
          <div className="w-full flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Dispenser Output Tray</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              PRINTER-MAIN-01
            </span>
          </div>

          {/* Badge Visual Representation */}
          <div className="relative my-2">
            <BadgePreview
              attendee={currentAttendee}
              isDispensed={currentAttendee?.status === 'CHECKED_IN'}
            />
          </div>

          <div className="w-full mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono flex flex-col space-y-1">
            <div className="flex justify-between">
              <span>Attendee ID:</span>
              <span className="text-slate-200 font-bold">{currentAttendee?.id || 'Standby'}</span>
            </div>
            <div className="flex justify-between">
              <span>Current Status:</span>
              <span className={`font-bold ${
                currentAttendee?.status === 'CHECKED_IN'
                  ? 'text-emerald-400'
                  : currentAttendee?.status === 'PRINT_PENDING'
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}>
                {currentAttendee?.status || 'AWAITING_SCAN'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Active Job ID:</span>
              <span className="text-slate-200">{currentAttendee?.currentJobId || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span>Last Scanned:</span>
              <span className="text-slate-400">
                {currentAttendee?.lastScannedAt ? new Date(currentAttendee.lastScannedAt).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
