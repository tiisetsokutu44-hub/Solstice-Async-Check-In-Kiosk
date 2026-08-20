export type AttendeeStatus = 'NOT_CHECKED_IN' | 'PRINT_PENDING' | 'CHECKED_IN' | 'PRINT_FAILED';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Attendee {
  id: string;
  name: string;
  email: string;
  company: string;
  ticketType: 'VIP Access' | 'Speaker' | 'General Admission' | 'Press';
  badgeRole: string;
  status: AttendeeStatus;
  currentJobId: string | null;
  checkedInAt: string | null;
  lastScannedAt: string | null;
  failureReason: string | null;
  avatarColor: string;
}

export interface PrintJob {
  id: string;
  attendeeId: string;
  attendeeName: string;
  status: JobStatus;
  printerId: string;
  delayMs: number;
  simulateFailure: boolean;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  webhookSentAt: string | null;
  errorMessage: string | null;
  badgeData: {
    name: string;
    company: string;
    ticketType: string;
    badgeRole: string;
    qrCode: string;
  };
}

export interface WebhookPayload {
  jobId: string;
  attendeeId: string;
  status: 'COMPLETED' | 'FAILED';
  printerId: string;
  completedAt: string;
  failureReason?: string;
  meta?: {
    processingDurationMs: number;
    jobSequence: number;
  };
}

export interface CheckInRequest {
  attendeeId?: string;
  qrCode?: string;
  printerDelayMs?: number;
  simulateFailure?: boolean;
}

export interface CheckInResponse {
  success: boolean;
  message: string;
  code: 'JOB_CREATED' | 'ALREADY_CHECKED_IN' | 'PRINT_ALREADY_PENDING' | 'ATTENDEE_NOT_FOUND' | 'ERROR';
  attendee?: Attendee;
  job?: PrintJob;
}

export interface SystemEvent {
  id: string;
  timestamp: string;
  type: 'SCAN_RECEIVED' | 'JOB_ENQUEUED' | 'PRINTER_PROCESSING' | 'WEBHOOK_DISPATCHED' | 'WEBHOOK_RECEIVED' | 'STATUS_UPDATED' | 'DUPLICATE_BLOCKED' | 'PRINT_FAILED' | 'RETRY_INITIATED';
  title: string;
  details: string;
  jobId?: string;
  attendeeId?: string;
  payload?: any;
  level: 'info' | 'success' | 'warn' | 'error';
}
