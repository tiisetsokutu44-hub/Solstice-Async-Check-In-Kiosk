import React from 'react';
import { Attendee, PrintJob } from '../types';
import { UserCheck, Clock, AlertCircle, Scan, CheckCircle2, QrCode, Camera } from 'lucide-react';

interface AttendeeRosterProps {
  attendees: Attendee[];
  activeJobs: PrintJob[];
  onScanAttendee: (attendeeId: string) => void;
  isScanning: boolean;
  selectedAttendeeId: string | null;
  onSelectAttendee: (id: string) => void;
  onOpenScanner?: () => void;
}

export const AttendeeRoster: React.FC<AttendeeRosterProps> = ({
  attendees,
  onScanAttendee,
  isScanning,
  selectedAttendeeId,
  onSelectAttendee,
  onOpenScanner
}) => {
  const getStatusBadge = (status: Attendee['status']) => {
    switch (status) {
      case 'CHECKED_IN':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            ✓ Checked In
          </span>
        );
      case 'PRINT_PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-600 animate-spin" />
            Print Pending
          </span>
        );
      case 'PRINT_FAILED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
            Print Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <UserCheck className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Not Checked In
          </span>
        );
    }
  };

  return (
    <div id="attendee-roster-card" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <h2 className="font-bold text-slate-900 text-sm sm:text-base flex items-center space-x-2">
            <span>Attendee Database (SQLite)</span>
            <span className="text-xs bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded-md font-semibold">
              {attendees.length} Records
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status synchronized with async printer webhook receipts
          </p>
        </div>

        {onOpenScanner && (
          <button
            id="btn-roster-camera-scan"
            onClick={onOpenScanner}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center space-x-2 transition shadow-sm"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>Scan with Camera</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100 overflow-x-auto">
        {attendees.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Loading attendees from database...
          </div>
        ) : (
          attendees.map((attendee) => {
            const isSelected = selectedAttendeeId === attendee.id;
            return (
              <div
                key={attendee.id}
                id={`attendee-row-${attendee.id}`}
                onClick={() => onSelectAttendee(attendee.id)}
                className={`p-4 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isSelected ? 'bg-amber-50/70 border-l-4 border-amber-500' : 'hover:bg-slate-50'
                }`}
              >
                {/* Attendee Info */}
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0"
                    style={{ backgroundColor: attendee.avatarColor || '#64748B' }}
                  >
                    {attendee.name ? attendee.name.split(' ').map(n => n[0]).join('') : 'A'}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-sm">{attendee.name}</span>
                      <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {attendee.id}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center space-x-2 mt-0.5">
                      <span>{attendee.company}</span>
                      <span>•</span>
                      <span className="font-medium text-slate-700">{attendee.badgeRole}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Current Job */}
                <div className="flex items-center justify-between sm:justify-end space-x-4">
                  <div className="text-left sm:text-right">
                    <div className="mb-0.5">{getStatusBadge(attendee.status)}</div>
                    {attendee.currentJobId && (
                      <div className="text-[11px] font-mono text-slate-500">
                        Job: <span className="font-semibold text-slate-700">{attendee.currentJobId}</span>
                      </div>
                    )}
                    {attendee.checkedInAt && (
                      <div className="text-[10px] text-emerald-600 font-mono">
                        {new Date(attendee.checkedInAt).toLocaleTimeString()}
                      </div>
                    )}
                    {attendee.failureReason && (
                      <div className="text-[10px] text-rose-600 max-w-[180px] truncate" title={attendee.failureReason}>
                        {attendee.failureReason}
                      </div>
                    )}
                  </div>

                  {/* Scan Button */}
                  <button
                    id={`btn-scan-${attendee.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScanAttendee(attendee.id);
                    }}
                    disabled={isScanning || attendee.status === 'PRINT_PENDING' || attendee.status === 'CHECKED_IN'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
                      attendee.status === 'NOT_CHECKED_IN'
                        ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                        : attendee.status === 'PRINT_FAILED'
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                    title={
                      attendee.status === 'CHECKED_IN'
                        ? 'Already checked in'
                        : attendee.status === 'PRINT_PENDING'
                        ? 'Job pending printing'
                        : 'Trigger check-in scan'
                    }
                  >
                    {attendee.status === 'PRINT_FAILED' ? (
                      <>
                        <Scan className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </>
                    ) : attendee.status === 'CHECKED_IN' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Scan QR</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
