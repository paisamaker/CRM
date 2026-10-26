import { useMemo, useState } from 'react';
import {
  X,
  Users,
  Search,
  Mail,
  Shield,
  Building,
  MessageSquare,
  Copy,
  Check,
  LogOut,
  Image as ImageIcon,
  FileText,
  Download,
  Phone,
  Video,
  MoreHorizontal,
  Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api, getErrorMessage } from '@/lib/api';
import { formatFileSize, resolveChatMediaUrl } from '../chatUtils';
import type { Conversation, Colleague, Message, ChatAttachment } from '../types';

type PanelTab = 'details' | 'directory' | 'media' | 'files' | 'members';

interface DetailsPanelProps {
  conversation?: Conversation;
  colleagues: Colleague[];
  messages?: Message[];
  currentUserId?: string;
  currentUserRole?: string;
  peerOnline?: boolean;
  onClose: () => void;
  onStartDirect: (userId: string) => void;
  onAddMembers?: (memberIds: string[]) => void;
  onConversationUpdated?: () => void;
  onPreviewImage?: (url: string, name: string) => void;
  initialTab?: PanelTab;
}

function extBadge(name?: string, mime?: string) {
  const n = (name || '').toLowerCase();
  const m = mime || '';
  if (m.includes('pdf') || n.endsWith('.pdf')) return { label: 'PDF', color: 'bg-rose-500' };
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx'))
    return { label: 'DOC', color: 'bg-sky-600' };
  if (n.endsWith('.zip') || n.endsWith('.rar')) return { label: 'ZIP', color: 'bg-amber-500' };
  if (m.includes('sheet') || n.endsWith('.xls') || n.endsWith('.xlsx'))
    return { label: 'XLS', color: 'bg-emerald-600' };
  return { label: 'FILE', color: 'bg-slate-500' };
}

export function DetailsPanel({
  conversation,
  colleagues,
  messages = [],
  currentUserId,
  peerOnline,
  onClose,
  onStartDirect,
  onConversationUpdated,
  onPreviewImage,
  initialTab = 'details',
}: DetailsPanelProps) {
  const [tab, setTab] = useState<PanelTab>(conversation ? initialTab : 'directory');
  const [search, setSearch] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);

  const isGroup = conversation?.type === 'group';
  const peer = isGroup
    ? null
    : conversation?.members.find((m) => m._id !== currentUserId) || conversation?.members[0];
  const peerProfile = peer ? colleagues.find((c) => c._id === peer._id) : null;

  const mediaItems = useMemo(() => {
    const items: Array<ChatAttachment & { messageId: string }> = [];
    for (const m of messages) {
      if (m.deletedForEveryone) continue;
      for (const a of m.attachments || []) {
        if (a.mime?.startsWith('image/') || a.mime?.startsWith('video/')) {
          items.push({ ...a, messageId: m._id });
        }
      }
    }
    return items;
  }, [messages]);

  const fileItems = useMemo(() => {
    const items: Array<ChatAttachment & { messageId: string; createdAt?: string }> = [];
    for (const m of messages) {
      if (m.deletedForEveryone) continue;
      for (const a of m.attachments || []) {
        if (
          !a.mime?.startsWith('image/') &&
          !a.mime?.startsWith('video/') &&
          !a.mime?.startsWith('audio/')
        ) {
          items.push({ ...a, messageId: m._id, createdAt: m.createdAt });
        }
      }
    }
    return items;
  }, [messages]);

  const filteredColleagues = colleagues.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.department || '').toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q)
    );
  });

  const tabs: Array<{ key: PanelTab; label: string; show: boolean }> = [
    { key: 'details', label: 'Details', show: !!conversation },
    { key: 'media', label: 'Media', show: !!conversation },
    { key: 'files', label: 'Files', show: !!conversation },
    {
      key: isGroup ? 'members' : 'directory',
      label: isGroup ? `Members (${conversation?.members.length || 0})` : `Team (${colleagues.length})`,
      show: true,
    },
  ];

  const localTime = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date());

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-slate-200 bg-white sm:w-[310px] lg:w-[325px]">
      {/* Tab Navigation with Bottom Active Line */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3">
        <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'py-3.5 text-xs font-semibold transition relative whitespace-nowrap',
                  tab === t.key
                    ? 'text-teal-700'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00a389] rounded-full" />
                )}
              </button>
            ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tab === 'details' && conversation && !isGroup && peer && (
          <div>
            {/* Profile Avatar & Info */}
            <div className="text-center">
              <div className="relative mx-auto w-fit">
                <UserAvatar
                  name={peer.name}
                  avatar={peer.avatar}
                  className="h-20 w-20 rounded-full text-2xl font-bold shadow-sm ring-2 ring-white"
                />
                {peerOnline && (
                  <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                )}
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900">{peer.name}</h3>
              {(peerProfile?.designation || peer.role) && (
                <p className="text-xs font-medium capitalize text-slate-500 mt-0.5">
                  {peerProfile?.designation || peer.role}
                </p>
              )}
              {peer.email && (
                <p className="text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-1">
                  <span>E</span>
                  <span>{peer.email}</span>
                </p>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-teal-200 bg-teal-50/50 py-2.5 text-[11px] font-semibold text-teal-700 shadow-2xs hover:bg-teal-50 transition"
              >
                <MessageSquare className="h-4 w-4 text-[#00a389]" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => toast.info('Starting voice call...')}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                <Phone className="h-4 w-4 text-slate-600" />
                Call
              </button>
              <button
                type="button"
                onClick={() => toast.info('Starting video call...')}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                <Video className="h-4 w-4 text-slate-600" />
                Video
              </button>
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                <MoreHorizontal className="h-4 w-4 text-slate-600" />
                More
              </button>
            </div>

            {/* About / Department Section */}
            <div className="mt-5 space-y-3">
              {peerProfile?.department && (
                <div>
                  <p className="text-xs font-bold text-slate-900">Department</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed capitalize">
                    {peerProfile.department}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-[11px] font-medium text-slate-400">Role</span>
                  <p className="font-semibold text-slate-800 mt-0.5 capitalize">{peer.role || 'Member'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-medium text-slate-400">Status</span>
                  <p className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full inline-block',
                        peerOnline ? 'bg-emerald-500' : 'bg-slate-400'
                      )}
                    />
                    {peerOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>

              <div className="text-xs pt-1">
                <span className="text-[11px] font-medium text-slate-400">Local Time</span>
                <p className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <span>🕒</span>
                  <span>{localTime}</span>
                </p>
              </div>
            </div>

            {/* Shared Media & Files */}
            <SharedBlocks
              mediaItems={mediaItems}
              fileItems={fileItems}
              onPreviewImage={onPreviewImage}
              onSeeAllMedia={() => setTab('media')}
              onSeeAllFiles={() => setTab('files')}
            />
          </div>
        )}

        {tab === 'details' && conversation && isGroup && (
          <div className="space-y-4 p-4">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <Users className="h-7 w-7" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{conversation.name}</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Group · {conversation.members.length} members
              </p>
            </div>
            {conversation.description && (
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
                {conversation.description}
              </p>
            )}
            <SharedBlocks
              mediaItems={mediaItems}
              fileItems={fileItems}
              onPreviewImage={onPreviewImage}
              onSeeAllMedia={() => setTab('media')}
              onSeeAllFiles={() => setTab('files')}
            />
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              onClick={() => {
                if (!window.confirm('Leave this group?')) return;
                void api
                  .patch(`/chat/conversations/${conversation._id}/members`, { leave: true })
                  .then(() => {
                    toast.success('You left the group');
                    onConversationUpdated?.();
                    onClose();
                  })
                  .catch((e) => toast.error(getErrorMessage(e)));
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Leave group
            </button>
          </div>
        )}

        {tab === 'media' && conversation && (
          <div className="p-3">
            {mediaItems.length === 0 ? (
              <EmptyMedia />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {mediaItems.map((item) => {
                  const src = resolveChatMediaUrl(item.url);
                  return (
                    <button
                      key={`${item.messageId}-${item.url}`}
                      type="button"
                      className="aspect-square overflow-hidden rounded-lg bg-slate-100"
                      onClick={() => onPreviewImage?.(src, item.name)}
                    >
                      {item.mime?.startsWith('video/') ? (
                        <video src={src} className="h-full w-full object-cover" muted />
                      ) : (
                        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'files' && conversation && (
          <div className="p-3">
            {fileItems.length === 0 ? (
              <ChatFileList items={[]} />
            ) : (
              <ChatFileList items={fileItems} />
            )}
          </div>
        )}

        {(tab === 'members' || tab === 'directory') && (
          <div className="flex h-full flex-col">
            {tab === 'members' && conversation?.type === 'group' ? (
              <div className="divide-y divide-slate-100">
                {conversation.members.map((member) => {
                  const isSelf = member._id === currentUserId;
                  const adminIds = (conversation.admins || []).map((a) =>
                    typeof a === 'string' ? a : a._id
                  );
                  const isAdmin = adminIds.includes(member._id);
                  return (
                    <div key={member._id} className="flex items-center justify-between gap-2 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <UserAvatar
                          name={member.name}
                          avatar={member.avatar}
                          className="h-9 w-9 rounded-full text-xs"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {member.name}
                            {isSelf ? ' (You)' : ''}
                          </p>
                          <p className="truncate text-[10px] capitalize text-slate-500">
                            {isAdmin ? 'Admin' : member.role || 'Member'}
                          </p>
                        </div>
                      </div>
                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => onStartDirect(member._id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-teal-50 hover:text-teal-700"
                          aria-label={`Message ${member.name}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search team members…"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs focus:border-teal-400 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredColleagues.map((c) => (
                    <div
                      key={c._id}
                      className="flex items-center justify-between gap-2 border-b border-slate-50 px-3 py-3 hover:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <UserAvatar name={c.name} avatar={c.avatar} className="h-9 w-9 rounded-full text-xs" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">{c.name}</p>
                          <p className="truncate text-[10px] capitalize text-slate-500">
                            {c.role}
                            {c.department ? ` · ${c.department}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onStartDirect(c._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
                      >
                        <MessageSquare className="h-3 w-3 text-teal-600" />
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function EmptyMedia() {
  return (
    <div className="px-3 py-10 text-center">
      <ImageIcon className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-xs font-semibold text-slate-600">No media yet</p>
      <p className="mt-1 text-[11px] text-slate-400">Photos and videos shared here will appear here.</p>
    </div>
  );
}

function SharedBlocks({
  mediaItems,
  fileItems,
  onPreviewImage,
  onSeeAllMedia,
  onSeeAllFiles,
}: {
  mediaItems: Array<ChatAttachment & { messageId: string }>;
  fileItems: Array<ChatAttachment & { messageId: string; createdAt?: string }>;
  onPreviewImage?: (url: string, name: string) => void;
  onSeeAllMedia: () => void;
  onSeeAllFiles: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      {/* Shared Media */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>🖼️</span>
            <span>Shared Media ({mediaItems.length})</span>
          </p>
          {mediaItems.length > 4 && (
            <button
              type="button"
              onClick={onSeeAllMedia}
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              View all
            </button>
          )}
        </div>

        {mediaItems.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-2">No media shared yet</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {mediaItems.slice(0, 4).map((item, idx) => {
              const src = resolveChatMediaUrl(item.url);
              const isLast = idx === 3 && mediaItems.length > 4;
              return (
                <button
                  key={`${item.messageId}-${item.url}`}
                  type="button"
                  onClick={() => (isLast ? onSeeAllMedia() : onPreviewImage?.(src, item.name))}
                  className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-2xs hover:opacity-90 transition"
                >
                  {item.mime?.startsWith('video/') ? (
                    <video src={src} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={src} alt={item.name || 'Media'} className="h-full w-full object-cover" />
                  )}
                  {isLast && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-white">
                      +{mediaItems.length - 3}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Shared Files */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>📄</span>
            <span>Shared Files ({fileItems.length})</span>
          </p>
          {fileItems.length > 3 && (
            <button
              type="button"
              onClick={onSeeAllFiles}
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              View all
            </button>
          )}
        </div>

        {fileItems.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-2">No files shared yet</p>
        ) : (
          <ul className="space-y-1.5">
            {fileItems.slice(0, 3).map((item) => {
              const src = resolveChatMediaUrl(item.url);
              const badge = extBadge(item.name, item.mime);
              return (
                <li key={`${item.messageId}-${item.name}`}>
                  <a
                    href={src ? `${src}${src.includes('?') ? '&' : '?'}download=1` : '#'}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2 transition hover:bg-slate-50"
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white shadow-2xs',
                        badge.color
                      )}
                    >
                      {badge.label}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-slate-400">{formatFileSize(item.size)}</p>
                    </div>
                    <Download className="h-4 w-4 text-slate-400" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChatFileList({
  items,
}: {
  items: Array<ChatAttachment & { messageId: string; createdAt?: string }>;
}) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-10 text-center">
        <FileText className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-xs font-semibold text-slate-600">No files yet</p>
        <p className="mt-1 text-[11px] text-slate-400">Documents and archives shared here will appear here.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const src = resolveChatMediaUrl(item.url);
        const badge = extBadge(item.name, item.mime);
        return (
          <li key={`${item.messageId}-${item.name}`}>
            <a
              href={src ? `${src}${src.includes('?') ? '&' : '?'}download=1` : '#'}
              className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2 transition hover:bg-slate-50"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white',
                  badge.color
                )}
              >
                {badge.label}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">{item.name}</p>
                <p className="text-[10px] text-slate-400">{formatFileSize(item.size)}</p>
              </div>
              <Download className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
