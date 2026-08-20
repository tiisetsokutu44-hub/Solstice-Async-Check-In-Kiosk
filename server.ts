import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getDb,
  seedDatabase,
  getAllAttendees,
  getAttendeeById,
  getAttendeeByJobId,
  updateAttendeeStatus,
  getAllJobs,
  createPrintJob,
  logEvent,
  getRecentLogs,
  subscribeEvents
} from './server/db';
import { mockPrinter } from './server/printer';
import { WebhookPayload, CheckInResponse } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize DB
  await getDb();

  // Connect printer webhook dispatcher to our webhook endpoint
  mockPrinter.setWebhookHandler(async (payload: WebhookPayload) => {
    return handlePrinterWebhook(payload, 'MOCK_PRINTER_SERVICE');
  });

  // Reusable core webhook handling logic (called by both HTTP route and internal service)
  async function handlePrinterWebhook(payload: WebhookPayload, source = 'HTTP_REQUEST') {
    const { jobId, attendeeId, status, failureReason, completedAt } = payload;

    await logEvent({
      type: 'WEBHOOK_RECEIVED',
      title: `Webhook Received for ${jobId}`,
      details: `Source: ${source} | Status: ${status} | Matching database by current_job_id = '${jobId}'`,
      jobId,
      attendeeId,
      payload,
      level: 'info'
    });

    // CRITICAL: Match attendee by jobId, NEVER by arrival queue order!
    let attendee = await getAttendeeByJobId(jobId);

    // Fallback: If not found by current_job_id, attempt by attendeeId if provided
    if (!attendee && attendeeId) {
      attendee = await getAttendeeById(attendeeId);
    }

    if (!attendee) {
      await logEvent({
        type: 'PRINT_FAILED',
        title: `Unmatched Webhook for ${jobId}`,
        details: `No attendee record in database with current_job_id='${jobId}'. Webhook discarded safely.`,
        jobId,
        level: 'warn'
      });
      return { success: false, error: `No attendee found associated with jobId ${jobId}` };
    }

    if (status === 'COMPLETED') {
      const updated = await updateAttendeeStatus(attendee.id, 'CHECKED_IN', {
        checkedInAt: completedAt || new Date().toISOString(),
        failureReason: null
      });

      await logEvent({
        type: 'STATUS_UPDATED',
        title: `✓ Check-In Confirmed: ${attendee.name}`,
        details: `Attendee ${attendee.id} transitioned PRINT_PENDING → CHECKED_IN via webhook match on ${jobId}.`,
        jobId,
        attendeeId: attendee.id,
        level: 'success'
      });

      return { success: true, attendee: updated };
    } else {
      const reason = failureReason || 'Printer error occurred during thermal transfer.';
      const updated = await updateAttendeeStatus(attendee.id, 'PRINT_FAILED', {
        failureReason: reason
      });

      await logEvent({
        type: 'PRINT_FAILED',
        title: `✗ Print Job Failed: ${attendee.name}`,
        details: `Job ${jobId} failed: ${reason}. Attendee set to PRINT_FAILED.`,
        jobId,
        attendeeId: attendee.id,
        level: 'error',
        payload: { error: reason }
      });

      return { success: true, attendee: updated };
    }
  }

  // API Routes
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString(), activeJobs: mockPrinter.getActiveJobsCount() });
  });

  // Real-time Server-Sent Events stream for instant kiosk state updates
  app.get('/api/events/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial ping
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    const unsubscribe = subscribeEvents((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  // Get all attendees
  app.get('/api/attendees', async (req: Request, res: Response) => {
    try {
      const attendees = await getAllAttendees();
      res.json({ attendees });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single attendee
  app.get('/api/attendees/:id', async (req: Request, res: Response) => {
    try {
      const attendee = await getAttendeeById(req.params.id);
      if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
      res.json({ attendee });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get all jobs
  app.get('/api/jobs', async (req: Request, res: Response) => {
    try {
      const jobs = await getAllJobs();
      res.json({ jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get recent logs
  app.get('/api/logs', async (req: Request, res: Response) => {
    try {
      const logs = await getRecentLogs(50);
      res.json({ logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // QR Scan / Check-In Initiation
  app.post('/api/check-in', async (req: Request, res: Response) => {
    try {
      let { attendeeId, qrCode, printerDelayMs, simulateFailure } = req.body;

      // Extract ID from QR string if scanned from camera or QR code
      if (!attendeeId && qrCode) {
        const match = qrCode.match(/ATT-\d+/i) || qrCode.match(/SOLSTICE:(ATT-\d+)/i);
        if (match) {
          attendeeId = match[1] || match[0];
        } else {
          attendeeId = qrCode.trim();
        }
      }

      if (!attendeeId) {
        return res.status(400).json({
          success: false,
          code: 'ATTENDEE_NOT_FOUND',
          message: 'No attendee ID or QR code provided in request.'
        } as CheckInResponse);
      }

      const attendee = await getAttendeeById(attendeeId);
      if (!attendee) {
        return res.status(404).json({
          success: false,
          code: 'ATTENDEE_NOT_FOUND',
          message: `Attendee '${attendeeId}' was not found in the registration system.`
        } as CheckInResponse);
      }

      const now = new Date().toISOString();

      // DUPLICATE SCAN & IDEMPOTENCY HANDLING
      if (attendee.status === 'PRINT_PENDING') {
        await logEvent({
          type: 'DUPLICATE_BLOCKED',
          title: `Duplicate Scan Blocked (${attendee.name})`,
          details: `Attendee ${attendee.id} is already in PRINT_PENDING status (Active Job: ${attendee.currentJobId}). Second scan is a no-op; no second job created.`,
          attendeeId: attendee.id,
          jobId: attendee.currentJobId || undefined,
          level: 'warn',
          payload: { attendeeId: attendee.id, currentJobId: attendee.currentJobId, currentStatus: attendee.status }
        });

        return res.status(409).json({
          success: false,
          code: 'PRINT_ALREADY_PENDING',
          message: `Badge is already printing (Job: ${attendee.currentJobId}). Please wait for badge output.`,
          attendee
        } as CheckInResponse);
      }

      if (attendee.status === 'CHECKED_IN') {
        await logEvent({
          type: 'DUPLICATE_BLOCKED',
          title: `Already Checked-In (${attendee.name})`,
          details: `Attendee ${attendee.id} was already checked in at ${attendee.checkedInAt}. Duplicate check-in rejected.`,
          attendeeId: attendee.id,
          level: 'warn',
          payload: { attendeeId: attendee.id, checkedInAt: attendee.checkedInAt }
        });

        return res.status(409).json({
          success: false,
          code: 'ALREADY_CHECKED_IN',
          message: `Attendee is already checked in (${attendee.name}).`,
          attendee
        } as CheckInResponse);
      }

      // Valid check-in: Create new print job
      const jobId = mockPrinter.generateJobId();
      const delay = typeof printerDelayMs === 'number' && printerDelayMs >= 500 ? printerDelayMs : 2500;
      const isFail = Boolean(simulateFailure);

      const job = await createPrintJob({
        id: jobId,
        attendeeId: attendee.id,
        attendeeName: attendee.name,
        printerId: 'PRINTER-MAIN-01',
        delayMs: delay,
        simulateFailure: isFail
      });

      // Update attendee to PRINT_PENDING
      const updatedAttendee = await updateAttendeeStatus(attendee.id, 'PRINT_PENDING', {
        jobId,
        lastScannedAt: now,
        failureReason: null
      });

      await logEvent({
        type: 'SCAN_RECEIVED',
        title: `Scan Validated: ${attendee.name}`,
        details: `Attendee ${attendee.id} scanned. State changed: NOT_CHECKED_IN → PRINT_PENDING. Spawned print job ${jobId}.`,
        jobId,
        attendeeId: attendee.id,
        level: 'info'
      });

      // Enqueue job in async mock printer engine
      mockPrinter.enqueue(job);

      return res.status(202).json({
        success: true,
        code: 'JOB_CREATED',
        message: `Check-in initiated. Badge printing job ${jobId} submitted. Awaiting printer webhook.`,
        attendee: updatedAttendee,
        job
      } as CheckInResponse);

    } catch (err: any) {
      console.error('Check-in error:', err);
      return res.status(500).json({
        success: false,
        code: 'ERROR',
        message: err?.message || 'Internal server error during check-in'
      } as CheckInResponse);
    }
  });

  // Printer Webhook Endpoint
  app.post('/api/webhooks/printer', async (req: Request, res: Response) => {
    try {
      const payload: WebhookPayload = req.body;
      if (!payload || !payload.jobId) {
        return res.status(400).json({ error: 'Missing jobId in webhook payload' });
      }

      const result = await handlePrinterWebhook(payload, 'EXTERNAL_HTTP_WEBHOOK');
      if (!result.success) {
        return res.status(404).json(result);
      }
      return res.json({ received: true, payload, result });
    } catch (err: any) {
      console.error('Webhook error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Reset database endpoint
  app.post('/api/reset', async (req: Request, res: Response) => {
    try {
      await seedDatabase();
      const attendees = await getAllAttendees();
      const jobs = await getAllJobs();
      res.json({ success: true, message: 'Database reset to initial test state', attendees, jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Automated Scenarios
  // 1. Out-of-order webhook demonstration (Alice 4000ms, Charlie 1200ms)
  app.post('/api/scenarios/out-of-order', async (req: Request, res: Response) => {
    try {
      await logEvent({
        type: 'SCAN_RECEIVED',
        title: '🧪 Test Scenario: Out-of-Order Webhooks Started',
        details: 'Scanning Alice first (4.0s print time), then Charlie second (1.4s print time). Charlie will finish and send webhook BEFORE Alice.',
        level: 'info'
      });

      // Scan Alice with 4000ms delay
      const aliceRes = await fetch(`http://127.0.0.1:${PORT}/api/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-101', printerDelayMs: 4000 })
      });
      const aliceData = await aliceRes.json();

      // Scan Charlie 300ms later with 1400ms delay
      await new Promise(r => setTimeout(r, 300));
      const charlieRes = await fetch(`http://127.0.0.1:${PORT}/api/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-103', printerDelayMs: 1400 })
      });
      const charlieData = await charlieRes.json();

      res.json({
        success: true,
        message: 'Out-of-order test launched! Alice (JOB-00X) is slow (4.0s); Charlie (JOB-00Y) is fast (1.4s). Watch the log stream!',
        aliceData,
        charlieData
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Duplicate Scan simulation (Bob scanned twice in rapid succession)
  app.post('/api/scenarios/duplicate', async (req: Request, res: Response) => {
    try {
      await logEvent({
        type: 'SCAN_RECEIVED',
        title: '🧪 Test Scenario: Duplicate Scan Test Started',
        details: 'Attempting two rapid scans of Bob (ATT-102) within 200ms while print job is still pending.',
        level: 'info'
      });

      // First scan
      const firstScan = await fetch(`http://127.0.0.1:${PORT}/api/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-102', printerDelayMs: 3500 })
      });
      const firstData = await firstScan.json();

      // Wait 250ms and attempt duplicate scan
      await new Promise(r => setTimeout(r, 250));
      const secondScan = await fetch(`http://127.0.0.1:${PORT}/api/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: 'ATT-102', printerDelayMs: 3500 })
      });
      const secondData = await secondScan.json();

      res.json({
        success: true,
        message: 'Duplicate scan executed.',
        firstScan: { status: firstScan.status, data: firstData },
        secondScan: { status: secondScan.status, data: secondData }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development vs static production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Solstice Check-In Kiosk Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
