import React from 'react';
import { Attendee } from '../types';
import { Sparkles, QrCode, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

interface BadgePreviewProps {
  attendee?: Attendee | null;
  isDispensed?: boolean;
}

export const BadgePreview: React.FC<BadgePreviewProps> = ({ attendee, isDispensed = false }) => {
  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'Keynote Speaker':
      case 'Speaker':
        return 'bg-blue-600 text-white';
      case 'Panelist':
        return 'bg-emerald-600 text-white';
      case 'Event Director':
        return 'bg-amber-600 text-white';
      default:
        return 'bg-purple-600 text-white';
    }
  };

  if (!attendee) {
    return (
      <div
        id="badge-card-placeholder"
        className="relative w-72 bg-slate-900 text-slate-400 rounded-2xl shadow-xl border border-slate-800 p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[360px]"
      >
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
          <QrCode className="w-8 h-8 opacity-40" />
        </div>
        <p className="text-xs font-semibold text-slate-400">Badge Preview Standby</p>
        <span className="text-[10px] text-slate-500 font-mono">Scan QR code or choose an attendee</span>
      </div>
    );
  }

  return (
    <div
      id={`badge-card-${attendee.id}`}
      className={`relative w-72 bg-white text-slate-900 rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-500 ${
        isDispensed ? 'scale-100 opacity-100 ring-4 ring-amber-400/50' : 'opacity-95'
      }`}
    >
      {/* Top Lanyard Slot */}
      <div className="bg-slate-100 border-b border-slate-200 py-2.5 flex justify-center items-center">
        <div className="w-16 h-2 rounded-full bg-slate-300 border border-slate-400/50 shadow-inner" />
      </div>

      {/* Header Band */}
      <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-xs uppercase tracking-wider text-slate-100">Solstice 2026</span>
        </div>
        <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest font-semibold">
          Annual Summit
        </span>
      </div>

      {/* Main Body */}
      <div className="p-5 flex flex-col items-center text-center flex-1">
        {/* Avatar Ring */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md mb-3 border-2 border-white"
          style={{ backgroundColor: attendee.avatarColor || '#3B82F6' }}
        >
          {attendee.name ? attendee.name.split(' ').map(n => n[0]).join('') : 'A'}
        </div>

        {/* Name & Company */}
        <h3 className="font-extrabold text-xl text-slate-900 leading-tight">
          {attendee.name || 'Attendee'}
        </h3>
        <p className="text-xs font-semibold text-slate-600 mt-0.5">
          {attendee.company || 'Solstice Delegate'}
        </p>

        {/* Role Pill */}
        <div className="mt-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${getRoleColor(attendee.badgeRole)}`}>
            {attendee.badgeRole || 'Attendee'}
          </span>
        </div>

        {/* Ticket Type & ID */}
        <div className="w-full mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Access Tier</span>
            <span className="font-semibold text-slate-800">{attendee.ticketType || 'Standard'}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Badge ID</span>
            <span className="font-mono font-bold text-slate-700">{attendee.id}</span>
          </div>
        </div>

        {/* QR Code Barcode Representation */}
        <div className="mt-4 p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-3 w-full">
          <div className="w-10 h-10 bg-white p-1 rounded-lg border border-slate-200 flex items-center justify-center text-slate-800">
            <QrCode className="w-full h-full" />
          </div>
          <div className="text-left flex-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Verification Hash</span>
            <span className="font-mono text-xs font-bold text-slate-800 truncate block">
              SOLSTICE:{attendee.id}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Status Strip */}
      <div className={`py-1.5 px-4 text-[11px] font-semibold flex items-center justify-center space-x-1.5 ${
        attendee.status === 'CHECKED_IN'
          ? 'bg-emerald-500 text-white'
          : attendee.status === 'PRINT_PENDING'
          ? 'bg-amber-500 text-slate-950 animate-pulse'
          : attendee.status === 'PRINT_FAILED'
          ? 'bg-rose-500 text-white'
          : 'bg-slate-200 text-slate-700'
      }`}>
        {attendee.status === 'CHECKED_IN' && (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Printed & Verified</span>
          </>
        )}
        {attendee.status === 'PRINT_PENDING' && (
          <>
            <Clock className="w-3.5 h-3.5" />
            <span>Printing in Progress ({attendee.currentJobId || 'Pending'})</span>
          </>
        )}
        {attendee.status === 'PRINT_FAILED' && (
          <>
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Hardware Print Failed</span>
          </>
        )}
        {(!attendee.status || attendee.status === 'NOT_CHECKED_IN') && (
          <span>Unprinted Digital Record</span>
        )}
      </div>
    </div>
  );
};
