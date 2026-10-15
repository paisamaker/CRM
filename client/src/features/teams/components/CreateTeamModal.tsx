import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users,
  Search,
  Check,
  X,
  Briefcase,
  AlertCircle,
  Loader2,
  Crown,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { WorkingTeam, TeamMember, TeamProject } from '../types';

interface CreateTeamModalProps {
  open: boolean;
  onClose: () => void;
  team?: WorkingTeam | null;
  onSuccess?: () => void;
}

export function CreateTeamModal({
  open,
  onClose,
  team,
  onSuccess,
}: CreateTeamModalProps) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [leadId, setLeadId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchMember, setSearchMember] = useState('');
  const [error, setError] = useState('');

  // Fetch employees
  const { data: usersData } = useQuery({
    queryKey: ['users-list-active'],
    queryFn: async () => (await api.get('/users', { params: { limit: 100, status: 'active' } })).data.data,
    enabled: open,
  });

  // Fetch active projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects-list-active'],
    queryFn: async () => (await api.get('/projects', { params: { limit: 100 } })).data.data,
    enabled: open,
  });

  const allEmployees: TeamMember[] = usersData?.items || [];
  const allProjects: TeamProject[] = projectsData?.items || [];

  // Populate fields when editing an existing team
  useEffect(() => {
    if (team) {
      setName(team.name || '');
      setDescription(team.description || '');
      setDepartment(team.department || '');
      setLeadId(team.lead?._id || '');
      setProjectId(team.project?._id || '');
      setSelectedMemberIds((team.members || []).map((m) => m._id));
    } else {
      setName('');
      setDescription('');
      setDepartment('');
      setLeadId('');
      setProjectId('');
      setSelectedMemberIds([]);
    }
    setError('');
  }, [team, open]);

  // Filter employees for member search
  const filteredEmployees = allEmployees.filter((emp) => {
    if (!searchMember.trim()) return true;
    const q = searchMember.trim().toLowerCase();
    return (
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q) ||
      (emp.designation || '').toLowerCase().includes(q)
    );
  });

  const selectedEmployees = allEmployees.filter((emp) =>
    selectedMemberIds.includes(emp._id)
  );

  const toggleMember = (id: string) => {
    setError('');
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const removeMember = (id: string) => {
    setSelectedMemberIds((prev) => prev.filter((item) => item !== id));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        name: name.trim(),
        description: description.trim() || undefined,
        department: department.trim() || undefined,
        lead: leadId || undefined,
        projectId: projectId || null,
        memberIds: selectedMemberIds,
      };

      if (team) {
        return (await api.patch(`/teams/${team._id}`, payload)).data.data;
      }
      return (await api.post('/teams', payload)).data.data;
    },
    onSuccess: (data) => {
      toast.success(
        team ? `Team "${data.name}" updated successfully` : `Working Team "${data.name}" created!`
      );
      qc.invalidateQueries({ queryKey: ['working-teams'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onSuccess?.();
      handleClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleClose = () => {
    setName('');
    setDescription('');
    setDepartment('');
    setLeadId('');
    setProjectId('');
    setSelectedMemberIds([]);
    setError('');
    onClose();
  };

  const handleSubmit = () => {
    if (name.trim().length < 2) {
      setError('Please provide a valid team name (at least 2 characters).');
      return;
    }
    if (selectedMemberIds.length === 0) {
      setError('Please select at least one employee member for this team.');
      return;
    }
    setError('');
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      variant="dialog"
      size="md"
      title={team ? `Edit Working Team — ${team.name}` : 'Create Project Working Team'}
      description="Assemble a squad of employees and assign them to an active project deliverable."
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            {selectedMemberIds.length} employee{selectedMemberIds.length === 1 ? '' : 's'} assigned
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending || name.trim().length < 2 || selectedMemberIds.length === 0}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white"
            >
              {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>{team ? 'Save Changes' : 'Create Working Team'}</span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Team Name & Department */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold">
              Team Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Design & Creative Squad, Dev Core"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold">Department</Label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Creative, Engineering, Operations"
              className="mt-1"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <Label className="text-xs font-semibold">Mission / Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief scope of responsibilities or sprint focus…"
            className="mt-1"
          />
        </div>

        {/* Team Lead & Assigned Project */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Team Lead */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Crown className="h-3 w-3 text-amber-500" />
              <span>Team Leader (Optional)</span>
            </Label>
            <select
              value={leadId}
              onChange={(e) => {
                const newLead = e.target.value;
                setLeadId(newLead);
                if (newLead && !selectedMemberIds.includes(newLead)) {
                  setSelectedMemberIds((prev) => [...prev, newLead]);
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0D9488] focus:outline-none"
            >
              <option value="">Select Team Lead…</option>
              {allEmployees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.role} {emp.designation ? `· ${emp.designation}` : ''})
                </option>
              ))}
            </select>
          </div>

          {/* Assigned Project */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Briefcase className="h-3 w-3 text-teal-600" />
              <span>Assigned Project</span>
            </Label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0D9488] focus:outline-none"
            >
              <option value="">None (Unassigned / General Ops)</option>
              {allProjects.map((proj) => (
                <option key={proj._id} value={proj._id}>
                  {proj.name} ({proj.status} · {proj.progress}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Member Chips */}
        {selectedEmployees.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Team Roster ({selectedEmployees.length} members)
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/70 p-2">
              {selectedEmployees.map((member) => (
                <span
                  key={member._id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 py-1 pl-1.5 pr-2 text-xs font-medium text-teal-900"
                >
                  <UserAvatar
                    name={member.name}
                    avatar={member.avatar}
                    className="h-4 w-4 rounded-full text-[9px]"
                  />
                  <span>{member.name}</span>
                  {member._id === leadId && (
                    <Crown className="h-2.5 w-2.5 text-amber-600" aria-label="Team Lead" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMember(member._id)}
                    className="rounded-full text-teal-700 hover:bg-teal-200/60 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Member Selector Search & Checkboxes */}
        <div>
          <Label className="text-xs font-semibold">
            Add Employees to Team <span className="text-red-500">*</span>
          </Label>

          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchMember}
              onChange={(e) => setSearchMember(e.target.value)}
              placeholder="Search employee by name, designation, or department…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0D9488] focus:outline-none"
            />
          </div>

          <div className="mt-2 max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((emp) => {
                const isSelected = selectedMemberIds.includes(emp._id);
                const isLead = emp._id === leadId;

                return (
                  <button
                    key={emp._id}
                    type="button"
                    onClick={() => toggleMember(emp._id)}
                    className="flex w-full items-center justify-between gap-2.5 p-2.5 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={emp.name}
                        avatar={emp.avatar}
                        className="h-7 w-7 rounded-lg text-xs"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {emp.name}
                          </p>
                          {isLead && (
                            <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] font-bold text-amber-700 border border-amber-200">
                              Lead
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10.5px] text-slate-500 capitalize">
                          {emp.role} {emp.department ? `· ${emp.department}` : ''}{' '}
                          {emp.designation ? `(${emp.designation})` : ''}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        isSelected
                          ? 'border-[#0D9488] bg-[#0D9488] text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">
                No employees match &quot;{searchMember}&quot;.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
