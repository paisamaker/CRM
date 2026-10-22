import { useState } from 'react';
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
import { Users, User } from 'lucide-react';
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
};

export function UsersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const currentUser = useAuthStore((s) => s.user);
  const can = useAuthStore((s) => s.can);
  const qc = useQueryClient();
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
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
    mutationFn: async () =>
      api.post('/auth/invite', {
        ...form,
        joiningDate: form.joiningDate || undefined,
        manager: form.manager || undefined,
        employeeId: form.employeeId || undefined,
      }),
    onSuccess: (res) => {
      toast.success('Invite created');
      if (res.data.data.inviteLink) toast.message(res.data.data.inviteLink);
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

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
        onClose={() => setOpen(false)}
        title="Add employee"
        variant="dialog"
        size="sm"
        footer={
          <Button onClick={() => invite.mutate()} disabled={!form.email}>
            Add employee
          </Button>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@starmediainfluencer.com" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Employee ID</Label>
            <Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="Auto if empty" />
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
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div>
            <Label>Designation</Label>
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Joining date</Label>
            <Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          </div>
          <div>
            <Label>Manager</Label>
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
        title="Temporary password"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                if (!passwordResult) return;
                try {
                  await navigator.clipboard.writeText(passwordResult.tempPassword);
                  toast.success('Copied to clipboard');
                } catch {
                  toast.error('Could not copy');
                }
              }}
            >
              Copy password
            </Button>
            <Button onClick={() => setPasswordResult(null)}>Done</Button>
          </>
        }
      >
        {passwordResult ? (
          <>
            <p className="text-sm text-[var(--fg-secondary)]">
              Share this once with <span className="font-medium text-[var(--fg)]">{passwordResult.name}</span>. They can
              log in with this password. It is not stored in plaintext after you close this dialog.
            </p>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-xs text-[var(--fg-secondary)]">{passwordResult.email}</div>
              <div className="mt-1 font-mono text-sm font-semibold tracking-wide">{passwordResult.tempPassword}</div>
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
