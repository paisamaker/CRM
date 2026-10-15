import { useState, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Users,
  AlertTriangle,
  FileText,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  generateYearCalendarGrid,
  ACTIVITY_COLORS,
  formatDateReadable,
  formatDurationMinutes,
  type CalendarDayCell,
} from '../attendanceUtils';
import type { DayHeatmapData, HeatmapSummary } from '../types';

interface WorkforceHeatmapProps {
  year: number;
  onYearChange: (year: number) => void;
  days: Record<string, DayHeatmapData>;
  summary?: HeatmapSummary;
  onSelectDate: (date: string) => void;
  selectedDate?: string | null;
  employeeName?: string;
  isSingleEmployee?: boolean;
  departmentFilter?: string;
  onDepartmentChange?: (dept: string) => void;
  isLoading?: boolean;
}

export function WorkforceHeatmap({
  year,
  onYearChange,
  days,
  summary,
  onSelectDate,
  selectedDate,
  employeeName,
  isSingleEmployee = false,
  departmentFilter,
  onDepartmentChange,
  isLoading,
}: WorkforceHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    day: CalendarDayCell;
    data?: DayHeatmapData;
    rect: DOMRect;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const { days: calendarDays, totalWeeks, monthLabels } = useMemo(
    () => generateYearCalendarGrid(year),
    [year]
  );

  // Group days by week column
  const weeksGrid = useMemo(() => {
    const weeks: CalendarDayCell[][] = Array.from({ length: totalWeeks }, () => []);
    for (const d of calendarDays) {
      if (d.weekIndex < totalWeeks) {
        weeks[d.weekIndex].push(d);
      }
    }
    return weeks;
  }, [calendarDays, totalWeeks]);

  return (
    <div className="relative rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              {isSingleEmployee && employeeName
                ? `${employeeName}'s Work Activity`
                : 'Team Workforce Activity'}
            </h3>
            <span className="rounded-full bg-teal-50 border border-teal-200/60 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
              {year}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {isSingleEmployee
              ? 'Recorded daily working duration and logged contributions.'
              : 'Daily company workforce presence, cumulative logged hours, and activity intensity.'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {onDepartmentChange && !isSingleEmployee && (
            <div className="relative">
              <select
                value={departmentFilter || ''}
                onChange={(e) => onDepartmentChange(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 transition hover:bg-white focus:border-teal-500 focus:outline-none"
              >
                <option value="">All Departments</option>
                <option value="engineering">Engineering</option>
                <option value="design">Design</option>
                <option value="marketing">Marketing</option>
                <option value="operations">Operations</option>
                <option value="finance">Finance</option>
              </select>
            </div>
          )}

          {/* Year Switcher */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
            <button
              type="button"
              onClick={() => onYearChange(year - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-900 shadow-2xs"
              title={`View ${year - 1}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-bold text-slate-800">{year}</span>
            <button
              type="button"
              onClick={() => onYearChange(year + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-900 shadow-2xs"
              title={`View ${year + 1}`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Summary Strip */}
      {summary && (
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <div>
            <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Logged Time
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {formatDurationMinutes(summary.totalLoggedMinutes)}
            </p>
          </div>
          <div>
            <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
              Active Working Days
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {summary.activeWorkingDays} days
            </p>
          </div>
          <div>
            <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
              Daily Average
            </span>
            <p className="mt-0.5 text-sm font-bold text-teal-700">
              {summary.averageHoursPerDay} hrs / day
            </p>
          </div>
          <div>
            <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
              Attendance Consistency
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {summary.attendanceRate}%
            </p>
          </div>
        </div>
      )}

      {/* Heatmap Calendar Canvas */}
      <div
        ref={containerRef}
        className="relative mt-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200"
      >
        <div className="inline-block min-w-[760px] select-none">
          {/* Month Labels Header */}
          <div className="relative mb-2 h-4 text-[10.5px] font-semibold text-slate-400">
            <div className="pl-8 flex">
              {monthLabels.map((ml) => (
                <div
                  key={ml.name}
                  style={{
                    position: 'absolute',
                    left: `${32 + ml.weekIndex * 14}px`,
                  }}
                >
                  {ml.name}
                </div>
              ))}
            </div>
          </div>

          {/* Calendar Grid with Weekday Sidebar */}
          <div className="flex gap-2">
            {/* Weekday Labels (Mon, Wed, Fri) */}
            <div className="flex flex-col justify-between py-[1px] text-[9.5px] font-medium text-slate-400 w-6 shrink-0">
              <span>Mon</span>
              <span className="opacity-0">Tue</span>
              <span>Wed</span>
              <span className="opacity-0">Thu</span>
              <span>Fri</span>
              <span className="opacity-0">Sat</span>
              <span className="text-slate-300">Sun</span>
            </div>

            {/* Weeks columns */}
            <div className="flex gap-[3px]">
              {weeksGrid.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-[3px]">
                  {week.map((day) => {
                    const dayData = days[day.date];
                    const level = dayData?.level ?? 0;
                    const isSelected = selectedDate === day.date;
                    const cellBg = day.isFuture
                      ? '#F8FAFC'
                      : ACTIVITY_COLORS[level as keyof typeof ACTIVITY_COLORS];

                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => {
                          if (!day.isFuture) onSelectDate(day.date);
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredCell({ day, data: dayData, rect });
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                        disabled={day.isFuture}
                        className={cn(
                          'h-[11.5px] w-[11.5px] rounded-[2.5px] transition-transform duration-75 focus:outline-none',
                          !day.isFuture && 'hover:scale-135 hover:z-10 hover:shadow-xs active:scale-110 cursor-pointer',
                          day.isFuture && 'opacity-40 cursor-default',
                          isSelected && 'ring-2 ring-teal-600 ring-offset-1 z-10',
                          day.isToday && !isSelected && 'ring-1.5 ring-slate-700'
                        )}
                        style={{ backgroundColor: cellBg }}
                        aria-label={`${day.date}: ${dayData?.totalHours || 0} hours`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredCell && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl border border-slate-200/90 bg-white p-3 text-xs text-slate-800 shadow-xl"
          style={{
            top: `${Math.max(10, hoveredCell.rect.top - 120)}px`,
            left: `${Math.min(
              window.innerWidth - 240,
              Math.max(10, hoveredCell.rect.left - 100)
            )}px`,
            width: '230px',
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 font-bold text-slate-900">
            <span>{formatDateReadable(hoveredCell.day.date)}</span>
            {hoveredCell.day.isToday && (
              <span className="rounded bg-teal-50 px-1.5 py-0.2 text-[9px] font-semibold text-teal-800">
                Today
              </span>
            )}
          </div>

          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Logged Time:</span>
              <span className="font-bold text-slate-900">
                {formatDurationMinutes(hoveredCell.data?.totalMinutes || 0)}
              </span>
            </div>

            {!isSingleEmployee ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Employees Active:</span>
                  <span className="font-semibold text-slate-800">
                    {hoveredCell.data?.activeEmployees || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Checked In:</span>
                  <span className="font-semibold text-emerald-700">
                    {hoveredCell.data?.checkedInCount || 0}
                  </span>
                </div>
                {(hoveredCell.data?.missingCheckoutCount || 0) > 0 && (
                  <div className="flex items-center justify-between text-amber-700">
                    <span>Missing Check-outs:</span>
                    <span className="font-bold">
                      {hoveredCell.data?.missingCheckoutCount}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold capitalize text-slate-800">
                    {hoveredCell.data?.status || 'No records'}
                  </span>
                </div>
                {hoveredCell.data?.checkInAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Check-in:</span>
                    <span className="font-medium text-slate-700">
                      {new Date(hoveredCell.data.checkInAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {hoveredCell.data?.checkOutAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Check-out:</span>
                    <span className="font-medium text-slate-700">
                      {new Date(hoveredCell.data.checkOutAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </>
            )}

            {(hoveredCell.data?.workLogCount || 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Work Logs:</span>
                <span className="font-semibold text-teal-700">
                  {hoveredCell.data?.workLogCount} logged
                </span>
              </div>
            )}
          </div>

          <div className="mt-2.5 border-t border-slate-100 pt-1.5 text-center text-[10px] text-teal-700 font-medium">
            Click cell to view full day details →
          </div>
        </div>
      )}

      {/* Heatmap Footer with Intensity Legend */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
          <span>Click any date cell to inspect detailed check-ins and tasks.</span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>Less</span>
          <div className="flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ACTIVITY_COLORS[0] }}
              title="Level 0: No recorded activity"
            />
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ACTIVITY_COLORS[1] }}
              title="Level 1: < 2 logged hours"
            />
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ACTIVITY_COLORS[2] }}
              title="Level 2: 2 - 4 logged hours"
            />
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ACTIVITY_COLORS[3] }}
              title="Level 3: 4 - 6 logged hours"
            />
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ACTIVITY_COLORS[4] }}
              title="Level 4: 6+ logged hours"
            />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
