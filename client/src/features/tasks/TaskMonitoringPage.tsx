import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { PageHeader, Card, Skeleton } from '@/components/ui/Card';
import { KpiCard } from '@/components/charts/KpiCard';
import { Badge, statusTone } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { ClipboardList, Users, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export function TaskMonitoringPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['task-monitoring'],
    queryFn: async () => (await api.get('/tasks/monitoring')).data.data,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  const t = data.tiles;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--teal-border)] bg-gradient-to-r from-[var(--teal-soft)] via-[var(--purple-soft)] to-[var(--orange-soft)] p-6 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-100/90 px-3 py-0.5 text-xs font-bold text-teal-800">
                <ClipboardList className="h-3.5 w-3.5" />
                Workforce Operations
              </span>
              <span className="text-xs text-[var(--fg-muted)]">Executive Task Monitor</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--fg)]">
              Task Monitoring &amp; Team Workload
            </h1>
            <p className="mt-0.5 text-xs text-[var(--fg-secondary)]">
              Real-time oversight of agency task distributions, scheduled deliverables, and deadline bottlenecks.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Tasks Tracked" value={t.total} accent="purple" icon={ClipboardList} />
        <KpiCard label="Today's Deliverables" value={t.today} accent="teal" icon={Clock} />
        <KpiCard label="Tasks Completed" value={t.completed} accent="teal" icon={CheckCircle2} />
        <KpiCard label="In Active Progress" value={t.inProgress} accent="purple" icon={Clock} />
        <KpiCard label="Pending Queue" value={t.pending} accent="orange" />
        <KpiCard label="High Priority Directives" value={t.highPriority} accent="orange" icon={AlertTriangle} />
        <KpiCard label="Impending Deadline Alerts" value={t.deadlineAlerts} accent="orange" />
      </div>

      {/* Workload and Schedule */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-t-2 border-t-[var(--purple)]">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">Workload Distribution by Team Member</h3>
              <p className="text-[11px] text-[var(--fg-muted)]">Active assigned tasks per staff</p>
            </div>
            <Badge tone="purple" className="text-[10px]">
              Live Velocity
            </Badge>
          </div>
          <div className="h-68">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.workload} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="workloadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--purple-border)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                <Bar dataKey="count" fill="url(#workloadGrad)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-t-2 border-t-[var(--teal)]">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">Today's Operating Schedule</h3>
              <p className="text-[11px] text-[var(--fg-muted)]">Priority items due within 24 hours</p>
            </div>
            <Badge tone="teal" className="text-[10px]">
              Daily Dispatch
            </Badge>
          </div>
          <div className="space-y-2.5">
            {(data.todaySchedule || []).map((task: {
              _id: string;
              title: string;
              priority: string;
              dueDate?: string;
              assignees?: { name?: string }[];
            }) => (
              <div
                key={task._id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 transition hover:border-[var(--teal-border)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--fg)]">{task.title}</div>
                  <Badge tone={statusTone(task.priority)} className="text-[10px] !px-1.5 !py-0">
                    {task.priority}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--fg-muted)]">
                  <span>
                    Staff: {task.assignees?.map((a) => a.name).join(', ') || 'Unassigned'}
                  </span>
                  <span>Due {formatDate(task.dueDate)}</span>
                </div>
              </div>
            ))}
            {!data.todaySchedule?.length ? (
              <p className="py-8 text-center text-xs text-[var(--fg-muted)]">No tasks scheduled for today</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
