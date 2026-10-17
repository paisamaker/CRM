import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { Calendar, Clock3, ListTodo, Plus, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage, getAuthenticatedFileUrl, isImageFile, isPdfFile } from '@/lib/api';
import { PageHeader, Card, EmptyState, TableShell } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { TaskIssueModal } from './TaskIssueModal';
import { FilePreviewModal, type PreviewFile } from '@/components/files/FilePreviewModal';

const columns = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'In Review' },
  { id: 'completed', label: 'Done' },
];

type BoardTask = {
  _id: string;
  key?: string;
  title: string;
  priority: string;
  status: string;
  startDate?: string;
  startedAt?: string;
  dueDate?: string;
  assignees?: { _id?: string; name?: string }[];
  project?: { _id?: string; name?: string };
  subtasks?: { total: number; done: number };
  attachments?: {
    _id?: string;
    name: string;
    url: string;
    size?: number;
    mime?: string;
    uploadedBy?: { name?: string };
    createdAt?: string;
  }[];
};

const emptyForm = {
  title: '',
  description: '',
  priority: 'medium',
  startDate: '',
  dueDate: '',
  project: '',
  assignees: [] as string[],
};

function isOverdue(dueDate?: string, status?: string) {
  if (!dueDate || status === 'completed') return false;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(dueDate).getTime() < d.getTime();
}

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const projectFilter = params.get('project') || '';
  const [view, setView] = useState<'board' | 'table'>('board');
  const [open, setOpen] = useState(false);
  const [issueStack, setIssueStack] = useState<string[]>([]);
  const [cardPreviewFile, setCardPreviewFile] = useState<PreviewFile | null>(null);
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const canAssign = role === 'ceo';
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const detailId = issueStack[issueStack.length - 1] || null;

  const { data, isLoading } = useQuery({
    queryKey: ['tasks-board', projectFilter],
    queryFn: async () =>
      (
        await api.get('/tasks/board', {
          params: projectFilter ? { project: projectFilter } : undefined,
        })
      ).data.data as Record<string, BoardTask[]>,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects-mini'],
    queryFn: async () => (await api.get('/projects', { params: { limit: 100 } })).data.data.items,
  });

  const { data: users } = useQuery({
    queryKey: ['users-task-assign'],
    queryFn: async () =>
      (await api.get('/users', { params: { limit: 100, status: 'active' } })).data.data.items,
    enabled: canAssign && open,
  });

  useEffect(() => {
    if (projectFilter) setForm((f) => ({ ...f, project: projectFilter }));
  }, [projectFilter]);

  const create = useMutation({
    mutationFn: async () =>
      api.post('/tasks', {
        title: form.title,
        description: form.description,
        priority: form.priority,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        project: form.project || undefined,
        issueType: 'task',
        assignees: canAssign
          ? form.assignees.length
            ? form.assignees
            : userId
              ? [userId]
              : []
          : userId
            ? [userId]
            : [],
      }),
    onSuccess: () => {
      toast.success('Task added to project board');
      setOpen(false);
      setForm({ ...emptyForm, project: projectFilter || '' });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.post(`/tasks/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-board'] }),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const flat = useMemo(() => {
    if (!data) return [] as BoardTask[];
    return columns.flatMap((c) => (data[c.id] || []).map((t) => ({ ...t, status: c.id })));
  }, [data]);

  function openIssue(id: string) {
    setIssueStack([id]);
  }

  function openChild(id: string) {
    setIssueStack((stack) => {
      if (stack[stack.length - 1] === id) return stack;
      // If navigating to parent already in stack, pop back
      const idx = stack.indexOf(id);
      if (idx >= 0) return stack.slice(0, idx + 1);
      return [...stack, id];
    });
  }

  function closeIssue() {
    setIssueStack([]);
  }

  function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const status = columns.some((c) => c.id === overId)
      ? overId
      : flat.find((t) => t._id === overId)?.status;
    if (!status) return;
    if (status === 'completed' && role !== 'ceo') {
      toast.error('Only CEO can mark parent tasks Done');
      return;
    }
    updateStatus.mutate({ id: taskId, status });
  }

  const [mobileColumn, setMobileColumn] = useState<string>('all');
  const selectedProjectName = projects?.find((p: { _id: string }) => p._id === projectFilter)?.name;

  return (
    <div>
      <PageHeader
        title="Tasks & Workflow"
        description="Jira-style project board with issue details, subtasks, dates, and activity"
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Select
              value={projectFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setParams({ project: v });
                else setParams({});
              }}
              className="w-full sm:w-52"
            >
              <option value="">All projects</option>
              {(projects || []).map((p: { _id: string; name: string }) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-2 justify-between sm:justify-start">
              <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold',
                    view === 'board' ? 'bg-[var(--brand-soft)] text-[var(--brand)] shadow-2xs' : 'text-[var(--fg-secondary)]'
                  )}
                  onClick={() => setView('board')}
                >
                  Board
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold',
                    view === 'table' ? 'bg-[var(--brand-soft)] text-[var(--brand)] shadow-2xs' : 'text-[var(--fg-secondary)]'
                  )}
                  onClick={() => setView('table')}
                >
                  Table
                </button>
              </div>
              <Button onClick={() => setOpen(true)} className="flex-1 sm:flex-initial justify-center bg-[#0D9488] hover:bg-[#0B7D72] text-white">
                <Plus className="h-4 w-4" />
                <span>Create Task</span>
              </Button>
            </div>
          </div>
        }
      />

      {selectedProjectName ? (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs font-medium text-teal-900">
          Project Workspace: <span className="font-bold">{selectedProjectName}</span> — tap any task card to manage workflow details &amp; files.
        </div>
      ) : null}

      {isLoading ? <Card className="p-8 text-center text-xs text-slate-500">Loading workflow board…</Card> : null}

      {view === 'board' && data ? (
        <>
          {/* Mobile Column Switcher (visible on phone/tablet screens) */}
          <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden xl:hidden">
            <button
              type="button"
              onClick={() => setMobileColumn('all')}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition shadow-2xs',
                mobileColumn === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              )}
            >
              All Columns ({Object.values(data).reduce((acc, col) => acc + (col?.length || 0), 0)})
            </button>
            {columns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setMobileColumn(c.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition shadow-2xs',
                  mobileColumn === c.id
                    ? 'bg-teal-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                )}
              >
                <span>{c.label}</span>
                <span className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10px]',
                  mobileColumn === c.id ? 'bg-teal-800 text-teal-100' : 'bg-slate-100 text-slate-600'
                )}>
                  {(data[c.id] || []).length}
                </span>
              </button>
            ))}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className={cn(
              mobileColumn === 'all'
                ? 'flex overflow-x-auto snap-x snap-mandatory pb-4 gap-3 xl:grid xl:grid-cols-4 xl:overflow-visible xl:pb-0 [scrollbar-width:thin]'
                : 'grid gap-3 xl:grid-cols-4'
            )}>
              {columns
                .filter((col) => mobileColumn === 'all' || mobileColumn === col.id)
                .map((col) => {
                const borderAccent =
                  col.id === 'todo'
                    ? 'border-t-3 border-t-[var(--purple)]'
                    : col.id === 'in_progress'
                      ? 'border-t-3 border-t-blue-500'
                      : col.id === 'review'
                        ? 'border-t-3 border-t-[var(--orange)]'
                        : 'border-t-3 border-t-[var(--teal)]';

                const tone =
                  col.id === 'todo'
                    ? 'purple'
                    : col.id === 'in_progress'
                      ? 'info'
                      : col.id === 'review'
                        ? 'orange'
                        : 'teal';

                return (
                  <div
                    key={col.id}
                    id={col.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData('text/plain');
                      if (!id) return;
                      if (col.id === 'completed' && role !== 'ceo') {
                        toast.error('Only CEO can mark parent tasks Done');
                        return;
                      }
                      updateStatus.mutate({ id, status: col.id });
                    }}
                    className={cn(
                      'rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xs',
                      borderAccent,
                      mobileColumn === 'all' ? 'w-[84vw] sm:w-[320px] xl:w-auto shrink-0 snap-center xl:shrink xl:snap-none' : 'w-full'
                    )}
                  >
                    <div className="mb-2.5 flex items-center justify-between px-1">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--fg)]">
                        {col.label}
                      </h3>
                      <Badge tone={tone} className="text-[10px] !px-1.5 !py-0">{(data[col.id] || []).length}</Badge>
                    </div>
                    <div className="min-h-28 space-y-2">
                    {(data[col.id] || []).map((task) => {
                      const overdue = isOverdue(task.dueDate, task.status);
                      const subs = task.subtasks || { total: 0, done: 0 };
                      const imgAttachments = (task.attachments || []).filter((a) => isImageFile(a.mime || a.name));
                      const pdfAttachments = (task.attachments || []).filter((a) => isPdfFile(a.mime || a.name));
                      const otherAttachments = (task.attachments || []).filter(
                        (a) => !isImageFile(a.mime || a.name) && !isPdfFile(a.mime || a.name)
                      );

                      return (
                        <div
                          key={task._id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', task._id)}
                          onClick={() => openIssue(task._id)}
                          className="cursor-pointer rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-[var(--brand)]/40 hover:shadow-md"
                        >
                          <div className="text-sm font-semibold text-[var(--fg)]">{task.title}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {task.project?.name ? (
                              <span className="rounded bg-[var(--info-bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--info)]">
                                {task.project.name}
                              </span>
                            ) : null}
                            <Badge tone={statusTone(task.priority)}>{task.priority}</Badge>
                          </div>

                          {/* Direct Content Image Preview on Board */}
                          {imgAttachments.length > 0 && (
                            <div
                              className="group/img relative mt-2 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardPreviewFile(imgAttachments[0]);
                              }}
                              title="Click to preview image"
                            >
                              <img
                                src={getAuthenticatedFileUrl(imgAttachments[0].url)}
                                alt={imgAttachments[0].name}
                                className="max-h-28 w-full object-cover transition duration-300 group-hover/img:scale-105"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 group-hover/img:opacity-100 transition">
                                <span className="flex items-center gap-1 rounded bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                                  <ImageIcon className="h-3 w-3 text-teal-400" />
                                  View Image {imgAttachments.length > 1 ? `(+${imgAttachments.length - 1})` : ''}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* PDF & Other Attachment Badges */}
                          {(pdfAttachments.length > 0 || otherAttachments.length > 0) && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {pdfAttachments.map((pdf, idx) => (
                                <span
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCardPreviewFile(pdf);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                  title={`Click to view PDF: ${pdf.name}`}
                                >
                                  <FileText className="h-3 w-3 text-rose-600" />
                                  <span className="max-w-[110px] truncate">{pdf.name}</span>
                                </span>
                              ))}
                              {otherAttachments.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  <Paperclip className="h-3 w-3 text-slate-400" />
                                  <span>{otherAttachments.length} file{otherAttachments.length > 1 ? 's' : ''}</span>
                                </span>
                              )}
                            </div>
                          )}

                          <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--fg-muted)]">
                            <span className="font-mono font-semibold">{task.key || 'SM'}</span>
                            <div className="flex items-center gap-2">
                              {subs.total > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <ListTodo className="h-3 w-3" />
                                  {subs.done}/{subs.total}
                                </span>
                              ) : null}
                              {task.dueDate ? (
                                <span className={cn('inline-flex items-center gap-1', overdue && 'text-[var(--danger)]')}>
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(task.dueDate)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {(task.startedAt || task.startDate) && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
                              <Clock3 className="h-3 w-3" />
                              Start {formatDate(task.startedAt || task.startDate)}
                            </div>
                          )}
                          <div className="mt-2 text-[11px] text-[var(--fg-secondary)]">
                            {task.assignees?.map((a) => a.name).join(', ') || 'Unassigned'}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
          {!flat.length ? (
            <EmptyState
              title="No issues on this board"
              description="Create a task for a project, then open it to add subtasks."
              action={<Button onClick={() => setOpen(true)}>Create</Button>}
            />
          ) : null}
        </DndContext>
        </>
      ) : null}

      {view === 'table' && data ? (
        <TableShell>
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>Project</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Start</th>
                <th>Deadline</th>
                <th>Subtasks</th>
                <th>Attachments</th>
              </tr>
            </thead>
            <tbody>
              {flat.map((t) => (
                <tr key={t._id} className="cursor-pointer" onClick={() => openIssue(t._id)}>
                  <td className="font-mono text-xs font-semibold">{t.key || '—'}</td>
                  <td className="font-medium">{t.title}</td>
                  <td className="text-[var(--fg-secondary)]">{t.project?.name || '—'}</td>
                  <td>
                    <Badge tone={statusTone(t.status)}>{t.status.replace('_', ' ')}</Badge>
                  </td>
                  <td>
                    <Badge tone={statusTone(t.priority)}>{t.priority}</Badge>
                  </td>
                  <td>{formatDate(t.startedAt || t.startDate)}</td>
                  <td className={isOverdue(t.dueDate, t.status) ? 'text-[var(--danger)]' : ''}>
                    {formatDate(t.dueDate)}
                  </td>
                  <td>{t.subtasks?.total ? `${t.subtasks.done}/${t.subtasks.total}` : '—'}</td>
                  <td>
                    {(t.attachments || []).length > 0 ? (
                      <div className="flex items-center gap-1">
                        {t.attachments!.slice(0, 2).map((att, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardPreviewFile(att);
                            }}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 border',
                              isPdfFile(att.mime || att.name)
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : isImageFile(att.mime || att.name)
                                  ? 'bg-teal-50 border-teal-200 text-teal-700'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                            )}
                          >
                            {isPdfFile(att.mime || att.name) ? 'PDF' : isImageFile(att.mime || att.name) ? 'Img' : 'Doc'}
                          </button>
                        ))}
                        {t.attachments!.length > 2 && (
                          <span className="text-[10px] text-slate-400">+{t.attachments!.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!flat.length ? <EmptyState title="No tasks yet" description="Create your first task" /> : null}
        </TableShell>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create Workflow Task"
        description="Add a parent task to the project board. Subtasks and content files can be attached directly."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.title || !form.project || create.isPending}
              onClick={() => create.mutate()}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>{create.isPending ? 'Creating…' : 'Create Task'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label required>Task Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Design promotional banner campaign"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Project</Label>
              <Select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
                <option value="">Select project...</option>
                {(projects || []).map((p: { _id: string; name: string }) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent / Critical</option>
              </Select>
            </div>
          </div>

          {canAssign ? (
            <div>
              <Label>Assign Employees / Team</Label>
              <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                {(users || [])
                  .filter((u: { role: string }) => ['employee', 'manager', 'finance'].includes(u.role))
                  .map((u: { _id: string; name: string }) => {
                    const checked = form.assignees.includes(u._id);
                    return (
                      <label
                        key={u._id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition',
                          checked ? 'bg-teal-50 font-semibold text-teal-900' : 'text-slate-700 hover:bg-slate-100'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          className="rounded text-teal-600 focus:ring-teal-500"
                          onChange={() =>
                            setForm({
                              ...form,
                              assignees: checked
                                ? form.assignees.filter((id) => id !== u._id)
                                : [...form.assignees, u._id],
                            })
                          }
                        />
                        <span>{u.name}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          ) : null}

          <div>
            <Label>Description / Brief</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe deliverables, required files, specifications..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Planned Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Target Deadline</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      </Modal>

      <TaskIssueModal taskId={detailId} onClose={closeIssue} onOpenTask={openChild} />
      {cardPreviewFile && (
        <FilePreviewModal file={cardPreviewFile} onClose={() => setCardPreviewFile(null)} />
      )}
    </div>
  );
}
