import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
  Award,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { WorkforceHeatmap } from './WorkforceHeatmap';
import { DayDetailModal } from './DayDetailModal';
import { formatDurationMinutes } from '../attendanceUtils';
import type { HeatmapResponse } from '../types';

export function PersonalActivityHeatmap() {
  const user = useAuthStore((s) => s.user);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-personal-heatmap', selectedYear],
    queryFn: async () => {
      // Endpoint automatically restricts to current user if not CEO/manager
      return (
        await api.get('/attendance/analytics/heatmap', {
          params: { year: selectedYear },
        })
      ).data.data as HeatmapResponse;
    },
  });

  const summary = data?.summary;
  const days = data?.days || {};

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              My Work Activity
            </h3>
            <span className="rounded-full bg-teal-50 border border-teal-200/60 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
              {selectedYear}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Your attendance and recorded working hours throughout the year.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/attendance"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-900 shadow-2xs transition"
          >
            <span>Full Attendance Ledger</span>
            <ArrowRight className="h-3.5 w-3.5 text-teal-600" />
          </Link>
        </div>
      </div>

      {/* Embedded GitHub-style heatmap */}
      <div className="mt-4">
        <WorkforceHeatmap
          year={selectedYear}
          onYearChange={setSelectedYear}
          days={days}
          summary={summary}
          onSelectDate={(date) => setSelectedDate(date)}
          employeeName={user?.name}
          isSingleEmployee
          isLoading={isLoading}
        />
      </div>

      {/* Date detail modal if cell clicked */}
      <DayDetailModal
        date={selectedDate}
        onClose={() => setSelectedDate(null)}
        canManage={false}
      />
    </div>
  );
}
