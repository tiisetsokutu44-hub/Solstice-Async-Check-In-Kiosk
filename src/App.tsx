import React, { useState, useEffect, useCallback } from 'react';
import { Attendee, PrintJob, SystemEvent, CheckInResponse } from './types';
import { Header } from './components/Header';
import { AttendeeRoster } from './components/AttendeeRoster';
import { KioskSimulator } from './components/KioskSimulator';
import { OutofOrderLab } from './components/OutofOrderLab';
import { WebhookInspector } from './components/WebhookInspector';
import { ArchitectureDocs } from './components/ArchitectureDocs';
import { ScannerViewModal } from './components/ScannerViewModal';
import { Sparkles, Printer, ShieldCheck, Activity, RotateCcw } from 'lucide-react';

export default function App() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'kiosk' | 'lab' | 'inspector' | 'architecture'>('kiosk');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string | null>('ATT-101');
  const [isResetting, setIsResetting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Fetch attendees and jobs
  const fetchData = useCallback(async () => {
    try {
      const [attRes, jobsRes, logsRes] = await Promise.all([
        fetch('/api/attendees'),
        fetch('/api/jobs'),
        fetch('/api/logs')
      ]);

      if (attRes.ok) {
        const attData = await attRes.json();
        setAttendees(attData.attendees || []);
      }
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData.jobs || []);
      }
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setEvents(logsData.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Setup Server-Sent Events for real-time reactive updates
    const eventSource = new EventSource('/api/events/stream');

    eventSource.onmessage = (e) => {
      try {
        const eventData = JSON.parse(e.data);
        if (eventData.id) {
          setEvents((prev) => [eventData, ...prev.slice(0, 99)]);
        }
        // Whenever any event fires, update attendees and jobs in background
        fetchData();
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    // Polling fallback every 2 seconds
    const interval = setInterval(fetchData, 2000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [fetchData]);

  // Handle Scan from Kiosk or Roster
  const handleScan = async (
    attendeeId: string,
    options: { printerDelayMs?: number; simulateFailure?: boolean } = {}
  ): Promise<CheckInResponse> => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeId,
          printerDelayMs: options.printerDelayMs,
          simulateFailure: options.simulateFailure
        })
      });

      const data: CheckInResponse = await res.json();
      await fetchData();
      return data;
    } catch (err: any) {
      return {
        success: false,
        code: 'ERROR',
        message: err?.message || 'Network error during check-in scan'
      };
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Rapid Double Scan Trigger
  const handleTriggerDuplicateScan = async (attendeeId: string) => {
    setIsScanning(true);
    try {
      // First scan
      await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId, printerDelayMs: 3000 })
      });
      fetchData();

      // Immediately attempt second scan 150ms later
      await new Promise(r => setTimeout(r, 150));
      await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId, printerDelayMs: 3000 })
      });
      await fetchData();
    } finally {
      setIsScanning(false);
    }
  };

  // Reset database to initial test state (Alice, Bob, Charlie)
  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        await fetchData();
        setSelectedAttendeeId('ATT-101');
      }
    } catch (err) {
      console.error('Reset error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const activeJobsCount = jobs.filter(j => j.status === 'QUEUED' || j.status === 'PROCESSING').length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Top Solstice Brand Header */}
      <Header
        activeJobsCount={activeJobsCount}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReset={handleReset}
        isResetting={isResetting}
        onOpenScanner={() => setIsScannerOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Quick Context Strip */}
        <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-xs text-slate-200 block">
                Async Webhook Architecture Model
              </span>
              <span className="text-[11px] text-slate-400">
                Scan QR → Job Enqueued (PRINT_PENDING) → Vendor Webhook Received → Checked-In Confirmed
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-slate-400">Active Queue:</span>
              <span className="font-bold text-amber-400">{activeJobsCount} Jobs</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-slate-400">Checked In:</span>
              <span className="font-bold text-emerald-400">
                {attendees.filter(a => a.status === 'CHECKED_IN').length} / {attendees.length}
              </span>
            </div>
          </div>
        </div>

        {/* Tab 1: Kiosk Simulator & Badge Dispenser */}
        {activeTab === 'kiosk' && (
          <div className="space-y-6">
            <KioskSimulator
              attendees={attendees}
              activeJobs={jobs}
              onScan={handleScan}
              onTriggerDuplicateScan={handleTriggerDuplicateScan}
              selectedAttendeeId={selectedAttendeeId}
              onSelectAttendee={(id) => setSelectedAttendeeId(id)}
              onOpenScanner={() => setIsScannerOpen(true)}
            />

            {/* Bottom Section: SQLite Attendee Roster */}
            <div className="mt-8">
              <AttendeeRoster
                attendees={attendees}
                activeJobs={jobs}
                onScanAttendee={(id) => {
                  setSelectedAttendeeId(id);
                  handleScan(id);
                }}
                isScanning={isScanning}
                selectedAttendeeId={selectedAttendeeId}
                onSelectAttendee={(id) => setSelectedAttendeeId(id)}
                onOpenScanner={() => setIsScannerOpen(true)}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Concurrency & Out-of-Order Lab */}
        {activeTab === 'lab' && (
          <div className="space-y-6">
            <OutofOrderLab
              attendees={attendees}
              activeJobs={jobs}
              onReset={handleReset}
              onRefresh={fetchData}
            />

            <AttendeeRoster
              attendees={attendees}
              activeJobs={jobs}
              onScanAttendee={(id) => {
                setSelectedAttendeeId(id);
                handleScan(id);
              }}
              isScanning={isScanning}
              selectedAttendeeId={selectedAttendeeId}
              onSelectAttendee={(id) => setSelectedAttendeeId(id)}
              onOpenScanner={() => setIsScannerOpen(true)}
            />
          </div>
        )}

        {/* Tab 3: Live Webhook & Event Telemetry Feed */}
        {activeTab === 'inspector' && (
          <WebhookInspector
            events={events}
            activeJobs={jobs}
          />
        )}

        {/* Tab 4: Architecture Sketch & Database Schema */}
        {activeTab === 'architecture' && (
          <ArchitectureDocs />
        )}
      </main>

      {/* Camera QR Scanner View Modal */}
      <ScannerViewModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScan}
        attendees={attendees}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>Solstice Events Co. • Asynchronous Badge Printing & Webhook Resolution Engine</p>
      </footer>
    </div>
  );
}
