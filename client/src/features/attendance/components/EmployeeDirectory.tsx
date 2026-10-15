import { useState, useMemo } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  Clock,
  Calendar,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { formatDurationMinutes, formatTime, ACTIVITY_COLORS } from '../attendanceUtils';
import type { EmployeeDirectoryItem } from '../types';

interface EmployeeDirectoryProps {
  items: EmployeeDirectoryItem[];
  onSelectEmployee: (employeeId: string) => void;
  isLoading?: boolean;
}

export function EmployeeDirectory({
  items,
  onSelectEmployee,
  isLoading,
}: EmployeeDirectoryProps) {
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked_in' | 'checked_out' | 'absent' | 'missing_checkout'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'hours' | 'rate'>('hours');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Filter & Sort
  const processedItems = useMemo(() => {
    let list = [...items];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.user.name.toLowerCase().includes(q) ||
          i.user.email.toLowerCase().includes(q) ||
          (i.user.department || '').toLowerCase().includes(q) ||
          (i.user.designation || '').toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      list = list.filter((i) => i.todayStatus === statusFilter);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.user.name.localeCompare(b.user.name);
      else if (sortBy === 'hours') cmp = a.periodMinutes - b.periodMinutes;
      else if (sortBy === 'rate') cmp = a.attendanceRate - b.attendanceRate;
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [items, search, statusFilter, sortBy, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(processedItems.length / pageSize));
  const paginatedItems = processedItems.slice((page - 1) * pageSize, page * pageSize);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'checked_in':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Checked In
          </span>
        );
      case 'checked_out':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            Checked Out
          </span>
        );
      case 'missing_checkout':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/60">
            Missing Check-out
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            Not Active
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            Employee Attendance &amp; Activity Directory
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Review individual staff presence, 30-day recorded hours, and activity heatmaps.
          </p>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search employee…"
              className="h-8 rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 transition hover:bg-white focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 hover:bg-white focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
            <option value="missing_checkout">Missing Check-out</option>
            <option value="absent">Not Active</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition',
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              )}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition',
                viewMode === 'card' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              )}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Directory Content */}
      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-48 rounded bg-slate-200" />
                  <div className="h-3 w-32 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No employees match your filter</p>
            <p className="mt-1 text-xs text-slate-500">Try clearing search terms or status criteria.</p>
          </div>
        ) : viewMode === 'table' ? (
          /* TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-2 pr-4">Employee</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Today Log</th>
                  <th className="py-3 px-3">30D Working Time</th>
                  <th className="py-3 px-3">Active Days</th>
                  <th className="py-3 px-3">Attendance Rate</th>
                  <th className="py-3 px-3">14D Activity Sparkline</th>
                  <th className="py-3 pr-2 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item) => (
                  <tr
                    key={item.user._id}
                    className="group hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Employee Profile */}
                    <td className="py-3 pl-2 pr-4">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={item.user.name}
                          avatar={item.user.avatar}
                          className="h-9 w-9 rounded-xl text-xs"
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectEmployee(item.user._id)}
                            className="text-left font-bold text-slate-900 hover:text-teal-700 truncate"
                          >
                            {item.user.name}
                          </button>
                          <div className="truncate text-[11px] text-slate-500">
                            {item.user.department || item.user.role} · {item.user.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {statusBadge(item.todayStatus)}
                    </td>

                    {/* Today Duration */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {formatDurationMinutes(item.todayMinutes)}
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        {item.todayCheckIn ? `In: ${formatTime(item.todayCheckIn)}` : 'No check-in'}
                      </div>
                    </td>

                    {/* Total Hours in Period */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-900">
                        {formatDurationMinutes(item.periodMinutes)}
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        Past 30 days
                      </div>
                    </td>

                    {/* Active Days */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {item.activeDays} days
                      </span>
                    </td>

                    {/* Attendance Rate */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-teal-600 rounded-full"
                            style={{ width: `${Math.min(100, item.attendanceRate)}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-800 text-[11px]">
                          {item.attendanceRate}%
                        </span>
                      </div>
                    </td>

                    {/* 14-Day Sparkline */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1" title="Last 14 days activity">
                        {item.recentSparkline.map((s, idx) => (
                          <span
                            key={idx}
                            className="h-3 w-1.5 rounded-xs"
                            style={{
                              backgroundColor:
                                ACTIVITY_COLORS[s.level as keyof typeof ACTIVITY_COLORS] || '#EAECF0',
                            }}
                            title={`${s.date}: ${formatDurationMinutes(s.minutes)}`}
                          />
                        ))}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 pr-2 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectEmployee(item.user._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 transition"
                      >
                        <span>Profile &amp; Logs</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* CARD VIEW */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedItems.map((item) => (
              <div
                key={item.user._id}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-teal-300 hover:shadow-xs transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        name={item.user.name}
                        avatar={item.user.avatar}
                        className="h-10 w-10 rounded-xl text-xs"
                      />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectEmployee(item.user._id)}
                          className="font-bold text-slate-900 hover:text-teal-700 truncate text-left"
                        >
                          {item.user.name}
                        </button>
                        <p className="truncate text-xs text-slate-500 capitalize">
                          {item.user.department || item.user.role}
                        </p>
                      </div>
                    </div>

                    <div>{statusBadge(item.todayStatus)}</div>
                  </div>

                  {/* Metrics Row */}
                  <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-lg bg-slate-50/80 p-2.5 text-center">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Today
                      </span>
                      <p className="text-xs font-bold text-slate-800">
                        {formatDurationMinutes(item.todayMinutes)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        30D Total
                      </span>
                      <p className="text-xs font-bold text-slate-800">
                        {formatDurationMinutes(item.periodMinutes)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Consistency
                      </span>
                      <p className="text-xs font-bold text-teal-700">
                        {item.attendanceRate}%
                      </p>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="mt-3">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Recent Activity (14 Days)
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {item.recentSparkline.map((s, idx) => (
                        <span
                          key={idx}
                          className="h-3 flex-1 rounded-xs"
                          style={{
                            backgroundColor:
                              ACTIVITY_COLORS[s.level as keyof typeof ACTIVITY_COLORS] || '#EAECF0',
                          }}
                          title={`${s.date}: ${formatDurationMinutes(s.minutes)}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {item.activeDays} active days
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectEmployee(item.user._id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    <span>View Profile</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(processedItems.length, page * pageSize)} of {processedItems.length} employees
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-medium">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
