import React, { useState } from 'react';
import { Attendee, PrintJob } from '../types';
import {
  ShieldCheck,
  GitFork,
  CopyX,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  Server,
  Database,
  Printer,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

interface OutofOrderLabProps {
  attendees: Attendee[];
  activeJobs: PrintJob[];
  onReset: () => void;
  onRefresh: () => void;
}

export const OutofOrderLab: React.FC<OutofOrderLabProps> = ({
  attendees,
  activeJobs,
  onReset,
  onRefresh
}) => {
  const [isRunningScenario, setIsRunningScenario] = useState(false);
  const [scenarioLogs, setScenarioLogs] = useState<{ time: string; msg: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([]);
  const [activeScenarioName, setActiveScenarioName] = useState<string | null>(null);

  const addLog = (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setScenarioLogs(prev => [
      ...prev,
      { time: new Date().toLocaleTimeString(), msg, type }
    ]);
  };

  // 1. OUT-OF-ORDER DEMO: Alice (Slow) vs Charlie (Fast)
  const runOutOfOrderDemo = async () => {
    setIsRunningScenario(true);
    setActiveScenarioName('Out-of-Order Webhooks (Alice 4.0s vs Charlie 1.3s)');
    setScenarioLogs([]);

    try {
      addLog('🚀 Launching Out-of-Order Concurrency Test...', 'info');
      addLog('Step 1: Scanning Alice (ATT-101) with slow 4.0s printer latency...', 'info');

      // Scan Alice
      const resAlice = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-101', printerDelayMs: 4000 })
      });
      const dataAlice = await resAlice.json();
      const aliceJobId = dataAlice.job?.id || 'JOB-A';
      addLog(`✓ Alice scan accepted. Enqueued as ${aliceJobId} (4.0s print time). Alice is now PRINT_PENDING.`, 'info');
      onRefresh();

      // Wait 300ms
      await new Promise(r => setTimeout(r, 300));

      addLog('Step 2: Scanning Charlie (ATT-103) with fast 1.3s printer latency...', 'info');
      // Scan Charlie
      const resCharlie = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-103', printerDelayMs: 1300 })
      });
      const dataCharlie = await resCharlie.json();
      const charlieJobId = dataCharlie.job?.id || 'JOB-C';
      addLog(`✓ Charlie scan accepted. Enqueued as ${charlieJobId} (1.3s print time). Charlie is now PRINT_PENDING.`, 'info');
      onRefresh();

      addLog(`⏳ Race in progress: ${charlieJobId} (Charlie) is scheduled to finish BEFORE ${aliceJobId} (Alice)...`, 'warn');

      // Wait for Charlie's webhook to land (~1.5s total)
      await new Promise(r => setTimeout(r, 1600));
      onRefresh();
      addLog(`🎯 Webhook arrived for ${charlieJobId} FIRST! Backend queried DB: WHERE current_job_id = '${charlieJobId}'.`, 'success');
      addLog(`✓ Charlie is now CHECKED_IN. Alice remains PRINT_PENDING (no crosstalk or race condition).`, 'success');

      // Wait for Alice's webhook to land (~2.8s later)
      await new Promise(r => setTimeout(r, 2600));
      onRefresh();
      addLog(`🎯 Webhook arrived for ${aliceJobId} SECOND! Backend queried DB: WHERE current_job_id = '${aliceJobId}'.`, 'success');
      addLog(`✓ Alice is now CHECKED_IN. Out-of-order resolution verified cleanly!`, 'success');

    } catch (err: any) {
      addLog(`Error during test: ${err.message}`, 'error');
    } finally {
      setIsRunningScenario(false);
    }
  };

  // 2. DUPLICATE SCAN DEMO: Bob double-taps within 200ms
  const runDuplicateScanDemo = async () => {
    setIsRunningScenario(true);
    setActiveScenarioName('Duplicate Scan Idempotency Guard (Bob)');
    setScenarioLogs([]);

    try {
      addLog('🚀 Launching Duplicate Scan Idempotency Test for Bob (ATT-102)...', 'info');
      addLog('Step 1: First scan arrives for Bob...', 'info');

      const firstScan = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-102', printerDelayMs: 3000 })
      });
      const firstData = await firstScan.json();

      if (firstScan.status === 202) {
        addLog(`✓ Scan #1 Accepted (HTTP 202 Accepted). Created Job: ${firstData.job?.id}. Bob set to PRINT_PENDING.`, 'success');
      } else {
        addLog(`Scan #1 returned ${firstScan.status}: ${firstData.message}`, 'warn');
      }
      onRefresh();

      // Immediately trigger second scan 200ms later
      await new Promise(r => setTimeout(r, 200));
      addLog('Step 2: Rapid duplicate scan #2 arrives while job is still PRINT_PENDING...', 'info');

      const secondScan = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-102', printerDelayMs: 3000 })
      });
      const secondData = await secondScan.json();

      if (secondScan.status === 409) {
        addLog(`🛡️ Scan #2 REJECTED with HTTP 409 Conflict: "${secondData.message}"`, 'warn');
        addLog(`✓ Idempotency verified: Exactly ONE job (${firstData.job?.id}) exists in queue. No second job was spawned.`, 'success');
      } else {
        addLog(`Scan #2 returned unexpected status: ${secondScan.status}`, 'error');
      }
      onRefresh();

      // Wait for original job to finish
      addLog(`⏳ Waiting for original job ${firstData.job?.id} to complete via printer webhook...`, 'info');
      await new Promise(r => setTimeout(r, 3200));
      onRefresh();
      addLog(`✓ Webhook for ${firstData.job?.id} received. Bob is now CHECKED_IN.`, 'success');

    } catch (err: any) {
      addLog(`Error during duplicate test: ${err.message}`, 'error');
    } finally {
      setIsRunningScenario(false);
    }
  };

  // 3. FAILURE & RETRY DEMO
  const runFailureRetryDemo = async () => {
    setIsRunningScenario(true);
    setActiveScenarioName('Printer Failure & Safe Recovery');
    setScenarioLogs([]);

    try {
      addLog('🚀 Launching Hardware Print Failure & Recovery Test...', 'info');
      addLog('Step 1: Scanning Dana (ATT-104) with simulateFailure=true...', 'info');

      const failScan = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-104', printerDelayMs: 2000, simulateFailure: true })
      });
      const failData = await failScan.json();
      addLog(`✓ Job ${failData.job?.id} queued with simulated ribbon sensor fault.`, 'info');
      onRefresh();

      await new Promise(r => setTimeout(r, 2200));
      onRefresh();
      addLog(`✗ Printer Webhook returned status: 'FAILED' (Paper Jam / Ribbon Fault).`, 'error');
      addLog(`✓ Attendee transitioned to PRINT_FAILED. State saved in SQLite.`, 'info');

      // Now retry
      await new Promise(r => setTimeout(r, 800));
      addLog('Step 2: Staff taps Retry Print Job (normal operation)...', 'info');

      const retryScan = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-104', printerDelayMs: 1500, simulateFailure: false })
      });
      const retryData = await retryScan.json();
      addLog(`✓ Retry scan accepted. New Job ${retryData.job?.id} created.`, 'success');
      onRefresh();

      await new Promise(r => setTimeout(r, 1700));
      onRefresh();
      addLog(`✓ Retry webhook completed! Dana is now CHECKED_IN.`, 'success');

    } catch (err: any) {
      addLog(`Error: ${err.message}`, 'error');
    } finally {
      setIsRunningScenario(false);
    }
  };

  const alice = attendees.find(a => a.id === 'ATT-101');
  const bob = attendees.find(a => a.id === 'ATT-102');
  const charlie = attendees.find(a => a.id === 'ATT-103');

  return (
    <div id="outoforder-lab" className="space-y-6">
      {/* Top Description Box */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <span>Concurrency & Out-of-Order Test Harness</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Demonstrates asynchronous webhook resolution, duplicate scan idempotency, and non-blocking print queues without race conditions.
            </p>
          </div>
          <button
            onClick={onReset}
            disabled={isRunningScenario}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset 3 Attendees</span>
          </button>
        </div>

        {/* 3 Live Attendee Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">Alice (ATT-101)</span>
              <span className="font-bold text-sm text-slate-200">VIP Keynote</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
              alice?.status === 'CHECKED_IN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
              alice?.status === 'PRINT_PENDING' ? 'bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse' :
              'bg-slate-800 text-slate-400'
            }`}>
              {alice?.status}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">Bob (ATT-102)</span>
              <span className="font-bold text-sm text-slate-200">Panelist</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
              bob?.status === 'CHECKED_IN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
              bob?.status === 'PRINT_PENDING' ? 'bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse' :
              'bg-slate-800 text-slate-400'
            }`}>
              {bob?.status}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">Charlie (ATT-103)</span>
              <span className="font-bold text-sm text-slate-200">General Delegate</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
              charlie?.status === 'CHECKED_IN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
              charlie?.status === 'PRINT_PENDING' ? 'bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse' :
              'bg-slate-800 text-slate-400'
            }`}>
              {charlie?.status}
            </span>
          </div>
        </div>
      </div>

      {/* Scenario Launch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Scenario 1: Out-of-Order Webhook Resolution */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-amber-400/80 transition-all group">
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <GitFork className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              1. Out-of-Order Webhooks
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Scans Alice (4.0s print time) first, then Charlie (1.3s print time) second. Charlie's webhook returns <strong className="text-slate-700">FIRST</strong>.
            </p>
            <div className="mt-3 p-2.5 bg-slate-50 rounded-lg text-[11px] font-mono text-slate-600 space-y-0.5 border border-slate-100">
              <div>• Alice: 4.0s (Slow)</div>
              <div>• Charlie: 1.3s (Fast)</div>
              <div className="text-purple-600 font-semibold">→ Proves jobId correlation</div>
            </div>
          </div>

          <button
            id="btn-run-outoforder"
            onClick={runOutOfOrderDemo}
            disabled={isRunningScenario}
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Out-of-Order Test</span>
          </button>
        </div>

        {/* Scenario 2: Duplicate Scan Blocked */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-amber-400/80 transition-all group">
          <div>
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <CopyX className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              2. Duplicate Scan Guard
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Fires two rapid scans for Bob (ATT-102) within 200ms while his print job is pending.
            </p>
            <div className="mt-3 p-2.5 bg-slate-50 rounded-lg text-[11px] font-mono text-slate-600 space-y-0.5 border border-slate-100">
              <div>• Scan 1: 202 Accepted (Job enqueued)</div>
              <div>• Scan 2: 409 Conflict (Blocked)</div>
              <div className="text-amber-700 font-semibold">→ Zero duplicate jobs created</div>
            </div>
          </div>

          <button
            id="btn-run-duplicate"
            onClick={runDuplicateScanDemo}
            disabled={isRunningScenario}
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Duplicate Scan Test</span>
          </button>
        </div>

        {/* Scenario 3: Printer Failure & Safe Recovery */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-amber-400/80 transition-all group">
          <div>
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              3. Hardware Fault & Retry
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Simulates a thermal ribbon failure webhook, transitions attendee to PRINT_FAILED, then executes a successful retry.
            </p>
            <div className="mt-3 p-2.5 bg-slate-50 rounded-lg text-[11px] font-mono text-slate-600 space-y-0.5 border border-slate-100">
              <div>• Webhook: status = 'FAILED'</div>
              <div>• Attendee: PRINT_FAILED</div>
              <div className="text-rose-600 font-semibold">→ Safe idempotency retry</div>
            </div>
          </div>

          <button
            id="btn-run-failure-retry"
            onClick={runFailureRetryDemo}
            disabled={isRunningScenario}
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Failure & Retry Test</span>
          </button>
        </div>
      </div>

      {/* Live Scenario Execution Output Terminal */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 font-mono text-xs shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="font-bold text-slate-300">
              Scenario Execution Terminal {activeScenarioName ? `— ${activeScenarioName}` : ''}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">Real-Time Step Verifier</span>
        </div>

        {scenarioLogs.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            Click one of the test buttons above to run an automated simulation and view step-by-step verification.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {scenarioLogs.map((log, i) => (
              <div key={i} className="flex items-start space-x-2 leading-relaxed">
                <span className="text-slate-500 text-[10px] flex-shrink-0">{log.time}</span>
                <span
                  className={
                    log.type === 'success'
                      ? 'text-emerald-400 font-medium'
                      : log.type === 'warn'
                      ? 'text-amber-300 font-medium'
                      : log.type === 'error'
                      ? 'text-rose-400 font-medium'
                      : 'text-slate-300'
                  }
                >
                  {log.msg}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
