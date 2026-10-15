import { useState } from 'react';
import { Users, X, Search, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { Colleague } from '../types';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  colleagues: Colleague[];
  onCreate: (name: string, memberIds: string[]) => void;
  isPending: boolean;
}

export function CreateGroupModal({
  open,
  onClose,
  colleagues,
  onCreate,
  isPending,
}: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const filteredColleagues = colleagues.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.department || '').toLowerCase().includes(q)
    );
  });

  const selectedColleagues = colleagues.filter((c) => selectedIds.includes(c._id));

  const toggleMember = (id: string) => {
    setError('');
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRemoveChip = (id: string) => {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const handleSubmit = () => {
    if (name.trim().length < 2) {
      setError('Group name must be at least 2 characters.');
      return;
    }
    if (selectedIds.length < 1) {
      setError('Please select at least 1 other team member.');
      return;
    }
    setError('');
    onCreate(name.trim(), selectedIds);
  };

  const handleClose = () => {
    setName('');
    setSelectedIds([]);
    setSearch('');
    setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Group Conversation"
      description="Create a shared channel for projects, departments, or cross-functional discussions."
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            {selectedIds.length} member{selectedIds.length === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || name.trim().length < 2 || selectedIds.length < 1}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white"
            >
              {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>Create Channel</span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Error alert */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Group Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Group Name <span className="text-red-500">*</span>
          </label>
          <div className="relative mt-1">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Creative Production, Finance Ops, Q4 Marketing…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-[#0D9488] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
            />
          </div>
        </div>

        {/* Selected Members Chips */}
        {selectedColleagues.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Selected Members ({selectedColleagues.length})
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
              {selectedColleagues.map((member) => (
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
                  <button
                    type="button"
                    onClick={() => handleRemoveChip(member._id)}
                    className="rounded-full text-teal-700 hover:bg-teal-200/60 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Member Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Add Team Members <span className="text-red-500">*</span>
          </label>

          <div className="mt-1 relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search colleagues by name or role…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-[#0D9488] focus:outline-none"
            />
          </div>

          <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
            {filteredColleagues.length > 0 ? (
              filteredColleagues.map((colleague) => {
                const isSelected = selectedIds.includes(colleague._id);
                return (
                  <button
                    key={colleague._id}
                    type="button"
                    onClick={() => toggleMember(colleague._id)}
                    className="flex w-full items-center justify-between gap-2.5 p-2.5 text-left transition hover:bg-white"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={colleague.name}
                        avatar={colleague.avatar}
                        className="h-7 w-7 rounded-lg text-xs"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {colleague.name}
                        </p>
                        <p className="truncate text-[10.5px] text-slate-500 capitalize">
                          {colleague.role} {colleague.department ? `· ${colleague.department}` : ''}
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
                No colleagues match &quot;{search}&quot;.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
