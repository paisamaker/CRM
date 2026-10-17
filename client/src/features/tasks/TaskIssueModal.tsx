import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  MessageSquare,
  Paperclip,
  Plus,
  X,
  Clock3,
  ListTodo,
  Calendar,
  FolderKanban,
  CheckCircle2,
  Tag,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { AttachmentsSection, type AttachmentItem } from '@/components/files/AttachmentsSection';

const STATUS_OPTIONS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'In Review' },
  { id: 'completed', label: 'Done' },
] as const;

type Person = { _id?: string; name?: string; email?: string; avatar?: string };
type Subtask = {
  _id: string;
  key?: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  assignees?: Person[];
};
type Activity = {
  _id: string;
  action: string;
  createdAt: string;
  actor?: Person;
  after?: unknown;
};
type TimeLog = {
  _id: string;
  minutes: number;
  start: string;
  note?: string;
  user?: Person;
};
type Comment = {
  _id?: string;
  body: string;
  createdAt: string;
  user?: Person;
};

export type TaskIssue = {
  _id: string;
  key?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  startDate?: string;
  startedAt?: string;
  dueDate?: string;
  tags?: string[];
  progress?: number;
  issueType?: string;
  assignees?: Person[];
  createdBy?: Person;
  project?: { _id?: string; name?: string };
  parentTask?: { _id: string; title?: string; key?: string; status?: string };
  subtasks?: Subtask[];
  subtaskStats?: { total: number; done: number };
  comments?: Comment[];
  attachments?: AttachmentItem[];
  timeLogs?: TimeLog[];
  loggedMinutes?: number;
  activity?: Activity[];
  createdAt?: string;
};

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ person, size = 'sm' }: { person?: Person; size?: 'sm' | 'md' }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] font-semibold text-[var(--brand)]',
        size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs'
      )}
      title={person?.name}
    >
      {initials(person?.name)}
    </div>
  );
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((s) => s.id === status)?.label || status.replace('_', ' ');
}

function formatMinutes(minutes = 0) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h && !m) return '0m';
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

function activityLabel(action: string) {
  const map: Record<string, string> = {
    create: 'created this task',
    update: 'updated this task',
    create_subtask: 'added a subtask',
    check_out: 'checked out',
  };
  return map[action] || action.replace(/_/g, ' ');
}

type Props = {
  taskId: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
};

export function TaskIssueModal({ taskId, onClose, onOpenTask }: Props) {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canAssign = role === 'ceo' || role === 'manager';
  const canWrite = !!role;

  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [comment, setComment] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [subsCollapsed, setSubsCollapsed] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subForm, setSubForm] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'medium',
    startDate: '',
    dueDate: '',
  });

  const { data: task, isLoading, isError } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}`)).data.data as TaskIssue,
    enabled: !!taskId,
  });

  const { data: users } = useQuery({
    queryKey: ['users-task-assign'],
    queryFn: async () =>
      (await api.get('/users', { params: { limit: 100, status: 'active' } })).data.data.items as Person[],
    enabled: addOpen || canAssign,
  });

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description || '');
  }, [task]);

  useEffect(() => {
    if (!taskId) return;
    document.body.classList.add('modal-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !addOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [taskId, addOpen, onClose]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks-board'] });
  };

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.patch(`/tasks/${taskId}`, body),
    onSuccess: () => {
      toast.success('Task updated');
      invalidate();
      setEditTitle(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.post(`/tasks/${id}/status`, { status }),
    onSuccess: () => {
      invalidate();
      if (task?.parentTask?._id) {
        qc.invalidateQueries({ queryKey: ['task-detail', task.parentTask._id] });
      }
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const addComment = useMutation({
    mutationFn: async () => api.post(`/tasks/${taskId}/comments`, { body: comment.trim() }),
    onSuccess: () => {
      setComment('');
      toast.success('Comment added');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const createSubtask = useMutation({
    mutationFn: async () =>
      api.post(`/tasks/${taskId}/subtasks`, {
        title: subForm.title.trim(),
        description: subForm.description.trim() || undefined,
        priority: subForm.priority,
        startDate: subForm.startDate || undefined,
        dueDate: subForm.dueDate || undefined,
        assignees: subForm.assignee ? [subForm.assignee] : undefined,
      }),
    onSuccess: () => {
      toast.success('Subtask created');
      setAddOpen(false);
      setSubForm({ title: '', description: '', assignee: '', priority: 'medium', startDate: '', dueDate: '' });
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const uploadAttachments = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) {
        form.append('files', f);
      }
      return api.post(`/tasks/${taskId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Files uploaded to workflow task');
      invalidate();
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachmentId: string) => {
      return api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      toast.success('Attachment removed');
      invalidate();
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const stats = useMemo(() => {
    const list = task?.subtasks || [];
    const total = task?.subtaskStats?.total ?? list.length;
    const done = task?.subtaskStats?.done ?? list.filter((s) => s.status === 'completed').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [task]);

  if (!taskId) return null;

  const isParent = task?.issueType !== 'subtask' && !task?.parentTask;
  const canCompleteParent = role === 'ceo';

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-stretch justify-center bg-[rgba(23,32,51,0.4)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
        onClick={() => !addOpen && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="flex h-[100dvh] w-full max-w-[1200px] flex-col overflow-hidden bg-[var(--bg-elevated)] shadow-[var(--shadow-modal)] sm:h-[min(90vh,920px)] sm:rounded-[var(--radius-lg)] sm:border sm:border-[var(--border)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 sm:px-6 backdrop-blur-xs">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {task?.parentTask ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 transition"
                    onClick={() => onOpenTask(task.parentTask!._id)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>{task.parentTask.key || 'Parent'}</span>
                    <span className="text-slate-400">·</span>
                    <span className="truncate max-w-[150px]">{task.parentTask.title}</span>
                  </button>
                ) : null}
                {task?.project?.name ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    <FolderKanban className="h-3 w-3 text-slate-500" />
                    {task.project.name}
                  </span>
                ) : null}
                {task?.key ? (
                  <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-800">
                    {task.key}
                  </span>
                ) : null}
              </div>

              {editTitle ? (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg font-bold"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    disabled={!title.trim() || patch.isPending}
                    onClick={() => patch.mutate({ title: title.trim() })}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditTitle(false); setTitle(task?.title || ''); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-1.5 block w-full truncate text-left text-lg font-bold tracking-tight text-slate-900 hover:text-teal-700 transition sm:text-2xl"
                  onClick={() => canWrite && setEditTitle(true)}
                  title="Click to edit title"
                >
                  {isLoading ? 'Loading…' : task?.title || 'Task'}
                </button>
              )}

              {/* Header Action Bar */}
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      uploadAttachments.mutate(Array.from(e.target.files));
                      e.target.value = '';
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-xl border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAttachments.isPending}
                >
                  <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                  <span>Attach</span>
                  {(task?.attachments || []).length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                      {task!.attachments!.length}
                    </span>
                  )}
                </Button>
                {isParent ? (
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-xl bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 shadow-2xs"
                    onClick={() => setAddOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add child issue</span>
                  </Button>
                ) : null}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={onClose}
              className="rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {isError ? (
                <p className="text-sm text-[var(--danger)]">Could not load task details.</p>
              ) : isLoading || !task ? (
                <p className="text-sm text-[var(--fg-secondary)]">Loading issue…</p>
              ) : (
                <div className="space-y-6">
                  {/* Hero Properties Matrix */}
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      {/* Status Card */}
                      <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition hover:border-slate-300">
                        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span>Status</span>
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              task?.status === 'completed'
                                ? 'bg-emerald-500 ring-2 ring-emerald-100'
                                : task?.status === 'review'
                                  ? 'bg-amber-500 ring-2 ring-amber-100'
                                  : task?.status === 'in_progress'
                                    ? 'bg-blue-500 ring-2 ring-blue-100'
                                    : 'bg-purple-500 ring-2 ring-purple-100'
                            )}
                          />
                        </div>
                        <Select
                          className="h-7 w-full cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-slate-800 focus:ring-0"
                          value={task?.status || 'todo'}
                          disabled={!task}
                          onChange={(e) => {
                            if (e.target.value === 'completed' && isParent && !canCompleteParent) {
                              toast.error('Only CEO can mark parent tasks Done');
                              return;
                            }
                            setStatus.mutate({ id: taskId, status: e.target.value });
                          }}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {/* Priority Card */}
                      <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition hover:border-slate-300">
                        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span>Priority</span>
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              task?.priority === 'urgent'
                                ? 'bg-rose-500 ring-2 ring-rose-100'
                                : task?.priority === 'high'
                                  ? 'bg-orange-500 ring-2 ring-orange-100'
                                  : task?.priority === 'medium'
                                    ? 'bg-amber-400 ring-2 ring-amber-100'
                                    : 'bg-slate-400 ring-2 ring-slate-100'
                            )}
                          />
                        </div>
                        <Select
                          className="h-7 w-full cursor-pointer border-0 bg-transparent p-0 text-xs font-bold capitalize text-slate-800 focus:ring-0"
                          value={task?.priority || 'medium'}
                          disabled={!task}
                          onChange={(e) => patch.mutate({ priority: e.target.value })}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </Select>
                      </div>

                      {/* Due Date Card */}
                      <div className="group/due relative cursor-pointer rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition hover:border-teal-500/50">
                        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span>Due Date</span>
                          <Calendar className="h-3 w-3 text-teal-600 transition-transform group-hover/due:scale-110" />
                        </div>
                        <div className="truncate text-xs font-bold text-slate-800">
                          {task?.dueDate ? formatDate(task.dueDate) : <span className="font-normal text-slate-400">Set deadline</span>}
                        </div>
                        <input
                          type="date"
                          value={task?.dueDate?.slice(0, 10) || ''}
                          onChange={(e) => patch.mutate({ dueDate: e.target.value || null })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Set due date"
                        />
                      </div>

                      {/* Assignee Card */}
                      <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition hover:border-slate-300">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Assignee</div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Avatar person={task?.assignees?.[0]} size="sm" />
                          <span className="truncate text-xs font-bold text-slate-800">
                            {task?.assignees?.map((a) => a.name).join(', ') || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Meta Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-400">Reporter:</span>
                        <div className="flex items-center gap-1.5">
                          <Avatar person={task?.createdBy} size="sm" />
                          <span className="font-semibold text-slate-700">{task?.createdBy?.name || 'Workspace'}</span>
                        </div>
                      </div>
                      <div className="relative flex items-center gap-1.5 cursor-pointer hover:text-teal-700 transition">
                        <Calendar className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-[11px] font-medium">
                          Start: <strong className="text-slate-700">{task?.startDate ? formatDate(task.startDate) : 'Not set'}</strong>
                        </span>
                        <input
                          type="date"
                          value={task?.startDate?.slice(0, 10) || ''}
                          onChange={(e) => patch.mutate({ startDate: e.target.value || null })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Set start date"
                        />
                      </div>
                      {task?.startedAt ? (
                        <span className="text-[10px] text-slate-400">Started {formatDateTime(task.startedAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Description</Label>
                    <Textarea
                      className="min-h-24 rounded-xl border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-2xs focus:border-teal-500"
                      value={description}
                      placeholder="Add requirements, context, or notes for this task…"
                      onChange={(e) => setDescription(e.target.value)}
                      onBlur={() => {
                        if ((task.description || '') !== description) {
                          patch.mutate({ description });
                        }
                      }}
                    />
                  </div>

                  {/* Subtasks panel — parents only */}
                  {isParent ? (
                    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--divider)] px-4 py-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]"
                          onClick={() => setSubsCollapsed((v) => !v)}
                        >
                          <ListTodo className="h-4 w-4 text-[var(--brand)]" />
                          Subtasks
                          <span className="text-xs font-medium text-[var(--fg-secondary)]">
                            {stats.done} of {stats.total} completed
                          </span>
                        </button>
                        <Button size="sm" onClick={() => setAddOpen(true)}>
                          <Plus className="h-3.5 w-3.5" />
                          Add Subtask
                        </Button>
                      </div>

                      {!subsCollapsed ? (
                        <div className="px-3 py-3 sm:px-4">
                          {stats.total > 0 ? (
                            <div className="mb-3">
                              <div className="mb-1 flex items-center justify-between text-xs text-[var(--fg-secondary)]">
                                <span>{stats.pct}% done</span>
                                <span>
                                  {stats.done}/{stats.total}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-[var(--divider)]">
                                <div
                                  className="h-full rounded-full bg-[var(--success)] transition-all duration-300"
                                  style={{ width: `${stats.pct}%` }}
                                />
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            {(task.subtasks || []).map((s) => {
                              const assignee = s.assignees?.[0];
                              const done = s.status === 'completed';
                              return (
                                <div
                                  key={s._id}
                                  className="group flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-2.5 transition hover:border-[var(--brand)]/35 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-2.5"
                                >
                                  <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)] sm:mt-0"
                                      checked={done}
                                      onChange={() =>
                                        setStatus.mutate({
                                          id: s._id,
                                          status: done ? 'todo' : 'completed',
                                        })
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 text-left"
                                      onClick={() => onOpenTask(s._id)}
                                    >
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {s.key ? (
                                          <span className="font-mono text-[11px] font-semibold text-[var(--fg-muted)]">
                                            {s.key}
                                          </span>
                                        ) : null}
                                        <span
                                          className={cn(
                                            'break-words text-sm font-medium text-[var(--fg)]',
                                            done && 'text-[var(--fg-muted)] line-through'
                                          )}
                                        >
                                          {s.title}
                                        </span>
                                      </div>
                                      <div className="mt-0.5 text-[11px] text-[var(--fg-muted)]">
                                        {assignee?.name ? `Assigned to ${assignee.name}` : 'Unassigned'}
                                        {s.dueDate ? ` · Due ${formatDate(s.dueDate)}` : ''}
                                      </div>
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pl-6 sm:justify-end sm:pl-0">
                                    <div className="flex items-center gap-1.5">
                                      <Avatar person={assignee} />
                                      <span className="max-w-[100px] truncate text-xs font-medium text-[var(--fg)] sm:hidden">
                                        {assignee?.name || 'Unassigned'}
                                      </span>
                                    </div>
                                    <Select
                                      className="h-8 w-28 shrink-0 text-xs sm:w-[130px]"
                                      value={s.status}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setStatus.mutate({ id: s._id, status: e.target.value })}
                                    >
                                      {STATUS_OPTIONS.map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                </div>
                              );
                            })}
                            {!stats.total ? (
                              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                                <p className="text-sm font-medium text-[var(--fg)]">No subtasks yet</p>
                                <p className="mt-1 text-xs text-[var(--fg-secondary)]">
                                  Break this work into child issues for clearer progress tracking.
                                </p>
                                <Button className="mt-3" size="sm" onClick={() => setAddOpen(true)}>
                                  <Plus className="h-3.5 w-3.5" />
                                  Add Subtask
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {/* Time tracking */}
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                      <Clock3 className="h-4 w-4 text-[var(--teal)]" />
                      Time tracking
                    </h3>
                    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                      <div className="text-sm font-medium text-[var(--fg)]">
                        {formatMinutes(task.loggedMinutes || 0)} logged
                      </div>
                      {(task.timeLogs || []).length ? (
                        <ul className="mt-2 space-y-2">
                          {(task.timeLogs || []).slice(0, 5).map((log) => (
                            <li key={log._id} className="flex items-start justify-between gap-2 text-xs">
                              <div>
                                <span className="font-medium text-[var(--fg)]">{log.user?.name || 'User'}</span>
                                <span className="text-[var(--fg-muted)]"> · {formatDateTime(log.start)}</span>
                                {log.note ? <div className="text-[var(--fg-secondary)]">{log.note}</div> : null}
                              </div>
                              <span className="font-semibold text-[var(--fg)]">{formatMinutes(log.minutes)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--fg-muted)]">No work logs recorded for this task yet.</p>
                      )}
                    </div>
                  </section>

                  {/* Attachments & Content Files */}
                  <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-2xs">
                    <AttachmentsSection
                      attachments={task.attachments || []}
                      onUpload={async (files) => {
                        await uploadAttachments.mutateAsync(files);
                      }}
                      onDelete={async (attachmentId) => {
                        await deleteAttachment.mutateAsync(attachmentId);
                      }}
                      canUpload={canWrite}
                      canDelete={canWrite}
                      isUploading={uploadAttachments.isPending}
                      title="Workflow Content &amp; Attachments"
                      description="Upload creative assets, brief PDFs, designs, and content for this workflow task. Directly viewable by assigned employees."
                    />
                  </section>

                  {/* Activity / comments */}
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <MessageSquare className="h-4 w-4" />
                      Activity
                    </h3>
                    <div className="mb-3 flex gap-2">
                      <Textarea
                        className="min-h-[72px]"
                        placeholder="Add a comment…"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!comment.trim() || addComment.isPending}
                      onClick={() => addComment.mutate()}
                    >
                      {addComment.isPending ? 'Posting…' : 'Comment'}
                    </Button>

                    <div className="mt-4 space-y-3">
                      {(task.comments || [])
                        .slice()
                        .reverse()
                        .map((c, i) => (
                          <div key={c._id || i} className="flex gap-2">
                            <Avatar person={c.user} />
                            <div className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-[var(--fg)]">{c.user?.name}</span>
                                <span className="text-[var(--fg-muted)]">{formatDateTime(c.createdAt)}</span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg)]">{c.body}</p>
                            </div>
                          </div>
                        ))}

                      {(task.activity || []).map((a) => (
                        <div key={a._id} className="flex gap-2 text-xs text-[var(--fg-secondary)]">
                          <Avatar person={a.actor} />
                          <div>
                            <span className="font-semibold text-[var(--fg)]">{a.actor?.name || 'Someone'}</span>{' '}
                            {activityLabel(a.action)}
                            <div className="text-[var(--fg-muted)]">{formatDateTime(a.createdAt)}</div>
                          </div>
                        </div>
                      ))}

                      {!task.comments?.length && !task.activity?.length ? (
                        <p className="text-xs text-[var(--fg-muted)]">No activity yet.</p>
                      ) : null}
                    </div>
                  </section>

                  {/* Mobile Task Details Accordion (shows only on mobile where aside is hidden) */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs lg:hidden">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500"
                      onClick={() => setMobileDetailsOpen((v) => !v)}
                    >
                      <span className="flex items-center gap-2">
                        <FolderKanban className="h-3.5 w-3.5 text-teal-600" />
                        Task Metadata &amp; Details
                      </span>
                      <span className="text-teal-700 font-semibold">{mobileDetailsOpen ? 'Hide' : 'Show details'}</span>
                    </button>
                    {mobileDetailsOpen && (
                      <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Project:</span>
                          <span className="font-semibold text-slate-800">{task?.project?.name || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Parent Task:</span>
                          <span className="font-semibold text-slate-800">
                            {task?.parentTask ? (
                              <button
                                type="button"
                                className="text-teal-700 hover:underline"
                                onClick={() => onOpenTask(task.parentTask!._id)}
                              >
                                {task.parentTask.key || task.parentTask.title}
                              </button>
                            ) : (
                              'None'
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Time logged:</span>
                          <span className="font-bold text-teal-700">{formatMinutes(task?.loggedMinutes || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Labels:</span>
                          <span className="font-medium text-slate-700">
                            {(task?.tags || []).length
                              ? task!.tags!.map((t) => (
                                  <Badge key={t} tone="brand" className="mr-1">
                                    {t}
                                  </Badge>
                                ))
                              : 'None'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Details sidebar (Desktop only) */}
            <aside className="hidden lg:block w-[300px] shrink-0 border-l border-slate-200 bg-[var(--bg-table-header)] overflow-y-auto">
              <div className="space-y-4 p-5">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Properties
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm shadow-2xs">
                    <DetailRow label="Assignee">
                      <div className="flex items-center gap-2">
                        <Avatar person={task?.assignees?.[0]} />
                        <span className="font-medium text-slate-800 truncate">{task?.assignees?.map((a) => a.name).join(', ') || 'Unassigned'}</span>
                      </div>
                    </DetailRow>
                    <DetailRow label="Reporter">
                      <div className="flex items-center gap-2">
                        <Avatar person={task?.createdBy} />
                        <span className="font-medium text-slate-800 truncate">{task?.createdBy?.name || '—'}</span>
                      </div>
                    </DetailRow>
                    <DetailRow label="Priority">
                      <Select
                        className="h-8 text-xs font-semibold"
                        value={task?.priority || 'medium'}
                        disabled={!task}
                        onChange={(e) => patch.mutate({ priority: e.target.value })}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </Select>
                    </DetailRow>
                    <DetailRow label="Status">
                      <Badge tone={statusTone(task?.status)}>{statusLabel(task?.status || 'todo')}</Badge>
                    </DetailRow>
                    <DetailRow label="Start">{formatDate(task?.startDate)}</DetailRow>
                    <DetailRow label="Due">{formatDate(task?.dueDate)}</DetailRow>
                    <DetailRow label="Project">{task?.project?.name || '—'}</DetailRow>
                    <DetailRow label="Parent">
                      {task?.parentTask ? (
                        <button
                          type="button"
                          className="text-left font-medium text-teal-700 hover:underline"
                          onClick={() => onOpenTask(task.parentTask!._id)}
                        >
                          {task.parentTask.key || task.parentTask.title}
                        </button>
                      ) : (
                        'None'
                      )}
                    </DetailRow>
                    <DetailRow label="Labels">
                      {(task?.tags || []).length
                        ? task!.tags!.map((t) => (
                            <Badge key={t} tone="brand" className="mr-1">
                              {t}
                            </Badge>
                          ))
                        : 'None'}
                    </DetailRow>
                    <DetailRow label="Time logged">
                      <span className="font-semibold text-teal-700">
                        {formatMinutes(task?.loggedMinutes || 0)}
                      </span>
                    </DetailRow>
                    {isParent ? (
                      <DetailRow label="Subtasks">
                        {stats.total ? `${stats.done}/${stats.total} · ${stats.pct}%` : 'None'}
                      </DetailRow>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => !createSubtask.isPending && setAddOpen(false)}
        title="Add subtask"
        description="Create a child issue linked to this parent task and project."
        size="md"
        preventDismiss={createSubtask.isPending}
        footer={
          <>
            <Button variant="outline" disabled={createSubtask.isPending} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!subForm.title.trim() || createSubtask.isPending}
              onClick={() => createSubtask.mutate()}
            >
              {createSubtask.isPending ? 'Creating…' : 'Create Subtask'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label required>Subtask title</Label>
            <Input
              value={subForm.title}
              onChange={(e) => setSubForm({ ...subForm, title: e.target.value })}
              placeholder="e.g. Fix login validation"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={subForm.description}
              onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
              placeholder="Optional details"
            />
          </div>
          <div>
            <Label>Assignee</Label>
            <Select
              value={subForm.assignee}
              onChange={(e) => setSubForm({ ...subForm, assignee: e.target.value })}
            >
              <option value="">Same as parent / unassigned</option>
              {(users || []).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Priority</Label>
              <Select
                value={subForm.priority}
                onChange={(e) => setSubForm({ ...subForm, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Critical</option>
              </Select>
            </div>
            <div>
              <Label>Initial status</Label>
              <Input value="To Do" disabled />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={subForm.startDate}
                onChange={(e) => setSubForm({ ...subForm, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={subForm.dueDate}
                onChange={(e) => setSubForm({ ...subForm, dueDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-2">
      <div className="pt-0.5 text-xs font-medium text-[var(--fg-muted)]">{label}</div>
      <div className="min-w-0 text-sm text-[var(--fg)]">{children}</div>
    </div>
  );
}
