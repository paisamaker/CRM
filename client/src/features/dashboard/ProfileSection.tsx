import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Loader2,
  Pencil,
  X,
  ShieldCheck,
  CheckCircle2,
  Building,
  Briefcase,
  User,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Sparkles,
  Settings,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/stores/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Label } from '@/components/ui/Input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatDate } from '@/lib/utils';

type Profile = AuthUser & {
  phone?: string;
  designation?: string;
  employeeId?: string;
  joiningDate?: string;
  department?: string;
  status?: string;
};

type FormState = {
  name: string;
  phone: string;
  designation: string;
  department: string;
  avatarUrl?: string;
};

export function ProfileSection() {
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const storeUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [form, setForm] = useState<FormState>({
    name: '',
    phone: '',
    designation: '',
    department: '',
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data.data.user as Profile;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      phone: profile.phone || '',
      designation: profile.designation || '',
      department: profile.department || '',
    });
  }, [profile]);

  function syncSession(user: Profile) {
    if (!accessToken) return;
    setSession(accessToken, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
      mfaEnabled: user.mfaEnabled,
      phone: user.phone,
      designation: user.designation,
      employeeId: user.employeeId,
    });
  }

  const save = useMutation({
    mutationFn: async (payload: FormState) =>
      (
        await api.patch('/auth/profile', {
          name: payload.name.trim(),
          phone: payload.phone.trim(),
          designation: payload.designation.trim(),
          department: payload.department.trim() || undefined,
          avatar: payload.avatarUrl !== undefined ? payload.avatarUrl : undefined,
        })
      ).data.data.user as Profile,
    onSuccess: (user) => {
      toast.success('Profile updated successfully');
      syncSession(user);
      qc.setQueryData(['my-profile'], user);
      qc.invalidateQueries({ queryKey: ['settings'] });
      setEditing(false);
      setShowUrlModal(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      // Backend supports /auth/profile/avatar and /auth/avatar
      const res = await api.post('/auth/profile/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data.user as Profile;
    },
    onSuccess: (user) => {
      toast.success('Profile photo uploaded to Cloudinary');
      syncSession(user);
      qc.setQueryData(['my-profile'], user);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const removeAvatar = useMutation({
    mutationFn: async () => (await api.delete('/auth/profile/avatar')).data.data.user as Profile,
    onSuccess: (user) => {
      toast.success('Profile photo removed');
      syncSession(user);
      qc.setQueryData(['my-profile'], user);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const user = profile || (storeUser as Profile | null);
  if (isLoading && !user) {
    return (
      <div className="mb-6 h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    );
  }
  if (!user) return null;

  const roleLabel =
    user.role === 'ceo'
      ? 'Executive Director (CEO)'
      : user.role === 'manager'
      ? 'Project & Operations Manager'
      : user.role === 'finance'
      ? 'Finance & Accounts Specialist'
      : 'Creative & Tech Associate';

  const roleBadgeTone =
    user.role === 'ceo'
      ? 'bg-purple-50 text-purple-700 border-purple-200/60'
      : user.role === 'manager'
      ? 'bg-amber-50 text-amber-700 border-amber-200/60'
      : user.role === 'finance'
      ? 'bg-teal-50 text-teal-700 border-teal-200/60'
      : 'bg-blue-50 text-blue-700 border-blue-200/60';

  const fallbackDesignation =
    user.designation ||
    (user.role === 'ceo'
      ? 'Executive Director'
      : user.role === 'manager'
      ? 'Operations Manager'
      : user.role === 'finance'
      ? 'Financial Controller'
      : 'Team Member');

  const fallbackDepartment =
    user.department ||
    (user.role === 'ceo'
      ? 'Executive Suite'
      : user.role === 'finance'
      ? 'Finance & Accounts'
      : 'Production & Creative');

  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xs transition-all duration-200">
      {/* Compact Profile Strip */}
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-3.5">
          {/* Avatar with Camera Action */}
          <div className="relative shrink-0 group">
            <UserAvatar
              name={user.name}
              avatar={user.avatar}
              className="h-14 w-14 rounded-2xl text-lg font-bold ring-2 ring-slate-100 shadow-sm"
            />

            {/* Quick Upload Button */}
            <button
              type="button"
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300"
              title="Upload new profile picture"
              disabled={uploadAvatar.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadAvatar.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin text-teal-600" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
            </button>

            {/* Hidden file input for photo upload */}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  toast.error('Image file must be under 5MB');
                  return;
                }
                uploadAvatar.mutate(file);
              }}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-slate-900">{user.name}</h2>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${roleBadgeTone}`}>
                {roleLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </div>

        {/* Profile Metadata Chips & Edit Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="hidden items-center gap-2 lg:flex">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-600">
              <span className="text-slate-400">Designation: </span>
              <span className="font-semibold text-slate-800">{fallbackDesignation}</span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-600">
              <span className="text-slate-400">Department: </span>
              <span className="font-semibold text-slate-800">{fallbackDepartment}</span>
            </div>
            {user.employeeId && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-600">
                <span className="text-slate-400">ID: </span>
                <span className="font-semibold text-slate-800">{user.employeeId}</span>
              </div>
            )}
          </div>

          {/* Remove photo button if avatar present */}
          {user.avatar ? (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-slate-200"
              disabled={removeAvatar.isPending}
              onClick={() => removeAvatar.mutate()}
              title="Remove profile photo"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove photo
            </Button>
          ) : null}

          {/* Edit Profile Toggle Button */}
          <Button
            size="sm"
            variant={editing ? 'outline' : 'teal'}
            className="text-xs h-8 gap-1.5 font-semibold shadow-2xs"
            onClick={() => {
              if (editing) {
                setForm({
                  name: user.name || '',
                  phone: user.phone || '',
                  designation: user.designation || '',
                  department: user.department || '',
                });
              }
              setEditing(!editing);
            }}
          >
            <Pencil className="h-3 w-3" />
            <span>{editing ? 'Close' : 'Edit Profile'}</span>
          </Button>

          {/* Link to Full Settings */}
          <Link to="/settings">
            <Button size="sm" variant="outline" className="text-xs h-8" title="Account settings & security">
              <Settings className="h-3 w-3 text-slate-500" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Expandable Edit Drawer */}
      {editing && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-5">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Update Profile &amp; Contact Details
              </h4>
              <p className="text-[11px] text-slate-500">
                Changes will reflect across your workspace, task boards, and chat.
              </p>
            </div>

            {/* Photo Action Buttons inside edit drawer */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadAvatar.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 transition"
              >
                <Camera className="h-3.5 w-3.5 text-teal-600" />
                <span>Upload Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUrlModal(!showUrlModal)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 transition"
              >
                <LinkIcon className="h-3.5 w-3.5 text-teal-600" />
                <span>Image URL</span>
              </button>
            </div>
          </div>

          {/* Optional Direct URL Input */}
          {showUrlModal && (
            <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/40 p-3 flex flex-col sm:flex-row gap-2 items-end sm:items-center">
              <div className="flex-1 w-full">
                <Label htmlFor="custom-avatar-url" className="text-xs font-bold text-teal-900">
                  Paste Cloudinary or Web Image URL
                </Label>
                <Input
                  id="custom-avatar-url"
                  placeholder="https://res.cloudinary.com/.../image.jpg"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  className="mt-1 bg-white text-xs"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="teal"
                disabled={!customAvatarUrl.trim() || save.isPending}
                onClick={() => {
                  if (customAvatarUrl.trim()) {
                    save.mutate({
                      ...form,
                      avatarUrl: customAvatarUrl.trim(),
                    });
                  }
                }}
                className="text-xs h-9 shrink-0"
              >
                Save Photo URL
              </Button>
            </div>
          )}

          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) {
                toast.error('Name is required');
                return;
              }
              save.mutate(form);
            }}
          >
            <div>
              <Label htmlFor="profile-name" required className="text-xs font-semibold text-slate-700">
                Full name
              </Label>
              <Input
                id="profile-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 bg-white text-xs"
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <Label htmlFor="profile-phone" className="text-xs font-semibold text-slate-700">
                Phone Number
              </Label>
              <Input
                id="profile-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210"
                className="mt-1 bg-white text-xs"
              />
            </div>

            <div>
              <Label htmlFor="profile-designation" className="text-xs font-semibold text-slate-700">
                Designation / Job Role
              </Label>
              <Input
                id="profile-designation"
                value={form.designation}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                placeholder="e.g. Lead Video Editor, Fullstack Dev, Manager"
                className="mt-1 bg-white text-xs"
              />
            </div>

            <div>
              <Label htmlFor="profile-department" className="text-xs font-semibold text-slate-700">
                Department
              </Label>
              <Input
                id="profile-department"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Creative Production, Engineering, Operations"
                className="mt-1 bg-white text-xs"
              />
            </div>

            <div className="sm:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-500">
                Account role ({user.role}) and primary email ({user.email}) are managed by executive administrators.
              </span>
              <div className="flex gap-2 self-end sm:self-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" variant="teal" disabled={save.isPending} className="text-xs font-bold">
                  {save.isPending ? 'Saving profile…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
