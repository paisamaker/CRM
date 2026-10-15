import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users,
  Briefcase,
  Crown,
  Search,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  Sparkles,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { CreateTeamModal } from './CreateTeamModal';
import type { WorkingTeam } from '../types';

interface WorkingTeamsListProps {
  canManage?: boolean;
}

export function WorkingTeamsList({ canManage = true }: WorkingTeamsListProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<WorkingTeam | null>(null);

  // Fetch all working teams
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['working-teams'],
    queryFn: async () => (await api.get('/teams')).data.data as WorkingTeam[],
  });

  // Delete team mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/teams/${id}`)).data,
    onSuccess: () => {
      toast.success('Team deleted successfully');
      qc.invalidateQueries({ queryKey: ['working-teams'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleDelete = (team: WorkingTeam) => {
    if (window.confirm(`Are you sure you want to delete "${team.name}"?`)) {
      deleteMutation.mutate(team._id);
    }
  };

  // Filter teams
  const filteredTeams = useMemo(() => {
    let list = [...teams];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.project?.name || '').toLowerCase().includes(q) ||
          (t.lead?.name || '').toLowerCase().includes(q) ||
          t.members.some((m) => m.name.toLowerCase().includes(q))
      );
    }
    if (departmentFilter) {
      list = list.filter((t) => (t.department || '').toLowerCase() === departmentFilter.toLowerCase());
    }
    return list;
  }, [teams, search, departmentFilter]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    teams.forEach((t) => {
      if (t.department) set.add(t.department);
    });
    return Array.from(set);
  }, [teams]);

  // Stats
  const activeTeamsCount = teams.filter((t) => t.status === 'active').length;
  const assignedToProjectsCount = teams.filter((t) => !!t.project).length;
  const totalEmployeesInTeams = useMemo(() => {
    const memberSet = new Set<string>();
    teams.forEach((t) => t.members.forEach((m) => memberSet.add(m._id)));
    return memberSet.size;
  }, [teams]);

  return (
    <div className="space-y-5">
      {/* Overview Metric Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Working Teams</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{activeTeamsCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Active squads in organization</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Assigned to Projects</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-teal-800">{assignedToProjectsCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Currently driving project deliverables</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Employees in Teams</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <FolderKanban className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalEmployeesInTeams}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Assigned to active cross-functional squads</p>
        </div>
      </div>

      {/* Filter and Action Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search working teams or projects…"
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Department Filter */}
          {departments.length > 0 && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingTeam(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0B7D72] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Working Team</span>
          </button>
        )}
      </div>

      {/* Teams Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200/60 shadow-2xs">
            <Users className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900 tracking-tight">
            {search ? 'No matching working teams found' : 'No Working Teams Created Yet'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {search
              ? 'Try adjusting your search criteria or clearing department filters.'
              : 'Create cross-functional working teams of employees and assign them directly to projects.'}
          </p>

          {canManage && !search && (
            <button
              type="button"
              onClick={() => {
                setEditingTeam(null);
                setModalOpen(true);
              }}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0B7D72] transition"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Working Team</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTeams.map((t) => {
            const hasProject = !!t.project;

            return (
              <div
                key={t._id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:border-slate-300 transition"
              >
                <div>
                  {/* Card Header: Name, Department, Action Menu */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900 tracking-tight">
                          {t.name}
                        </h4>
                        {t.department && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {t.department}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Assigned Project Card Box */}
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                        <Briefcase className="h-3 w-3 text-teal-600" />
                        Assigned Project
                      </span>
                      {hasProject ? (
                        <Badge tone={statusTone(t.project!.status)} className="text-[9.5px]">
                          {t.project!.status}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-semibold">
                          Unassigned
                        </span>
                      )}
                    </div>

                    {hasProject ? (
                      <div className="mt-1.5">
                        <Link
                          to="/projects"
                          className="font-bold text-slate-900 hover:text-teal-700 flex items-center gap-1 group text-xs truncate"
                        >
                          <span className="truncate">{t.project!.name}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition shrink-0" />
                        </Link>
                        {/* Progress Bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-teal-600 rounded-full"
                              style={{ width: `${t.project!.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-700">
                            {t.project!.progress}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          Not assigned to any project yet
                        </span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTeam(t);
                              setModalOpen(true);
                            }}
                            className="text-[11px] font-bold text-teal-700 hover:underline"
                          >
                            + Assign Project
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Team Lead */}
                  {t.lead && (
                    <div className="mt-3.5 flex items-center gap-2 text-xs">
                      <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-slate-400 text-[11px]">Lead:</span>
                      <UserAvatar
                        name={t.lead.name}
                        avatar={t.lead.avatar}
                        className="h-5 w-5 rounded-md text-[9px]"
                      />
                      <span className="font-semibold text-slate-800 truncate">
                        {t.lead.name}
                      </span>
                    </div>
                  )}

                  {/* Member Roster Avatars & Chips */}
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                      <span className="font-semibold text-slate-600">
                        Team Members ({t.members.length})
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {t.members.map((m) => (
                        <span
                          key={m._id}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-800"
                        >
                          <UserAvatar
                            name={m.name}
                            avatar={m.avatar}
                            className="h-3.5 w-3.5 rounded-full text-[8px]"
                          />
                          <span className="truncate max-w-[120px]">{m.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                {canManage && (
                  <div className="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTeam(t);
                        setModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-teal-700"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit Squad</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Working Team Modal */}
      <CreateTeamModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTeam(null);
        }}
        team={editingTeam}
      />
    </div>
  );
}
