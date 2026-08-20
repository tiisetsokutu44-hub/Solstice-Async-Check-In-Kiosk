import React from 'react';
import { BookOpen, Database, Cpu, Network, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const ArchitectureDocs: React.FC = () => {
  return (
    <div id="architecture-docs" className="space-y-8 max-w-4xl mx-auto">
      {/* Overview Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              System Architecture & Specification
            </h2>
            <p className="text-xs text-amber-400/90 font-mono">
              Solstice Events Co. • Asynchronous Check-In & Badge Printing Engine
            </p>
          </div>
        </div>
      </div>

      {/* 1. Architecture Sketch (Components & Data Flow) */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Cpu className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold text-base text-slate-900">
            1. Architecture Sketch
          </h3>
        </div>

        <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-1.5 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Components</span>
            </h4>
            <p>
              The system consists of four primary decoupled components: a lightweight <strong>React Kiosk UI</strong> that listens to live server-sent state updates without blocking user interaction; an <strong>Express API Backend</strong> that enforces idempotency guards and coordinates job lifecycle; an embedded <strong>SQLite Database</strong> holding transactional attendee states, print jobs, and audit logs; and an <strong>Asynchronous Mock Printer Engine</strong> that queues print jobs, simulates physical hardware latency, and asynchronously notifies the backend via HTTP webhooks upon completion.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-1.5 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>Data Flow</span>
            </h4>
            <p>
              An attendee scans their QR code at the kiosk; the backend queries SQLite to verify the attendee exists and is strictly in <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">NOT_CHECKED_IN</code> or <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">PRINT_FAILED</code> status (ignoring or rejecting duplicates in <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">PRINT_PENDING</code> or <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">CHECKED_IN</code>), creates a unique <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">jobId</code>, updates the attendee record to <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">PRINT_PENDING</code> with <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">current_job_id</code>, and pushes the job to the printer queue. The printer executes asynchronously in the background and delivers a POST webhook payload to <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">/api/webhooks/printer</code>; the webhook handler looks up the attendee by matching <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">WHERE current_job_id = payload.jobId</code> (guaranteeing out-of-order correctness regardless of arrival sequence) and transitions the attendee to <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">CHECKED_IN</code> or <code className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">PRINT_FAILED</code>, which then streams live to the Kiosk UI.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Database Schema */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Database className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold text-base text-slate-900">
            2. SQLite Database Schema
          </h3>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto">
            <pre>{`-- 1. Attendees Table
CREATE TABLE attendees (
  id TEXT PRIMARY KEY,                       -- e.g. 'ATT-101'
  name TEXT NOT NULL,                        -- e.g. 'Alice Henderson'
  email TEXT NOT NULL,                       -- e.g. 'alice@solstice.events'
  company TEXT NOT NULL,                     -- e.g. 'Apex Media Labs'
  ticket_type TEXT NOT NULL,                 -- e.g. 'VIP Access', 'Speaker'
  badge_role TEXT NOT NULL,                  -- e.g. 'Keynote Speaker'
  status TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN', -- 'NOT_CHECKED_IN' | 'PRINT_PENDING' | 'CHECKED_IN' | 'PRINT_FAILED'
  current_job_id TEXT,                       -- References active print_jobs.id
  checked_in_at TEXT,                        -- ISO 8601 Timestamp of webhook completion
  last_scanned_at TEXT,                      -- ISO 8601 Timestamp of latest scan
  failure_reason TEXT,                       -- Diagnostic error from printer if FAILED
  avatar_color TEXT NOT NULL
);

-- 2. Print Jobs Queue Table
CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY,                       -- e.g. 'JOB-101'
  attendee_id TEXT NOT NULL,                 -- References attendees.id
  attendee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',     -- 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  printer_id TEXT NOT NULL,                  -- 'PRINTER-MAIN-01'
  delay_ms INTEGER NOT NULL DEFAULT 2500,    -- Simulated printer hardware latency
  simulate_failure INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  webhook_sent_at TEXT,
  error_message TEXT,
  FOREIGN KEY(attendee_id) REFERENCES attendees(id)
);

-- 3. Audit & Telemetry Events Table
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,                        -- 'SCAN_RECEIVED', 'WEBHOOK_RECEIVED', etc.
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  job_id TEXT,
  attendee_id TEXT,
  payload_json TEXT,
  level TEXT NOT NULL
);`}</pre>
          </div>
        </div>
      </div>

      {/* 3. API & Webhook Contracts */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Network className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold text-base text-slate-900">
            3. API & Webhook Specifications
          </h3>
        </div>

        <div className="space-y-5 text-xs">
          {/* Endpoint 1 */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2 py-0.5 rounded font-bold font-mono bg-blue-600 text-white">POST</span>
              <span className="font-mono font-bold text-slate-800 text-sm">/api/check-in</span>
            </div>
            <p className="text-slate-600 mb-3">Initiates scan, validates attendee, checks idempotency, and enqueues job.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Request Payload</span>
                <pre className="p-2.5 bg-slate-900 text-slate-200 rounded-lg text-[11px] overflow-x-auto">{`{
  "attendeeId": "ATT-101",
  "qrCode": "SOLSTICE:ATT-101",
  "printerDelayMs": 2500,
  "simulateFailure": false
}`}</pre>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Response (HTTP 202 Accepted)</span>
                <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg text-[11px] overflow-x-auto">{`{
  "success": true,
  "code": "JOB_CREATED",
  "message": "Badge print job queued.",
  "attendee": { "id": "ATT-101", "status": "PRINT_PENDING", ... },
  "job": { "id": "JOB-101", "status": "QUEUED", ... }
}`}</pre>
              </div>
            </div>
          </div>

          {/* Endpoint 2 */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2 py-0.5 rounded font-bold font-mono bg-emerald-600 text-white">POST</span>
              <span className="font-mono font-bold text-slate-800 text-sm">/api/webhooks/printer</span>
            </div>
            <p className="text-slate-600 mb-3">
              Received from vendor printer when physical badge is finished. Correlates by <code className="font-mono">jobId</code>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Webhook Ingress Payload</span>
                <pre className="p-2.5 bg-slate-900 text-amber-300 rounded-lg text-[11px] overflow-x-auto">{`{
  "jobId": "JOB-101",
  "attendeeId": "ATT-101",
  "status": "COMPLETED",
  "printerId": "PRINTER-MAIN-01",
  "completedAt": "2026-08-20T10:14:02.120Z",
  "meta": {
    "processingDurationMs": 2500,
    "jobSequence": 101
  }
}`}</pre>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Response (HTTP 200 OK)</span>
                <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg text-[11px] overflow-x-auto">{`{
  "received": true,
  "result": {
    "success": true,
    "attendee": {
      "id": "ATT-101",
      "status": "CHECKED_IN",
      "checkedInAt": "2026-08-20T10:14:02.120Z"
    }
  }
}`}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
