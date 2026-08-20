import { updateJobStatus, logEvent, getJobById } from './db';
import { PrintJob, WebhookPayload } from '../src/types';

interface QueueItem {
  job: PrintJob;
  delayMs: number;
  timerId?: NodeJS.Timeout;
}

class MockPrinterEngine {
  private activeJobs: Map<string, QueueItem> = new Map();
  private webhookHandler: ((payload: WebhookPayload) => Promise<any>) | null = null;
  private jobCounter = 100;

  public setWebhookHandler(handler: (payload: WebhookPayload) => Promise<any>) {
    this.webhookHandler = handler;
  }

  public generateJobId(): string {
    this.jobCounter++;
    return `JOB-${this.jobCounter}`;
  }

  public async enqueue(job: PrintJob) {
    const queueItem: QueueItem = {
      job,
      delayMs: job.delayMs,
    };

    this.activeJobs.set(job.id, queueItem);

    await logEvent({
      type: 'JOB_ENQUEUED',
      title: `Job ${job.id} Enqueued`,
      details: `Badge print queued for ${job.attendeeName} (${job.attendeeId}) at PRINTER-MAIN-01 with simulated delay of ${job.delayMs}ms.`,
      jobId: job.id,
      attendeeId: job.attendeeId,
      level: 'info',
      payload: { jobId: job.id, attendeeId: job.attendeeId, delayMs: job.delayMs, simulateFailure: job.simulateFailure }
    });

    // Start processing in background (simulating async print job execution)
    this.processJob(job.id, job.delayMs, job.simulateFailure);
  }

  private async processJob(jobId: string, delayMs: number, simulateFailure: boolean) {
    const startedAt = new Date().toISOString();
    await updateJobStatus(jobId, 'PROCESSING', { startedAt });

    await logEvent({
      type: 'PRINTER_PROCESSING',
      title: `Printer Processing ${jobId}`,
      details: `Thermal badge head warming and ribbon advancing...`,
      jobId,
      level: 'info'
    });

    // Simulate async hardware delay
    setTimeout(async () => {
      try {
        const item = this.activeJobs.get(jobId);
        if (!item) return;

        const completedAt = new Date().toISOString();
        const isFailure = simulateFailure;
        const failureReason = isFailure ? 'Simulated Hardware Error: Ribbon sensor fault or paper jam' : undefined;
        const newStatus = isFailure ? 'FAILED' : 'COMPLETED';

        await updateJobStatus(jobId, newStatus, {
          completedAt,
          errorMessage: failureReason || null,
        });

        // Formulate webhook payload
        const webhookPayload: WebhookPayload = {
          jobId,
          attendeeId: item.job.attendeeId,
          status: isFailure ? 'FAILED' : 'COMPLETED',
          printerId: item.job.printerId,
          completedAt,
          failureReason,
          meta: {
            processingDurationMs: delayMs,
            jobSequence: Number(jobId.replace('JOB-', '')) || 0
          }
        };

        await logEvent({
          type: 'WEBHOOK_DISPATCHED',
          title: `Printer Webhook Dispatched (${jobId})`,
          details: `Vendor printer service sending POST /api/webhooks/printer with status=${webhookPayload.status}`,
          jobId,
          attendeeId: item.job.attendeeId,
          payload: webhookPayload,
          level: isFailure ? 'warn' : 'info'
        });

        // Mark webhook sent timestamp
        await updateJobStatus(jobId, newStatus, {
          webhookSentAt: new Date().toISOString(),
        });

        this.activeJobs.delete(jobId);

        // Deliver webhook to server receiver
        if (this.webhookHandler) {
          await this.webhookHandler(webhookPayload);
        }
      } catch (err: any) {
        console.error(`Error in printer simulation for ${jobId}:`, err);
        await logEvent({
          type: 'PRINT_FAILED',
          title: `Printer Simulation Error (${jobId})`,
          details: err?.message || 'Unknown processing failure',
          jobId,
          level: 'error'
        });
      }
    }, delayMs);
  }

  public getActiveJobsCount(): number {
    return this.activeJobs.size;
  }
}

export const mockPrinter = new MockPrinterEngine();
