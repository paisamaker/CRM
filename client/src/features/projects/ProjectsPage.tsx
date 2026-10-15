import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FolderKanban,
  Briefcase,
  Users,
  Plus,
  Search,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  MoreVertical,
  Edit2,
  Trash2,
  Building2,
  Sparkles,
  Check,
  UserPlus,
  Layers,
  ShieldCheck,
  X,
  Target,
  Paperclip,
  FileText,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import type { WorkingTeam } from '@/features/teams/types';
import { ProjectFilesModal } from './ProjectFilesModal';

interface Member {
  _id: string;
  name: string;
  email?: string;
  role?: string;
  avatar?: string;
  department?: string;
  designation?: string;
}

interface ProjectRow {
  _id: string;
  name: string;
  status: 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  progress: number;
  budget: number;
  startDate?: string;
  endDate?: string;
  description?: string;
  client?: { _id?: string; company?: string; name?: string };
  owner?: { _id?: string; name?: string; email?: string };
  members?: Member[];
  attachments?: {
    _id?: string;
    name: string;
    url: string;
    size?: number;
    mime?: string;
    uploadedBy?: { name?: string; avatar?: string };
    createdAt?: string;
  }[];
}

export function ProjectsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const can = useAuthStore((s) => s.can);
  const canCreate = role === 'ceo' || can('projects', 'create');
  const canAssign = role === 'ceo' || role === 'manager' || can('projects', 'update');
  const canDelete = role === 'ceo';
  const qc = useQueryClient();

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [assignProject, setAssignProject] = useState<ProjectRow | null>(null);
  const [filesProject, setFilesProject] = useState<ProjectRow | null>(null);

  // Assign modal state
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState('');
  const [createTasks, setCreateTasks] = useState(true);
  const [taskTitle, setTaskTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  // New project form state
  const [form, setForm] = useState({
    name: '',
    client: '',
    budget: '',
    startDate: '',
    endDate: '',
    status: 'active' as ProjectRow['status'],
    description: '',
  });

  // Edit project form state
  const [editForm, setEditForm] = useState({
    name: '',
    client: '',
    budget: '',
    startDate: '',
    endDate: '',
    status: 'active' as ProjectRow['status'],
    progress: 0,
    description: '',
  });

  // Fetch projects
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects', { params: { limit: 100 } })).data.data,
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: async () => (await api.get('/clients', { params: { limit: 100 } })).data.data.items,
    enabled: createOpen || !!editProject,
  });

  // Fetch active users for assignment
  const { data: employees } = useQuery({
    queryKey: ['users-assign'],
    queryFn: async () =>
      (await api.get('/users', { params: { limit: 100, status: 'active' } })).data.data.items as Member[],
    enabled: !!assignProject || (createOpen && canCreate),
  });

  // Fetch working teams to allow squad-based assignment & display
  const { data: workingTeams = [] } = useQuery({
    queryKey: ['working-teams'],
    queryFn: async () => (await api.get('/teams')).data.data as WorkingTeam[],
  });

  // Create project mutation
  const create = useMutation({
    mutationFn: async () =>
      api.post('/projects', {
        name: form.name,
        client: form.client || undefined,
        budget: Number(form.budget || 0),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        status: form.status,
        description: form.description || undefined,
      }),
    onSuccess: (res) => {
      toast.success('Project created — assign team members next');
      setCreateOpen(false);
      setForm({ name: '', client: '', budget: '', startDate: '', endDate: '', status: 'active', description: '' });
      qc.invalidateQueries({ queryKey: ['projects'] });
      const created = res.data.data;
      setAssignProject({
        _id: created._id,
        name: created.name,
        status: created.status,
        progress: created.progress || 0,
        budget: created.budget || 0,
        members: [],
      });
      setSelectedMembers([]);
      setSelectedSquadId('');
      setTaskTitle(`Work on ${created.name}`);
      setCreateTasks(true);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Edit project mutation
  const update = useMutation({
    mutationFn: async () =>
      api.patch(`/projects/${editProject!._id}`, {
        name: editForm.name,
        client: editForm.client || undefined,
        budget: Number(editForm.budget || 0),
        startDate: editForm.startDate || undefined,
        endDate: editForm.endDate || undefined,
        status: editForm.status,
        progress: Number(editForm.progress || 0),
        description: editForm.description || undefined,
      }),
    onSuccess: () => {
      toast.success('Project updated successfully');
      setEditProject(null);
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Delete project mutation
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project deleted');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Assign team mutation
  const assign = useMutation({
    mutationFn: async () =>
      api.post(`/projects/${assignProject!._id}/assign`, {
        memberIds: selectedMembers,
        createTasks,
        taskTitle: taskTitle || undefined,
        priority,
      }),
    onSuccess: (res) => {
      const n = res.data.data.tasksCreated || 0;
      toast.success(
        n > 0
          ? `Team assigned! ${n} task(s) added to the Jira/Kanban board.`
          : 'Team assigned to project successfully'
      );
      setAssignProject(null);
      setSelectedMembers([]);
      setSelectedSquadId('');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Filter projects
  const projectsList = (data?.items || []) as ProjectRow[];

  const filteredProjects = useMemo(() => {
    let list = [...projectsList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.client?.company || p.client?.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          p.members?.some((m) => m.name.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((p) => p.status === statusFilter);
    }
    return list;
  }, [projectsList, search, statusFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = projectsList.length;
    const active = projectsList.filter((p) => p.status === 'active').length;
    const totalBudget = projectsList.reduce((acc, p) => acc + (p.budget || 0), 0);
    const avgProgress =
      total > 0 ? Math.round(projectsList.reduce((acc, p) => acc + (p.progress || 0), 0) / total) : 0;
    const allMembers = new Set<string>();
    projectsList.forEach((p) => (p.members || []).forEach((m) => allMembers.add(m._id)));
    return { total, active, totalBudget, avgProgress, assignedMembersCount: allMembers.size };
  }, [projectsList]);

  // Assignable users
  const assignableUsers = (employees || []).filter((u) =>
    ['employee', 'manager', 'finance'].includes(u.role || 'employee')
  );

  // Filtered assignable users in modal
  const modalFilteredUsers = useMemo(() => {
    if (!memberSearch.trim()) return assignableUsers;
    const q = memberSearch.trim().toLowerCase();
    return assignableUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q)
    );
  }, [assignableUsers, memberSearch]);

  // Handle squad pick in assignment modal
  const handleSelectSquad = (squadId: string) => {
    setSelectedSquadId(squadId);
    if (!squadId) return;
    const team = workingTeams.find((t) => t._id === squadId);
    if (team) {
      const teamMemberIds = team.members.map((m) => m._id);
      setSelectedMembers((prev) => Array.from(new Set([...prev, ...teamMemberIds])));
      toast.info(`Selected all ${team.members.length} members from "${team.name}"`);
    }
  };

  // Find assigned squad for a project
  const getAssignedSquad = (projectId: string) => {
    return workingTeams.find(
      (t) =>
        t.project?._id === projectId ||
        (typeof t.project === 'string' && t.project === projectId)
    );
  };

  return (
    <div className="space-y-6">
      {/* Sleek Enterprise Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-teal-700 font-semibold">Projects & Campaigns</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Projects &amp; Campaigns
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Allocate working squads, configure milestone deliverables, and track progress.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Button
              onClick={() => {
                setForm({
                  name: '',
                  client: '',
                  budget: '',
                  startDate: '',
                  endDate: '',
                  status: 'active',
                  description: '',
                });
                setCreateOpen(true);
              }}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white shadow-xs font-medium flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>New Project</span>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Projects</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <FolderKanban className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{metrics.active}</span>
            <span className="text-xs text-slate-500">/ {metrics.total} total</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Budget</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900">
              {formatCurrency(metrics.totalBudget)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Avg Completion</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{metrics.avgProgress}%</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600 transition-all"
                style={{ width: `${metrics.avgProgress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Assigned Staff</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900">{metrics.assignedMembersCount}</span>
            <span className="text-xs text-slate-500">collaborators</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1 w-fit shadow-2xs">
          {[
            { id: 'all', label: 'All Projects', count: metrics.total },
            { id: 'active', label: 'Active', count: metrics.active },
            { id: 'planned', label: 'Planned', count: projectsList.filter((p) => p.status === 'planned').length },
            { id: 'on_hold', label: 'On Hold', count: projectsList.filter((p) => p.status === 'on_hold').length },
            { id: 'completed', label: 'Completed', count: projectsList.filter((p) => p.status === 'completed').length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10px]',
                  statusFilter === tab.id ? 'bg-slate-100 text-slate-800' : 'text-slate-400'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, clients, members..."
            className="w-full rounded-xl border border-slate-200/80 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 mb-3">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No projects found</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search criteria or status filter.'
              : 'Create your first project to start allocating teams and tracking delivery.'}
          </p>
          {canCreate && !search && statusFilter === 'all' && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-4 bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((p) => {
            const assignedSquad = getAssignedSquad(p._id);
            const members = p.members || [];

            return (
              <div
                key={p._id}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 transition-all duration-200 hover:border-slate-300 hover:shadow-md"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                        <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {p.client?.company || p.client?.name || 'Internal Workspace'}
                        </span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-slate-900 truncate tracking-tight group-hover:text-teal-700 transition">
                        {p.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1">
                      <Badge tone={statusTone(p.status)} className="capitalize text-[10px] px-2 py-0.5">
                        {p.status.replace('_', ' ')}
                      </Badge>

                      {/* Dropdown / Quick action menu */}
                      <div className="relative flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setEditProject(p);
                            setEditForm({
                              name: p.name,
                              client: p.client?._id || '',
                              budget: String(p.budget || ''),
                              startDate: p.startDate ? p.startDate.split('T')[0] : '',
                              endDate: p.endDate ? p.endDate.split('T')[0] : '',
                              status: p.status,
                              progress: p.progress || 0,
                              description: p.description || '',
                            });
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Edit project"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Delete project"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Optional Description */}
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  {/* Working Squad Badge if assigned */}
                  {assignedSquad && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-teal-200/80 bg-teal-50/70 px-2.5 py-1 text-[11px] font-semibold text-teal-900">
                      <Users className="h-3 w-3 text-teal-600" />
                      <span>Squad: {assignedSquad.name}</span>
                      <span className="text-[10px] text-teal-600 font-normal">
                        ({assignedSquad.members.length} members)
                      </span>
                    </div>
                  )}

                  {/* Milestone Progress Bar */}
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500 text-[11px]">Milestone Delivery</span>
                      <span className="font-bold text-teal-700">{p.progress || 0}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${p.progress || 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Budget & Target Delivery Date */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        Allocated Budget
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(p.budget || 0)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        Target Deadline
                      </span>
                      <span className="font-medium text-slate-700 flex items-center justify-end gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        {p.endDate ? formatDate(p.endDate) : 'Flexible'}
                      </span>
                    </div>
                  </div>

                  {/* Collaborators / Team Roster Stack */}
                  <div className="mt-3.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-500">Team Roster:</span>
                    {members.length > 0 ? (
                      <div className="flex items-center -space-x-1.5 overflow-hidden">
                        {members.slice(0, 4).map((m) => (
                          <div
                            key={m._id}
                            title={`${m.name} (${m.role || 'employee'})`}
                            className="inline-block ring-2 ring-white rounded-full"
                          >
                            <UserAvatar
                              name={m.name}
                              avatar={m.avatar}
                              className="h-6 w-6 rounded-full text-[10px]"
                            />
                          </div>
                        ))}
                        {members.length > 4 && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 ring-2 ring-white">
                            +{members.length - 4}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-slate-400">No teammates assigned</span>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-3.5">
                  {canAssign && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignProject(p);
                        setSelectedMembers((p.members || []).map((m) => m._id));
                        setSelectedSquadId(assignedSquad?._id || '');
                        setTaskTitle(`Work on ${p.name}`);
                        setCreateTasks(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-100/80 hover:text-teal-900 shadow-2xs"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Assign Staff</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setFilesProject(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-teal-50 hover:border-teal-200 hover:text-teal-800 shadow-2xs"
                    title="View and upload project documents, PDFs & media"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-teal-600" />
                    <span>Files ({(p.attachments || []).length})</span>
                  </button>

                  <Link
                    to={`/tasks?project=${p._id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
                  >
                    <span>Open Board</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          REDESIGNED MODAL 1: Assign Employees & Working Squad (Pop-up Card Dialog)
          ========================================================================= */}
      <Modal
        open={!!assignProject}
        onClose={() => setAssignProject(null)}
        title="Assign Team & Workflows"
        size="lg"
        variant="dialog"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-teal-800">{selectedMembers.length}</span>{' '}
              teammates selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setAssignProject(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedMembers.length || assign.isPending}
                onClick={() => assign.mutate()}
                className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {assign.isPending ? 'Assigning...' : 'Confirm & Assign Team'}
                </span>
              </Button>
            </div>
          </div>
        }
      >
        {assignProject && (
          <div className="space-y-4">
            {/* Project Context Header */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Target Project
                </span>
                <div className="text-sm font-bold text-slate-900">{assignProject.name}</div>
              </div>
              <Badge tone={statusTone(assignProject.status)} className="capitalize text-[10px]">
                {assignProject.status}
              </Badge>
            </div>

            {/* Quick Assign Squad Option */}
            {workingTeams.length > 0 && (
              <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                    <span>Quick Assign by Working Squad</span>
                  </div>
                  <span className="text-[11px] text-teal-700">Auto-selects squad members</span>
                </div>
                <Select
                  value={selectedSquadId}
                  onChange={(e) => handleSelectSquad(e.target.value)}
                  className="bg-white text-xs border-teal-200"
                >
                  <option value="">Choose a Working Squad to auto-assign...</option>
                  {workingTeams.map((squad) => (
                    <option key={squad._id} value={squad._id}>
                      {squad.name} ({squad.members.length} members &bull; {squad.department || 'General'})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Teammates Selection Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold text-slate-800">
                  Select Teammates ({selectedMembers.length} selected)
                </Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMembers(assignableUsers.map((u) => u._id))}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">&bull;</span>
                  <button
                    type="button"
                    onClick={() => setSelectedMembers([])}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Employee search */}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Filter employees by name or role..."
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* Teammates List */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200/90 bg-white p-1 space-y-1">
                {modalFilteredUsers.map((u) => {
                  const checked = selectedMembers.includes(u._id);
                  return (
                    <div
                      key={u._id}
                      onClick={() =>
                        setSelectedMembers((prev) =>
                          checked ? prev.filter((id) => id !== u._id) : [...prev, u._id]
                        )
                      }
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-lg p-2 transition text-xs select-none',
                        checked
                          ? 'bg-teal-50/70 border border-teal-200/80 text-teal-900'
                          : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={u.name}
                          avatar={u.avatar}
                          className="h-7 w-7 rounded-full text-xs"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 leading-tight">{u.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {u.email || u.department || 'Employee'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600">
                          {u.role}
                        </span>
                        <div
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-md border transition',
                            checked
                              ? 'border-teal-600 bg-teal-600 text-white'
                              : 'border-slate-300 bg-white'
                          )}
                        >
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {modalFilteredUsers.length === 0 && (
                  <p className="p-4 text-center text-xs text-slate-400">
                    No matching employees found.
                  </p>
                )}
              </div>
            </div>

            {/* Workflow Task Automation Toggle & Settings */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-3">
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Create Tasks on Jira Workflow Board
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Automatically assigns each member an active task under this project.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={createTasks}
                  onChange={(e) => setCreateTasks(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
              </label>

              {createTasks && (
                <div className="space-y-3 border-t border-slate-200/80 pt-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Task Title</Label>
                    <Input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g. Execute campaign deliverables"
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Priority Level</Label>
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      {[
                        { id: 'low', label: 'Low', color: 'border-slate-300 text-slate-700' },
                        { id: 'medium', label: 'Medium', color: 'border-blue-300 text-blue-700' },
                        { id: 'high', label: 'High', color: 'border-amber-300 text-amber-700' },
                        { id: 'urgent', label: 'Urgent', color: 'border-rose-300 text-rose-700' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPriority(p.id as any)}
                          className={cn(
                            'rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition text-center',
                            priority === p.id
                              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          REDESIGNED MODAL 2: Create Project (Centered Pop-up Dialog)
          ========================================================================= */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Project"
        variant="dialog"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              disabled={!form.name.trim() || create.isPending}
              onClick={() => create.mutate()}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs"
            >
              {create.isPending ? 'Creating...' : 'Create & Assign Team'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div>
            <Label className="text-xs font-semibold">Project Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Q4 Brand Revamp Campaign"
              className="mt-1 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Client (Optional)</Label>
              <Select
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="mt-1 text-xs"
              >
                <option value="">Internal Project</option>
                {(clients || []).map((c: { _id: string; company: string }) => (
                  <option key={c._id} value={c._id}>
                    {c.company}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Budget (INR)</Label>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="50000"
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Target Delivery Date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Initial Status</Label>
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              className="mt-1 text-xs"
            >
              <option value="active">Active</option>
              <option value="planned">Planned</option>
              <option value="on_hold">On hold</option>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">Project Scope &amp; Brief</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Outline deliverables, client requirements, and milestones..."
              className="mt-1 text-xs"
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          REDESIGNED MODAL 3: Edit Project (Centered Pop-up Dialog)
          ========================================================================= */}
      <Modal
        open={!!editProject}
        onClose={() => setEditProject(null)}
        title="Edit Project Details"
        variant="dialog"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setEditProject(null)} className="text-xs">
              Cancel
            </Button>
            <Button
              disabled={!editForm.name.trim() || update.isPending}
              onClick={() => update.mutate()}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs"
            >
              {update.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div>
            <Label className="text-xs font-semibold">Project Name *</Label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="mt-1 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Client</Label>
              <Select
                value={editForm.client}
                onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
                className="mt-1 text-xs"
              >
                <option value="">Internal</option>
                {(clients || []).map((c: { _id: string; company: string }) => (
                  <option key={c._id} value={c._id}>
                    {c.company}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Budget (INR)</Label>
              <Input
                type="number"
                value={editForm.budget}
                onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Status</Label>
              <Select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                className="mt-1 text-xs"
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Progress ({editForm.progress}%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={editForm.progress}
                onChange={(e) =>
                  setEditForm({ ...editForm, progress: Math.min(100, Math.max(0, Number(e.target.value))) })
                }
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Start Date</Label>
              <Input
                type="date"
                value={editForm.startDate}
                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">End Date</Label>
              <Input
                type="date"
                value={editForm.endDate}
                onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Description</Label>
            <Textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="mt-1 text-xs"
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Project"
        variant="dialog"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="text-xs">
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget._id)}
              className="text-xs"
            >
              {remove.isPending ? 'Deleting...' : 'Delete permanently'}
            </Button>
          </div>
        }
      >
        <p className="text-xs text-slate-600">
          Are you sure you want to delete <strong className="text-slate-900">{deleteTarget?.name}</strong>?
          This will permanently remove the project and its configurations.
        </p>
      </Modal>

      {/* Project & Workflow Files / Content Modal */}
      <ProjectFilesModal
        projectId={filesProject?._id || null}
        projectName={filesProject?.name}
        onClose={() => setFilesProject(null)}
        canManage={canCreate || canAssign}
      />
    </div>
  );
}
