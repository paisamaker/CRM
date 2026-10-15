import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, User, CheckCircle2, AlertCircle, FileText, Calendar, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { formatDateReadable, formatDurationMinutes, formatTime } from '../attendanceUtils';
import type { DayDetailRecord } from '../types';

interface DayDetailModalProps {
  date: string | null;
  onClose: () => void;
  onOpenCorrect?: (recordId: string) => void;
  canManage?: boolean;
}

export function DayDetailModal({
  date,
  onClose,
  onOpenCorrect,
  canManage,
}: DayDetailModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-day-detail', date],
    queryFn: async () => {
      if (!date) return { records: [] };
      return (await api.get('/attendance/analytics/day-detail', { params: { date } })).data
        .data as { date: string; records: DayDetailRecord[] };
    },
    enabled: !!date,
  });

  const records = data?.records || [];

  return (
    <Modal
      open={!!date}
      onClose={onClose}
      title={
        canManage
          ? `Workforce Records — ${formatDateReadable(date)}`
          : `My Shift Activity — ${formatDateReadable(date)}`
      }
      description={
        canManage
          ? 'Detailed employee check-ins, check-outs, recorded durations, and submitted work logs.'
          : 'Your recorded attendance, working duration, and submitted work log for this date.'
      }
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            {canManage
              ? `${records.length} employee record${records.length === 1 ? '' : 's'} on this date`
              : `${records.length ? 'Session details recorded' : 'No personal session logged'}`}
          </span>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-40 rounded bg-slate-200" />
                  <div className="h-3 w-56 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Calendar className="h-6 w-6" />
            </div>
            <h4 className="mt-3 text-sm font-semibold text-slate-700">No activity recorded</h4>
            <p className="mt-1 text-xs text-slate-500">
              No employee attendance sessions or work logs were submitted on this date.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto pr-1">
            {records.map((r) => {
              const tasks = [
                ...(r.workLog?.selectedTasks || []).map((t) => t.title),
                ...(r.workLog?.customTasks || []),
              ];

              return (
                <div key={r._id} className="py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {/* User profile */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={r.user?.name}
                        avatar={r.user?.avatar}
                        className="h-9 w-9 rounded-xl text-xs"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {r.user?.name || 'Staff Member'}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {r.user?.role} {r.user?.department ? `· ${r.user.department}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Status & actions */}
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(r.status)} className="text-[10.5px]">
                        {r.status}
                      </Badge>
                      {canManage && onOpenCorrect && (
                        <button
                          type="button"
                          onClick={() => onOpenCorrect(r._id)}
                          className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                          title="Correct attendance record"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>Correct</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timing Strip */}
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50/70 p-2 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Check-in
                      </span>
                      <p className="font-medium text-slate-800">
                        {r.checkInAt ? formatTime(r.checkInAt) : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Check-out
                      </span>
                      <p className="font-medium text-slate-800">
                        {r.checkOutAt ? formatTime(r.checkOutAt) : 'Missing'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Duration
                      </span>
                      <p className="font-bold text-teal-700">
                        {formatDurationMinutes(r.durationMinutes)}
                      </p>
                    </div>
                  </div>

                  {/* Work Log details if submitted */}
                  {r.workLog && (
                    <div className="rounded-lg border border-slate-200/60 bg-white p-2.5 text-xs space-y-1.5">
                      {r.workLog.notes && (
                        <div>
                          <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                            Summary Note:
                          </span>
                          <p className="mt-0.5 text-slate-800 whitespace-pre-wrap">
                            {r.workLog.notes}
                          </p>
                        </div>
                      )}

                      {tasks.length > 0 && (
                        <div>
                          <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                            Logged Tasks ({tasks.length}):
                          </span>
                          <ul className="mt-0.5 list-disc list-inside space-y-0.5 text-slate-700">
                            {tasks.map((task, idx) => (
                              <li key={idx}>{task}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
