import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, TableShell, Skeleton } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label, Select } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/auth';
import { formatDate, cn } from '@/lib/utils';
import { Users, User, Eye, EyeOff, KeyRound, Link2, RefreshCw, Check } from 'lucide-react';
import { WorkingTeamsList } from '@/features/teams/components/WorkingTeamsList';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { EmployeeProfileDrawer } from '@/features/attendance/components/EmployeeProfileDrawer';

type UserRow = {
  _id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  employeeId?: string;
  designation?: string;
  phone?: string;
  joiningDate?: string;
};

type AccessMode = 'password' | 'invite';

const emptyForm = {
  email: '',
  role: 'employee',
  name: '',
  department: 'General',
  phone: '',
  designation: '',
  employeeId: '',
  joiningDate: '',
  manager: '',
  password: '',
  confirmPassword: '',
};

const COMPANY_EMAIL_DOMAIN = 'starmediainfluencer.com';

/** "Sahil Bhagat" / "Sahilbhagat" → sahilbhagat@starmediainfluencer.com */
function emailFromName(name: string) {
  const local = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 64);
  if (!local) return '';
  return `${local}@${COMPANY_EMAIL_DOMAIN}`;
}

function generateLoginPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = pick(upper);
  for (let i = 0; i < 5; i++) out += pick(lower + digits);
  out += pick(digits);
  return out;
}

function passwordOk(password: string) {
  return password.length >= 6 && /[A-Z]/.test(password);
}

export function UsersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const currentUser = useAuthStore((s) => s.user);
  const can = useAuthStore((s) => s.can);
  const qc = useQueryClient();
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [accessMode, setAccessMode] = useState<AccessMode>('password');
  const [showPassword, setShowPassword] = useState(false);
  /** When false, email stays synced from full name */
  const [emailManual, setEmailManual] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    phone: '',
    designation: '',
    department: '',
    status: 'active',
    employeeId: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [passwordResult, setPasswordResult] = useState<{
    name: string;
    email: string;
    tempPassword: string;
  } | null>(null);
  const [setPasswordTarget, setSetPasswordTarget] = useState<UserRow | null>(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
  const [activeTab, setActiveTab] = useState<'employees' | 'teams'>('employees');

  const canDelete = role === 'ceo' || can('users', 'delete');
  const canResetPassword = role === 'ceo' || can('users', 'manage');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users', { params: { limit: 100 } })).data.data,
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (accessMode === 'password') {
        if (!passwordOk(form.password)) {
          toast.error('Password must be at least 6 characters with one capital letter');
          throw new Error('WEAK_PASSWORD');
        }
        if (form.password !== form.confirmPassword) {
          toast.error('Passwords do not match');
          throw new Error('PASSWORD_MISMATCH');
        }
      }
      return api.post('/auth/invite', {
        email: form.email.trim(),
        role: form.role,
        name: form.name.trim() || undefined,
        department: form.department || undefined,
        phone: form.phone.trim() || undefined,
        designation: form.designation || undefined,
        joiningDate: form.joiningDate || undefined,
        manager: form.manager || undefined,
        employeeId: form.employeeId || undefined,
        ...(accessMode === 'password' ? { password: form.password } : {}),
      });
    },
    onSuccess: (res) => {
      const d = res.data.data;
      setOpen(false);
      setForm(emptyForm);
      setAccessMode('password');
      setShowPassword(false);
      setEmailManual(false);
      qc.invalidateQueries({ queryKey: ['users'] });
      if (d.loginPassword) {
        toast.success('Employee created — can log in now');
        setPasswordResult({
          name: d.user?.name || form.name || 'Employee',
          email: d.user?.email || form.email,
          tempPassword: d.loginPassword,
        });
      } else {
        toast.success('Invite created');
        if (d.inviteLink) toast.message(d.inviteLink);
      }
    },
    onError: (e) => {
      const msg = getErrorMessage(e);
      if (msg === 'WEAK_PASSWORD' || msg === 'PASSWORD_MISMATCH') return;
      toast.error(msg);
    },
  });

  const canSubmitInvite = useMemo(() => {
    if (!form.name.trim() || !form.email.trim() || !form.email.includes('@')) return false;
    if (accessMode === 'invite') return true;
    return passwordOk(form.password) && form.password === form.confirmPassword;
  }, [form.name, form.email, form.password, form.confirmPassword, accessMode]);

  const saveEdit = useMutation({
    mutationFn: async () => api.patch(`/users/${editId}`, edit),
    onSuccess: () => {
      toast.success('Employee updated');
      setEditId(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const resetPassword = useMutation({
    mutationFn: async (id: string) => api.post(`/users/${id}/reset-password`),
    onSuccess: (res) => {
      const d = res.data.data;
      setPasswordResult({
        name: d.name,
        email: d.email,
        tempPassword: d.tempPassword,
      });
      toast.success(d.status === 'active' ? 'Temp password ready — user can log in' : 'Temporary password generated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const setPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/set-password`, { password, activate: true }),
    onSuccess: (res) => {
      toast.success(res.data.data.message || 'Password set — employee can log in');
      setSetPasswordTarget(null);
      setPasswordForm({ password: '', confirm: '' });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deactivateUser = useMutation({
    mutationFn: async (id: string) => api.post(`/users/${id}/deactivate`),
    onSuccess: () => {
      toast.success('User deactivated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteUser = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) =>
      api.delete(`/users/${id}`, {
        data: { permanent: true, confirmEmail: email },
      }),
    onSuccess: () => {
      toast.success('User permanently deleted');
      setDeleteTarget(null);
      setConfirmEmail('');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => {
      toast.success('User reactivated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const managers = (data?.items || []).filter(
    (u: UserRow) => ['ceo', 'manager'].includes(u.role) && u.status === 'active'
  );

  function canManageTarget(u: UserRow) {
    if (u._id === currentUser?.id) return false;
    return role === 'ceo';
  }

  return (
    <div>
      <PageHeader
        title={activeTab === 'employees' ? 'Employees' : 'Project Working Teams'}
        description={
          activeTab === 'employees'
            ? 'Add teammates, assign roles, and manage employment details'
            : 'Assemble cross-functional teams of employees and assign them directly to projects'
        }
        actions={
          activeTab === 'employees' ? (
            <Button onClick={() => setOpen(true)} className="bg-[#0D9488] hover:bg-[#0B7D72] text-white">
              Add employees
            </Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1 w-fit shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
            activeTab === 'employees'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <User className="h-3.5 w-3.5 text-teal-600" />
          <span>Employees ({(data?.items || []).length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('teams')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
            activeTab === 'teams'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Users className="h-3.5 w-3.5 text-teal-600" />
          <span>Project Working Teams</span>
        </button>
      </div>

      {activeTab === 'employees' ? (
        <TableShell>
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>ID</th>
              <th>Role</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading &&
              (data?.items || []).map((u: UserRow) => {
              const manageable = canManageTarget(u);
              return (
                <tr
                  key={u._id}
                  onClick={() => setProfileEmployeeId(u._id)}
                  className="cursor-pointer transition-colors hover:bg-teal-50/40 group"
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.name} className="h-9 w-9 rounded-full text-xs shadow-2xs shrink-0" />
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-teal-700 transition flex items-center gap-1.5">
                          <span>{u.name}</span>
                          <span className="text-[10px] text-teal-600 font-normal opacity-0 group-hover:opacity-100 transition">
                            &bull; View Analytics &rarr;
                          </span>
                        </div>
                        <div className="text-xs text-[var(--fg-secondary)]">{u.email}</div>
                        {u.phone ? <div className="text-xs text-[var(--fg-secondary)]">{u.phone}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td>{u.employeeId || '—'}</td>
                  <td className="capitalize">{u.role}</td>
                  <td>{u.department}</td>
                  <td>{u.designation || '—'}</td>
                  <td>{formatDate(u.joiningDate)}</td>
                  <td>
                    <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProfileEmployeeId(u._id);
                        }}
                        className="border-teal-200 text-teal-800 hover:bg-teal-50"
                      >
                        Analytics
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditId(u._id);
                          setEdit({
                            phone: u.phone || '',
                            designation: u.designation || '',
                            department: u.department || '',
                            status: u.status === 'disabled' ? 'disabled' : 'active',
                            employeeId: u.employeeId || '',
                          });
                        }}
                      >
                        Edit
                      </Button>
                      {canResetPassword && manageable && u.status !== 'disabled' ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSetPasswordTarget(u);
                              setPasswordForm({ password: '', confirm: '' });
                            }}
                          >
                            Set password
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resetPassword.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  `Generate a temporary password for ${u.name}? Invited users will be activated so they can log in.`
                                )
                              ) {
                                resetPassword.mutate(u._id);
                              }
                            }}
                          >
                            Reset password
                          </Button>
                        </>
                      ) : null}
                      {canDelete && manageable && u.status !== 'disabled' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deactivateUser.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Deactivate ${u.name}? They can be reactivated later.`)) {
                              deactivateUser.mutate(u._id);
                            }
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : null}
                      {canDelete && manageable && u.status === 'disabled' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reactivate.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            reactivate.mutate(u._id);
                          }}
                        >
                          Reactivate
                        </Button>
                      ) : null}
                      {canDelete && manageable ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(u);
                            setConfirmEmail('');
                          }}
                        >
                          Delete permanently
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>
      ) : (
        <WorkingTeamsList canManage={role === 'ceo' || role === 'manager'} />
      )}

      <Modal
        open={open}
        onClose={() => {
          if (invite.isPending) return;
          setOpen(false);
          setForm(emptyForm);
          setAccessMode('password');
          setShowPassword(false);
          setEmailManual(false);
        }}
        title="Add employee"
        description="Create a teammate account with role, profile details, and login access."
        variant="dialog"
        size="md"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--fg-secondary)]">
              {accessMode === 'password'
                ? 'They can sign in immediately with the password you set.'
                : 'They must open the invite link to choose a password.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={invite.isPending}
                onClick={() => {
                  setOpen(false);
                  setForm(emptyForm);
                  setAccessMode('password');
                  setShowPassword(false);
                  setEmailManual(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => invite.mutate()}
                disabled={!canSubmitInvite || invite.isPending}
                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[8.5rem]"
              >
                {invite.isPending ? 'Saving…' : accessMode === 'password' ? 'Create & enable login' : 'Send invite'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Full name *</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    email: emailManual ? f.email : emailFromName(name),
                  }));
                }}
                placeholder="e.g. Sahil Bhagat"
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <Label>Work email *</Label>
                {!emailManual && form.email ? (
                  <span className="text-[11px] font-medium text-teal-700">Auto from name</span>
                ) : null}
              </div>
              <Input
                value={form.email}
                onChange={(e) => {
                  setEmailManual(true);
                  setForm({ ...form, email: e.target.value.trim().toLowerCase() });
                }}
                placeholder={`name@${COMPANY_EMAIL_DOMAIN}`}
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Login ID is created from the name (spaces removed). Edit only if you need a custom address.
              </p>
            </div>
            <div>
              <Label>Employee ID</Label>
              <Input
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                placeholder="Auto if empty"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {role === 'ceo' ? <option value="ceo">CEO</option> : null}
                {role === 'ceo' ? <option value="manager">Manager</option> : null}
                <option value="finance">Finance</option>
                <option value="employee">Employee</option>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div>
              <Label>Designation</Label>
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="e.g. Content Lead"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 …"
              />
            </div>
            <div>
              <Label>Joining date</Label>
              <Input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Reporting manager</Label>
              <Select value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })}>
                <option value="">None</option>
                {managers.map((m: { _id: string; name: string }) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <KeyRound className="h-4 w-4 text-teal-600" />
              Login access
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1 shadow-xs border border-slate-200/80">
              <button
                type="button"
                onClick={() => setAccessMode('password')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition',
                  accessMode === 'password'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Set password
              </button>
              <button
                type="button"
                onClick={() => setAccessMode('invite')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition',
                  accessMode === 'invite'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <Link2 className="h-3.5 w-3.5" />
                Invite link
              </button>
            </div>

            {accessMode === 'password' ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Label>Password *</Label>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
                      onClick={() => {
                        const next = generateLoginPassword();
                        setForm((f) => ({ ...f, password: next, confirmPassword: next }));
                        setShowPassword(true);
                        toast.message('Password generated — copy it before closing');
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Generate
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Min 6 chars, 1 capital letter"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Confirm password *</Label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                  />
                </div>
                <ul className="space-y-1 text-[11px] text-slate-500">
                  <li className="flex items-center gap-1.5">
                    <Check
                      className={cn(
                        'h-3 w-3',
                        form.password.length >= 6 ? 'text-teal-600' : 'text-slate-300'
                      )}
                    />
                    At least 6 characters
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check
                      className={cn(
                        'h-3 w-3',
                        /[A-Z]/.test(form.password) ? 'text-teal-600' : 'text-slate-300'
                      )}
                    />
                    One capital letter
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check
                      className={cn(
                        'h-3 w-3',
                        form.password && form.password === form.confirmPassword
                          ? 'text-teal-600'
                          : 'text-slate-300'
                      )}
                    />
                    Passwords match
                  </li>
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                We’ll create an invited account and show an accept-invite link. The employee chooses their own
                password when they open it (expires in 48 hours).
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editId}
        onClose={() => setEditId(null)}
        title="Edit employee"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditId(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveEdit.mutate()}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Employee ID</Label>
            <Input value={edit.employeeId} onChange={(e) => setEdit({ ...edit, employeeId: e.target.value })} />
          </div>
          <div>
            <Label>Department</Label>
            <Input value={edit.department} onChange={(e) => setEdit({ ...edit, department: e.target.value })} />
          </div>
          <div>
            <Label>Designation</Label>
            <Input value={edit.designation} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setConfirmEmail('');
        }}
        title="Permanently delete user"
        size="sm"
        className="[&_h2]:text-[var(--danger)]"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setConfirmEmail('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={
                !deleteTarget ||
                deleteUser.isPending ||
                confirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()
              }
              onClick={() =>
                deleteTarget && deleteUser.mutate({ id: deleteTarget._id, email: confirmEmail.trim() })
              }
            >
              Delete permanently
            </Button>
          </>
        }
      >
        {deleteTarget ? (
          <>
            <p className="text-sm text-[var(--fg-secondary)]">
              This will permanently remove{' '}
              <span className="font-medium text-[var(--fg)]">{deleteTarget.name}</span> and free their email for
              re-invite. This cannot be undone.
            </p>
            <div className="mt-4">
              <Label>Type their email to confirm</Label>
              <Input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={deleteTarget.email}
                autoComplete="off"
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!passwordResult}
        onClose={() => setPasswordResult(null)}
        title="Login password ready"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                if (!passwordResult) return;
                try {
                  await navigator.clipboard.writeText(
                    `Email: ${passwordResult.email}\nPassword: ${passwordResult.tempPassword}`
                  );
                  toast.success('Email & password copied');
                } catch {
                  toast.error('Could not copy');
                }
              }}
            >
              Copy credentials
            </Button>
            <Button onClick={() => setPasswordResult(null)}>Done</Button>
          </>
        }
      >
        {passwordResult ? (
          <>
            <p className="text-sm text-[var(--fg-secondary)]">
              Share this once with <span className="font-medium text-[var(--fg)]">{passwordResult.name}</span>. They can
              log in now. This password is not shown again after you close.
            </p>
            <div className="mt-4 space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-teal-800/70">Email</div>
                <div className="text-sm font-medium text-slate-800">{passwordResult.email}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-teal-800/70">Password</div>
                <div className="font-mono text-sm font-semibold tracking-wide text-slate-900">
                  {passwordResult.tempPassword}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!setPasswordTarget}
        onClose={() => setSetPasswordTarget(null)}
        title="Set login password"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setSetPasswordTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                setPassword.isPending ||
                passwordForm.password.length < 6 ||
                !/[A-Z]/.test(passwordForm.password) ||
                passwordForm.password !== passwordForm.confirm
              }
              onClick={() => {
                if (!setPasswordTarget) return;
                if (passwordForm.password !== passwordForm.confirm) {
                  toast.error('Passwords do not match');
                  return;
                }
                setPassword.mutate({ id: setPasswordTarget._id, password: passwordForm.password });
              }}
            >
              Save & enable login
            </Button>
          </>
        }
      >
        {setPasswordTarget ? (
          <>
            <p className="text-sm text-[var(--fg-secondary)]">
              Choose a password for{' '}
              <span className="font-medium text-[var(--fg)]">{setPasswordTarget.name}</span> (
              {setPasswordTarget.email}). Invited accounts will be activated so they can log in immediately.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>New password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                  placeholder="Min 6 characters, 1 capital letter"
                />
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                />
              </div>
              <p className="text-xs text-[var(--fg-secondary)]">
                Example: <span className="font-mono">Sahil1</span> — at least 6 characters with one capital letter
              </p>
            </div>
          </>
        ) : null}
      </Modal>

      <EmployeeProfileDrawer
        employeeId={profileEmployeeId}
        onClose={() => setProfileEmployeeId(null)}
        canManage={role === 'ceo' || role === 'manager'}
      />
    </div>
  );
}
