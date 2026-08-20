import initSqlJs, { Database } from 'sql.js';
import { Attendee, PrintJob, SystemEvent } from '../src/types';

let db: Database | null = null;
let eventListeners: ((event: SystemEvent) => void)[] = [];

export function subscribeEvents(listener: (event: SystemEvent) => void) {
  eventListeners.push(listener);
  return () => {
    eventListeners = eventListeners.filter(l => l !== listener);
  };
}

export function broadcastEvent(event: SystemEvent) {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error('Error broadcasting event:', err);
    }
  }
}

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  db = new SQL.Database();

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS attendees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      badge_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN',
      current_job_id TEXT,
      checked_in_at TEXT,
      last_scanned_at TEXT,
      failure_reason TEXT,
      avatar_color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY,
      attendee_id TEXT NOT NULL,
      attendee_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      printer_id TEXT NOT NULL,
      delay_ms INTEGER NOT NULL DEFAULT 2500,
      simulate_failure INTEGER NOT NULL DEFAULT 0,
      queued_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      webhook_sent_at TEXT,
      error_message TEXT,
      FOREIGN KEY(attendee_id) REFERENCES attendees(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      job_id TEXT,
      attendee_id TEXT,
      payload_json TEXT,
      level TEXT NOT NULL
    );
  `);

  await seedDatabase(db);
  return db;
}

export async function seedDatabase(database?: Database) {
  const targetDb = database || (await getDb());

  // Clear existing
  targetDb.run(`DELETE FROM print_jobs;`);
  targetDb.run(`DELETE FROM audit_logs;`);
  targetDb.run(`DELETE FROM attendees;`);

  // Seed 3 baseline attendees (Alice, Bob, Charlie)
  const initialAttendees = [
    {
      id: 'ATT-101',
      name: 'Alice Henderson',
      email: 'alice.h@solstice.events',
      company: 'Apex Media Labs',
      ticket_type: 'VIP Access',
      badge_role: 'Keynote Speaker',
      status: 'NOT_CHECKED_IN',
      avatar_color: '#3B82F6', // Blue
    },
    {
      id: 'ATT-102',
      name: 'Bob Martinez',
      email: 'bob.m@quantumflow.io',
      company: 'QuantumFlow',
      ticket_type: 'Speaker',
      badge_role: 'Panelist',
      status: 'NOT_CHECKED_IN',
      avatar_color: '#10B981', // Emerald
    },
    {
      id: 'ATT-103',
      name: 'Charlie Dupont',
      email: 'charlie.d@aurora-tech.com',
      company: 'Aurora Systems',
      ticket_type: 'General Admission',
      badge_role: 'Delegate',
      status: 'NOT_CHECKED_IN',
      avatar_color: '#8B5CF6', // Purple
    },
    {
      id: 'ATT-104',
      name: 'Dana Sterling (Demo)',
      email: 'dana.s@solstice.events',
      company: 'Solstice Events Co.',
      ticket_type: 'VIP Access',
      badge_role: 'Event Director',
      status: 'NOT_CHECKED_IN',
      avatar_color: '#F59E0B', // Amber
    }
  ];

  for (const a of initialAttendees) {
    targetDb.run(
      `INSERT INTO attendees (id, name, email, company, ticket_type, badge_role, status, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.name, a.email, a.company, a.ticket_type, a.badge_role, a.status, a.avatar_color]
    );
  }

  logEvent({
    type: 'STATUS_UPDATED',
    title: 'Database Initialized',
    details: 'Seeded initial attendees: Alice Henderson (ATT-101), Bob Martinez (ATT-102), Charlie Dupont (ATT-103)',
    level: 'info'
  });
}

export function mapRowToAttendee(row: any[]): Attendee {
  return {
    id: row[0],
    name: row[1],
    email: row[2],
    company: row[3],
    ticketType: row[4],
    badgeRole: row[5],
    status: row[6],
    currentJobId: row[7],
    checkedInAt: row[8],
    lastScannedAt: row[9],
    failureReason: row[10],
    avatarColor: row[11],
  };
}

export function mapRowToPrintJob(row: any[]): PrintJob {
  return {
    id: row[0],
    attendeeId: row[1],
    attendeeName: row[2],
    status: row[3],
    printerId: row[4],
    delayMs: Number(row[5]),
    simulateFailure: Boolean(row[6]),
    queuedAt: row[7],
    startedAt: row[8],
    completedAt: row[9],
    webhookSentAt: row[10],
    errorMessage: row[11],
    badgeData: {
      name: row[2],
      company: '',
      ticketType: '',
      badgeRole: '',
      qrCode: `SOLSTICE:${row[1]}`
    }
  };
}

export async function getAllAttendees(): Promise<Attendee[]> {
  const database = await getDb();
  const res = database.exec(`SELECT id, name, email, company, ticket_type, badge_role, status, current_job_id, checked_in_at, last_scanned_at, failure_reason, avatar_color FROM attendees ORDER BY id ASC`);
  if (!res.length || !res[0].values) return [];
  return res[0].values.map(mapRowToAttendee);
}

export async function getAttendeeById(id: string): Promise<Attendee | null> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT id, name, email, company, ticket_type, badge_role, status, current_job_id, checked_in_at, last_scanned_at, failure_reason, avatar_color FROM attendees WHERE id = ?`);
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return mapRowToAttendee(row);
  }
  stmt.free();
  return null;
}

export async function getAttendeeByJobId(jobId: string): Promise<Attendee | null> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT id, name, email, company, ticket_type, badge_role, status, current_job_id, checked_in_at, last_scanned_at, failure_reason, avatar_color FROM attendees WHERE current_job_id = ?`);
  stmt.bind([jobId]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return mapRowToAttendee(row);
  }
  stmt.free();
  return null;
}

export async function updateAttendeeStatus(
  id: string,
  status: Attendee['status'],
  opts: {
    jobId?: string | null;
    checkedInAt?: string | null;
    lastScannedAt?: string | null;
    failureReason?: string | null;
  } = {}
) {
  const database = await getDb();
  const current = await getAttendeeById(id);
  if (!current) return null;

  const newJobId = opts.jobId !== undefined ? opts.jobId : current.currentJobId;
  const newCheckedInAt = opts.checkedInAt !== undefined ? opts.checkedInAt : current.checkedInAt;
  const newLastScannedAt = opts.lastScannedAt !== undefined ? opts.lastScannedAt : current.lastScannedAt;
  const newFailureReason = opts.failureReason !== undefined ? opts.failureReason : current.failureReason;

  database.run(
    `UPDATE attendees SET status = ?, current_job_id = ?, checked_in_at = ?, last_scanned_at = ?, failure_reason = ? WHERE id = ?`,
    [status, newJobId, newCheckedInAt, newLastScannedAt, newFailureReason, id]
  );

  return await getAttendeeById(id);
}

export async function getAllJobs(): Promise<PrintJob[]> {
  const database = await getDb();
  const res = database.exec(`SELECT id, attendee_id, attendee_name, status, printer_id, delay_ms, simulate_failure, queued_at, started_at, completed_at, webhook_sent_at, error_message FROM print_jobs ORDER BY queued_at DESC`);
  if (!res.length || !res[0].values) return [];
  return res[0].values.map(mapRowToPrintJob);
}

export async function getJobById(id: string): Promise<PrintJob | null> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT id, attendee_id, attendee_name, status, printer_id, delay_ms, simulate_failure, queued_at, started_at, completed_at, webhook_sent_at, error_message FROM print_jobs WHERE id = ?`);
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return mapRowToPrintJob(row);
  }
  stmt.free();
  return null;
}

export async function createPrintJob(job: {
  id: string;
  attendeeId: string;
  attendeeName: string;
  printerId: string;
  delayMs: number;
  simulateFailure: boolean;
}): Promise<PrintJob> {
  const database = await getDb();
  const now = new Date().toISOString();

  database.run(
    `INSERT INTO print_jobs (id, attendee_id, attendee_name, status, printer_id, delay_ms, simulate_failure, queued_at)
     VALUES (?, ?, ?, 'QUEUED', ?, ?, ?, ?)`,
    [job.id, job.attendeeId, job.attendeeName, job.printerId, job.delayMs, job.simulateFailure ? 1 : 0, now]
  );

  const created = await getJobById(job.id);
  return created!;
}

export async function updateJobStatus(
  id: string,
  status: PrintJob['status'],
  opts: {
    startedAt?: string | null;
    completedAt?: string | null;
    webhookSentAt?: string | null;
    errorMessage?: string | null;
  } = {}
) {
  const database = await getDb();
  const current = await getJobById(id);
  if (!current) return null;

  const started = opts.startedAt !== undefined ? opts.startedAt : current.startedAt;
  const completed = opts.completedAt !== undefined ? opts.completedAt : current.completedAt;
  const webhookSent = opts.webhookSentAt !== undefined ? opts.webhookSentAt : current.webhookSentAt;
  const errorMsg = opts.errorMessage !== undefined ? opts.errorMessage : current.errorMessage;

  database.run(
    `UPDATE print_jobs SET status = ?, started_at = ?, completed_at = ?, webhook_sent_at = ?, error_message = ? WHERE id = ?`,
    [status, started, completed, webhookSent, errorMsg, id]
  );

  return await getJobById(id);
}

export async function logEvent(data: {
  type: SystemEvent['type'];
  title: string;
  details: string;
  jobId?: string;
  attendeeId?: string;
  payload?: any;
  level: SystemEvent['level'];
}) {
  const database = await getDb();
  const id = `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  const timestamp = new Date().toISOString();
  const payloadStr = data.payload ? JSON.stringify(data.payload) : null;

  database.run(
    `INSERT INTO audit_logs (id, timestamp, type, title, details, job_id, attendee_id, payload_json, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, timestamp, data.type, data.title, data.details, data.jobId || null, data.attendeeId || null, payloadStr, data.level]
  );

  const event: SystemEvent = {
    id,
    timestamp,
    type: data.type,
    title: data.title,
    details: data.details,
    jobId: data.jobId,
    attendeeId: data.attendeeId,
    payload: data.payload,
    level: data.level
  };

  broadcastEvent(event);
  return event;
}

export async function getRecentLogs(limit = 40): Promise<SystemEvent[]> {
  const database = await getDb();
  const res = database.exec(`SELECT id, timestamp, type, title, details, job_id, attendee_id, payload_json, level FROM audit_logs ORDER BY timestamp DESC LIMIT ${limit}`);
  if (!res.length || !res[0].values) return [];

  return res[0].values.map((row: any[]) => ({
    id: row[0],
    timestamp: row[1],
    type: row[2] as SystemEvent['type'],
    title: row[3],
    details: row[4],
    jobId: row[5] || undefined,
    attendeeId: row[6] || undefined,
    payload: row[7] ? JSON.parse(row[7]) : undefined,
    level: row[8] as SystemEvent['level']
  }));
}
