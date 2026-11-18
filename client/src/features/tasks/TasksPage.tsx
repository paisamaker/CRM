import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Calendar,
  Clock3,
  ListTodo,
  Plus,
  Paperclip,
  FileText,
  Image as ImageIcon,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowRight,
  CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage, getAuthenticatedFileUrl, isImageFile, isPdfFile } from '@/lib/api';
import { Card, EmptyState, TableShell } from '@/components/ui/Card';
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
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardTask | null>(null);
  const [mobileColumn, setMobileColumn] = useState<string>('todo');
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const can = useAuthStore((s) => s.can);
  const canAssign = role === 'ceo';
  const canWrite = !!role;
  const canDelete = can('tasks', 'delete') || role === 'ceo';
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

  const deleteTask = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: (_res, id) => {
      toast.success('Task deleted');
      setDeleteTarget(null);
      setMenuTaskId(null);
      setIssueStack((stack) => {
        const idx = stack.indexOf(id);
        if (idx < 0) return stack;
        return stack.slice(0, idx);
      });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const flat = useMemo(() => {
    if (!data) return [] as BoardTask[];
    return columns.flatMap((c) => (data[c.id] || []).map((t) => ({ ...t, status: c.id })));
  }, [data]);

  useEffect(() => {
    if (!menuTaskId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-task-menu]')) return;
      setMenuTaskId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuTaskId]);

  function openIssue(id: string) {
    setMenuTaskId(null);
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

  function handleIssueDeleted(id: string) {
    setIssueStack((stack) => {
      const idx = stack.indexOf(id);
      if (idx < 0) return [];
      return stack.slice(0, idx);
    });
    qc.invalidateQueries({ queryKey: ['tasks-board'] });
  }

  function moveTask(task: BoardTask, status: string) {
    if (task.status === status) return;
    if (status === 'completed' && role !== 'ceo') {
      toast.error('Only CEO can mark parent tasks Done');
      return;
    }
    setMenuTaskId(null);
    updateStatus.mutate(
      { id: task._id, status },
      {
        onSuccess: () => {
          toast.success(`Moved to ${columns.find((c) => c.id === status)?.label || status}`);
          // On mobile single-column view, follow the card
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches) {
            if (mobileColumn !== 'all') setMobileColumn(status);
          }
        },
      }
    );
  }

  function TaskActionsMenu({ task }: { task: BoardTask }) {
    if (!canWrite && !canDelete) return null;
    const open = menuTaskId === task._id;
    const moveTargets = columns.filter((c) => c.id !== task.status);
    return (
      <div className="relative" data-task-menu>
        <button
          type="button"
          aria-label="Task actions"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--fg-muted)] transition hover:bg-[var(--bg)] hover:text-[var(--fg)]',
            open && 'bg-[var(--bg)] text-[var(--fg)]'
          )}
          onClick={(e) => {
            e.stopPropagation();
            setMenuTaskId(open ? null : task._id);
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open ? (
          <div
            className="absolute right-0 top-8 z-30 w-[188px] overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {canWrite ? (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => openIssue(task._id)}
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-500" />
                  Edit
                </button>
                <div className="my-1 border-t border-slate-100" />
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Move to
                </div>
                {moveTargets.map((c) => {
                  const blocked = c.id === 'completed' && role !== 'ceo';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={blocked || updateStatus.isPending}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45',
                        c.id === 'completed' ? 'text-teal-700' : 'text-slate-700'
                      )}
                      title={blocked ? 'Only CEO can mark Done' : `Move to ${c.label}`}
                      onClick={() => moveTask(task, c.id)}
                    >
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      {c.label}
                    </button>
                  );
                })}
              </>
            ) : null}
            {canDelete ? (
              <>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  onClick={() => {
                    setMenuTaskId(null);
                    setDeleteTarget(task);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const status = columns.some((c) => c.id === overId)
      ? overId
      : flat.find((t) => t._id === overId)?.status;
    if (!status) return;
    const task = flat.find((t) => t._id === taskId);
    if (task) moveTask(task, status);
    else {
      if (status === 'completed' && role !== 'ceo') {
        toast.error('Only CEO can mark parent tasks Done');
        return;
      }
      updateStatus.mutate({ id: taskId, status });
    }
  }

  const selectedProjectName = projects?.find((p: { _id: string }) => p._id === projectFilter)?.name;
  const totalTasks = useMemo(
    () => (data ? Object.values(data).reduce((acc, col) => acc + (col?.length || 0), 0) : 0),
    [data]
  );

  const mobileColumnInitKey = useRef<string | null>(null);
  // Prefer the first column with tasks when opening a project on mobile.
  useEffect(() => {
    if (!data) return;
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches) return;
    const key = projectFilter || '__all__';
    if (mobileColumnInitKey.current === key) return;
    mobileColumnInitKey.current = key;
    const firstWithItems = columns.find((c) => (data[c.id] || []).length > 0);
    setMobileColumn(firstWithItems?.id || 'todo');
  }, [data, projectFilter]);

  return (
    <div className="pb-6">
      <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-[1.625rem]">
            Tasks & Workflow
          </h1>
          <p className="mt-0.5 hidden max-w-2xl text-sm text-[var(--fg-secondary)] sm:block">
            Board, issue details, subtasks, and activity
          </p>
        </div>
        <p className="text-[12px] text-[var(--fg-muted)] sm:hidden">
          {totalTasks} task{totalTasks === 1 ? '' : 's'}
          {selectedProjectName ? ` · ${selectedProjectName}` : ''}
        </p>
      </div>

      {/* Compact sticky controls */}
      <div className="sticky top-14 z-20 -mx-3 mb-3 space-y-2 border-b border-[var(--border)] bg-[var(--bg)]/95 px-3 py-2.5 backdrop-blur-md sm:static sm:mx-0 sm:mb-4 sm:space-y-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Select
            value={projectFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setParams({ project: v });
              else setParams({});
            }}
            className="h-10 w-full text-sm sm:h-9 sm:w-56"
          >
            <option value="">All projects</option>
            {(projects || []).map((p: { _id: string; name: string }) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 sm:flex-none">
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold sm:flex-none sm:py-1.5',
                  view === 'board'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-[var(--fg-secondary)]'
                )}
                onClick={() => setView('board')}
              >
                Board
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold sm:flex-none sm:py-1.5',
                  view === 'table'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-[var(--fg-secondary)]'
                )}
                onClick={() => setView('table')}
              >
                Table
              </button>
            </div>
            <Button
              onClick={() => setOpen(true)}
              className="h-10 shrink-0 gap-1.5 px-3 sm:h-9"
            >
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">Create</span>
              <span className="hidden sm:inline">Create Task</span>
            </Button>
          </div>
        </div>

        {selectedProjectName ? (
          <div className="flex items-center gap-2 rounded-xl border border-teal-200/80 bg-teal-50/80 px-3 py-2 text-[11px] font-medium text-teal-900 sm:text-xs">
            <span className="truncate">
              <span className="font-bold">{selectedProjectName}</span>
              <span className="text-teal-700/80"> · tap a card to open details</span>
            </span>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Loading workflow board…</Card>
      ) : null}

      {view === 'board' && data ? (
        <>
          {/* Mobile status pills */}
          <div
            className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden xl:hidden"
            role="tablist"
            aria-label="Board columns"
          >
            {columns.map((c) => {
              const count = (data[c.id] || []).length;
              const active = mobileColumn === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileColumn(c.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition',
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                  )}
                >
                  {c.label}
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={mobileColumn === 'all'}
              onClick={() => setMobileColumn('all')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition',
                mobileColumn === 'all'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600'
              )}
            >
              All
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  mobileColumn === 'all' ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                )}
              >
                {totalTasks}
              </span>
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div
              className={cn(
                mobileColumn === 'all'
                  ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 [scrollbar-width:thin] xl:grid xl:grid-cols-4 xl:overflow-visible xl:pb-0'
                  : 'grid gap-3 xl:grid-cols-4'
              )}
            >
              {columns
                .filter((col) => mobileColumn === 'all' || mobileColumn === col.id)
                .map((col) => {
                const accentBar =
                  col.id === 'todo'
                    ? 'bg-slate-400'
                    : col.id === 'in_progress'
                      ? 'bg-sky-600'
                      : col.id === 'review'
                        ? 'bg-amber-600'
                        : 'bg-[var(--teal)]';

                const tone =
                  col.id === 'todo'
                    ? 'default'
                    : col.id === 'in_progress'
                      ? 'info'
                      : col.id === 'review'
                        ? 'orange'
                        : 'teal';

                const colTasks = data[col.id] || [];

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
                      'overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] shadow-xs',
                      mobileColumn === 'all'
                        ? 'w-[min(86vw,320px)] shrink-0 snap-center xl:w-auto xl:shrink xl:snap-none'
                        : 'w-full'
                    )}
                  >
                    <div className={cn('h-1 w-full', accentBar)} />
                    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--fg)]">
                        {col.label}
                      </h3>
                      <Badge tone={tone} className="text-[10px] !px-1.5 !py-0">
                        {colTasks.length}
                      </Badge>
                    </div>
                    <div className="min-h-28 space-y-2 px-2.5 pb-3">
                      {!colTasks.length ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-10 text-center">
                          <p className="text-xs font-medium text-slate-500">No tasks here</p>
                          <button
                            type="button"
                            className="mt-2 text-[11px] font-semibold text-teal-700"
                            onClick={() => setOpen(true)}
                          >
                            + Add task
                          </button>
                        </div>
                      ) : null}
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
                          className="group/card relative cursor-pointer rounded-xl border border-[var(--border)] bg-white p-3 shadow-sm transition active:scale-[0.99] hover:border-teal-300/60 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[var(--fg)] sm:text-sm">
                              {task.title}
                            </div>
                            <div
                              className={cn(
                                'shrink-0 transition',
                                menuTaskId === task._id
                                  ? 'opacity-100'
                                  : 'opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <TaskActionsMenu task={task} />
                            </div>
                          </div>
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

                          {canWrite ? (
                            <div
                              className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {columns
                                .filter((c) => c.id !== task.status)
                                .map((c) => {
                                  const blocked = c.id === 'completed' && role !== 'ceo';
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      disabled={blocked || updateStatus.isPending}
                                      title={blocked ? 'Only CEO can mark Done' : `Move to ${c.label}`}
                                      onClick={() => moveTask(task, c.id)}
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                                        c.id === 'review'
                                          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                          : c.id === 'completed'
                                            ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
                                            : c.id === 'in_progress'
                                              ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                      )}
                                    >
                                      <CircleDot className="h-2.5 w-2.5" />
                                      {c.label}
                                    </button>
                                  );
                                })}
                            </div>
                          ) : null}
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
                <th className="w-24">Actions</th>
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
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {canWrite ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-500"
                          aria-label="Edit task"
                          onClick={() => openIssue(t._id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                          aria-label="Delete task"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
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

      <TaskIssueModal
        taskId={detailId}
        onClose={closeIssue}
        onOpenTask={openChild}
        onDeleted={handleIssueDeleted}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleteTask.isPending && setDeleteTarget(null)}
        title="Delete task?"
        description="This removes the task and its subtasks from the board. This cannot be undone."
        size="sm"
        preventDismiss={deleteTask.isPending}
        footer={
          <>
            <Button variant="outline" disabled={deleteTask.isPending} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!deleteTarget || deleteTask.isPending}
              onClick={() => deleteTarget && deleteTask.mutate(deleteTarget._id)}
            >
              {deleteTask.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        {deleteTarget ? (
          <p className="text-sm text-[var(--fg-secondary)]">
            <span className="font-semibold text-[var(--fg)]">{deleteTarget.key || 'Task'}</span>
            {` · ${deleteTarget.title}`}
          </p>
        ) : null}
      </Modal>

      {cardPreviewFile && (
        <FilePreviewModal file={cardPreviewFile} onClose={() => setCardPreviewFile(null)} />
      )}
    </div>
  );
}
