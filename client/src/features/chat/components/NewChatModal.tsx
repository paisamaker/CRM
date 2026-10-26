import { useState } from 'react';
import { Search, Users, X, MessageSquare, Loader2, Sparkles, Building2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import type { Colleague } from '../types';

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  colleagues: Colleague[];
  onStartDirect: (userId: string) => void;
  onOpenNewGroup?: () => void;
  onlineIds?: Set<string>;
  isPending?: boolean;
}

export function NewChatModal({
  open,
  onClose,
  colleagues,
  onStartDirect,
  onOpenNewGroup,
  onlineIds,
  isPending,
}: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = colleagues.filter((c) => {
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

  const handleSelect = (userId: string) => {
    setSelectedId(userId);
    onStartDirect(userId);
    onClose();
  };

  const handleClose = () => {
    setSearch('');
    setSelectedId(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Conversation"
      description="Select any employee from the team database to start messaging directly."
      size="md"
    >
      <div className="space-y-3">
        {/* Search & Actions Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, department or email…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:bg-white focus:outline-none"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {onOpenNewGroup && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                handleClose();
                onOpenNewGroup();
              }}
              className="shrink-0 gap-1.5 text-xs font-semibold text-teal-700 border-teal-200 hover:bg-teal-50"
            >
              <Users className="h-3.5 w-3.5" />
              <span>New Group</span>
            </Button>
          )}
        </div>

        {/* Directory Count */}
        <div className="flex items-center justify-between px-1 text-[11px] font-medium text-slate-400">
          <span>{filtered.length} team member{filtered.length === 1 ? '' : 's'} available</span>
          <span>Click to start chat</span>
        </div>

        {/* Employee List */}
        <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-xs font-semibold text-slate-700">No employees found</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Try searching for a different name, email, or department.
              </p>
            </div>
          ) : (
            filtered.map((c) => {
              const isOnline = !!(onlineIds?.has(c._id));
              const isCurrentSelected = selectedId === c._id && isPending;
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => handleSelect(c._id)}
                  disabled={isPending}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-teal-50/60 focus:bg-teal-50/60 focus:outline-none"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <UserAvatar
                        name={c.name}
                        avatar={c.avatar}
                        className="h-10 w-10 rounded-full text-xs"
                      />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-slate-900">
                          {c.name}
                        </span>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                          {c.designation || c.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        {c.department && (
                          <span className="truncate capitalize text-slate-600">
                            {c.department}
                          </span>
                        )}
                        {c.department && c.email && <span className="text-slate-300">•</span>}
                        {c.email && (
                          <span className="truncate text-slate-400">{c.email}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isCurrentSelected ? (
                      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    ) : (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 opacity-80 group-hover:opacity-100 hover:bg-teal-100 transition">
                        <MessageSquare className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
