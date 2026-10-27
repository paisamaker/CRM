import { useQuery } from '@tanstack/react-query';
import { Phone, Hash } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/stores/auth';
import { UserAvatar } from '@/components/ui/UserAvatar';

type Profile = AuthUser & {
  phone?: string;
  designation?: string;
  employeeId?: string;
  joiningDate?: string;
  department?: string;
  status?: string;
};

function toTitleCase(str?: string) {
  if (!str) return '';
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function ProfileSection() {
  const storeUser = useAuthStore((s) => s.user);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data.data.user as Profile;
    },
  });

  const user = profile || (storeUser as Profile | null);
  if (isLoading && !user) {
    return (
      <div className="h-full min-h-[220px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
    );
  }
  if (!user) return null;

  const empId = user.employeeId || '—';
  const designation = toTitleCase(user.designation) || 'Team Member';
  const name = toTitleCase(user.name);
  const role = user.role === 'ceo' ? 'EXECUTIVE' : user.role?.toUpperCase() || 'EMPLOYEE';
  const contact = user.phone?.trim() || 'Not set';

  return (
    <div className="h-full flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs transition-all">
      {/* Top Header: Company Logo & Role Badge */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-1 border border-slate-200 shadow-2xs">
            <img
              src="/images/starmedia_logo.webp"
              alt="Star Media Logo"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight text-slate-900">STAR MEDIA</h3>
            <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
              Identity Card
            </p>
          </div>
        </div>

        <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700 border border-teal-200/80">
          {role}
        </span>
      </div>

      {/* Middle: Profile Picture + Name & Designation */}
      <div className="my-4 flex items-center gap-4">
        <div className="relative shrink-0">
          <UserAvatar
            name={user.name}
            avatar={user.avatar}
            className="h-20 w-20 rounded-2xl text-2xl font-bold ring-2 ring-slate-100 shadow-xs border border-slate-200 object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-slate-900">{name}</h2>
          <p className="truncate text-xs font-semibold text-teal-700 mt-0.5">{designation}</p>
          {user.email && (
            <p className="truncate text-xs text-slate-500 mt-0.5">{user.email}</p>
          )}
        </div>
      </div>

      {/* Bottom ID Details: ID Number & Contact Number */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Hash className="h-3 w-3 text-slate-400" />
            <span>ID Number</span>
          </div>
          <div className="mt-1 font-mono text-xs font-bold text-slate-800">{empId}</div>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Phone className="h-3 w-3 text-slate-400" />
            <span>Contact Number</span>
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-800 truncate">{contact}</div>
        </div>
      </div>
    </div>
  );
}
