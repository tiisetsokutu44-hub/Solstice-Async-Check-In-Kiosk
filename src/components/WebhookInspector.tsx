import React, { useState } from 'react';
import { SystemEvent, PrintJob } from '../types';
import {
  Activity,
  Send,
  Download,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Code,
  ShieldCheck,
  Zap,
  Server
} from 'lucide-react';

interface WebhookInspectorProps {
  events: SystemEvent[];
  activeJobs: PrintJob[];
  onTriggerManualWebhook?: (payload: any) => Promise<void>;
}

export const WebhookInspector: React.FC<WebhookInspectorProps> = ({
  events,
  activeJobs,
  onTriggerManualWebhook
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<SystemEvent | null>(events[0] || null);
  const [manualJobId, setManualJobId] = useState('');
  const [manualStatus, setManualStatus] = useState<'COMPLETED' | 'FAILED'>('COMPLETED');
  const [isSendingManual, setIsSendingManual] = useState(false);

  const filteredEvents = events.filter(e => {
    if (filterType === 'ALL') return true;
    if (filterType === 'WEBHOOKS') return e.type.includes('WEBHOOK');
    if (filterType === 'SCANS') return e.type.includes('SCAN') || e.type.includes('DUPLICATE');
    if (filterType === 'STATUS') return e.type.includes('STATUS');
    return true;
  });

  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualJobId.trim()) return;

    setIsSendingManual(true);
    try {
      await fetch('/api/webhooks/printer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: manualJobId.trim(),
          status: manualStatus,
          printerId: 'MANUAL-TEST-01',
          completedAt: new Date().toISOString(),
          failureReason: manualStatus === 'FAILED' ? 'Manual test error injected' : undefined
        })
      });
      setManualJobId('');
    } catch (err) {
      console.error('Manual webhook error:', err);
    } finally {
      setIsSendingManual(false);
    }
  };

  return (
    <div id="webhook-inspector" className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-base text-white">Live Webhook & Telemetry Stream</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time audit logs of scan ingress, queue transitions, and async printer webhooks
          </p>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {['ALL', 'WEBHOOKS', 'SCANS', 'STATUS'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterType === f
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Stream on Left, Payload Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Event List */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Event Timeline ({filteredEvents.length} events)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Auto-updating via SSE
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No events recorded yet. Trigger a scan from the Kiosk or Test Lab.
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const isSelected = selectedEvent?.id === evt.id;
                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className={`p-3.5 transition-colors cursor-pointer text-left flex items-start space-x-3 ${
                      isSelected ? 'bg-amber-50/80 border-l-4 border-amber-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Icon */}
                    <div className="mt-0.5 flex-shrink-0">
                      {evt.level === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      {evt.level === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      {evt.level === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                      {evt.level === 'info' && <Clock className="w-4 h-4 text-blue-600" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">{evt.title}</span>
                        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{evt.details}</p>

                      {/* Tag badges */}
                      <div className="flex items-center space-x-2 mt-1.5">
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {evt.type}
                        </span>
                        {evt.jobId && (
                          <span className="text-[10px] font-mono bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold">
                            {evt.jobId}
                          </span>
                        )}
                        {evt.attendeeId && (
                          <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            {evt.attendeeId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Event Detail & Payload Inspector */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950 text-white rounded-2xl p-5 border border-slate-800 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <Code className="w-4 h-4 text-amber-400" />
                <span>JSON Payload Inspector</span>
              </span>
              {selectedEvent?.type && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                  {selectedEvent.type}
                </span>
              )}
            </div>

            {selectedEvent ? (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{selectedEvent.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedEvent.details}</p>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                    Structured Payload
                  </span>
                  <pre className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-56">
                    {JSON.stringify(
                      selectedEvent.payload || {
                        eventId: selectedEvent.id,
                        timestamp: selectedEvent.timestamp,
                        jobId: selectedEvent.jobId,
                        attendeeId: selectedEvent.attendeeId,
                        level: selectedEvent.level
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Select an event from the timeline to inspect its payload.
              </div>
            )}
          </div>

          {/* Manual Webhook Injector */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2 mb-3">
              <Send className="w-4 h-4 text-slate-700" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                Manual Webhook Injection
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Simulate an external HTTP POST to <code className="font-mono text-slate-800">/api/webhooks/printer</code>.
            </p>

            <form onSubmit={handleSendManual} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Job ID</label>
                  <input
                    type="text"
                    placeholder="e.g. JOB-101"
                    value={manualJobId}
                    onChange={(e) => setManualJobId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500"
                  >
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSendingManual || !manualJobId.trim()}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Post Webhook to Backend</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
