import { useState } from 'react';
import {
  X,
  Users,
  Search,
  Mail,
  Shield,
  Briefcase,
  Building,
  UserPlus,
  MessageSquare,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { Conversation, Colleague } from '../types';

interface DetailsPanelProps {
  conversation?: Conversation;
  colleagues: Colleague[];
  currentUserId?: string;
  currentUserRole?: string;
  onClose: () => void;
  onStartDirect: (userId: string) => void;
  onAddMembers?: (memberIds: string[]) => void;
  initialTab?: 'details' | 'directory';
}

export function DetailsPanel({
  conversation,
  colleagues,
  currentUserId,
  currentUserRole,
  onClose,
  onStartDirect,
  initialTab = 'details',
}: DetailsPanelProps) {
  const [tab, setTab] = useState<'details' | 'directory'>(
    conversation ? initialTab : 'directory'
  );
  const [search, setSearch] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);

  const isGroup = conversation?.type === 'group';
  const peer = isGroup
    ? null
    : conversation?.members.find((m) => m._id !== currentUserId) || conversation?.members[0];

  // Full peer colleague profile if available
  const peerProfile = peer
    ? colleagues.find((c) => c._id === peer._id)
    : null;

  // Filter colleagues for directory
  const filteredColleagues = colleagues.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.department || '').toLowerCase().includes(q) ||
      (c.designation || '').toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q)
    );
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-[#E4E7EC] bg-white sm:w-[280px] lg:w-[300px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E4E7EC] px-4 py-3">
        {/* Tab switchers */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
          {conversation && (
            <button
              type="button"
              onClick={() => setTab('details')}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition',
                tab === 'details'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Details
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('directory')}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition',
              tab === 'directory'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Team ({colleagues.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          title="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body content based on active tab */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'details' && conversation ? (
          isGroup ? (
            /* Group Conversation Details */
            <div className="p-4 space-y-5">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 border border-teal-200/60 text-[#0D9488] shadow-xs">
                  <Users className="h-7 w-7" />
                </div>
                <h3 className="mt-2.5 text-sm font-bold text-[#182230]">
                  {conversation.name}
                </h3>
                <span className="mt-0.5 inline-block text-[11px] text-[#667085]">
                  Group Channel · {conversation.members.length} members
                </span>
              </div>

              {/* Members List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Channel Members ({conversation.members.length})</span>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
                  {conversation.members.map((member) => {
                    const isSelf = member._id === currentUserId;
                    return (
                      <div
                        key={member._id}
                        className="flex items-center justify-between gap-2.5 p-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={member.name}
                            avatar={member.avatar}
                            className="h-7 w-7 rounded-lg text-[10px]"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-slate-800">
                              {member.name} {isSelf && <span className="text-slate-400">(You)</span>}
                            </p>
                            <p className="truncate text-[10.5px] text-slate-500 capitalize">
                              {member.role || 'Member'}
                            </p>
                          </div>
                        </div>

                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => onStartDirect(member._id)}
                            className="rounded p-1 text-slate-400 hover:bg-white hover:text-[#0D9488] transition"
                            title={`Send direct message to ${member.name}`}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Direct Chat Colleague Profile */
            <div className="p-4 space-y-4">
              <div className="text-center">
                <UserAvatar
                  name={peer?.name}
                  avatar={peerProfile?.avatar || peer?.avatar}
                  className="mx-auto h-16 w-16 rounded-2xl text-base shadow-xs"
                />
                <h3 className="mt-2.5 text-sm font-bold text-[#182230]">
                  {peer?.name}
                </h3>
                {peer?.role && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-teal-800 border border-teal-200/60">
                    <Shield className="h-2.5 w-2.5 text-teal-600" />
                    {peer.role}
                  </span>
                )}
              </div>

              {/* Information Cards */}
              <div className="space-y-2 text-xs">
                {peer?.email && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        Email
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(peer.email || '')}
                        className="text-slate-400 hover:text-slate-600"
                        title="Copy email"
                      >
                        {copiedEmail ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1 truncate font-medium text-slate-800">
                      {peer.email}
                    </p>
                  </div>
                )}

                {peerProfile?.department && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <Building className="h-3.5 w-3.5 text-slate-400" />
                      Department
                    </span>
                    <p className="mt-1 font-medium text-slate-800 capitalize">
                      {peerProfile.department}
                    </p>
                  </div>
                )}

                {peerProfile?.designation && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                      Designation
                    </span>
                    <p className="mt-1 font-medium text-slate-800">
                      {peerProfile.designation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          /* Team Directory Tab */
          <div className="flex flex-col h-full">
            {/* Search */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search team members…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 pl-7 pr-3 text-xs text-[#182230] placeholder-slate-400 focus:border-[#0D9488] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Colleagues List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredColleagues.length > 0 ? (
                filteredColleagues.map((c) => (
                  <div
                    key={c._id}
                    className="flex items-center justify-between gap-2.5 p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={c.name}
                        avatar={c.avatar}
                        className="h-8 w-8 rounded-lg text-xs"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {c.name}
                        </p>
                        <p className="truncate text-[10.5px] text-slate-500 capitalize">
                          {c.role} {c.department ? `· ${c.department}` : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onStartDirect(c._id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 transition"
                      title={`Message ${c.name}`}
                    >
                      <MessageSquare className="h-3 w-3 text-[#0D9488]" />
                      <span>Chat</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  No teammates match &quot;{search}&quot;.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
