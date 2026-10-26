import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { ConversationSidebar } from './components/ConversationSidebar';
import { ChatHeader } from './components/ChatHeader';
import { MessageTimeline } from './components/MessageTimeline';
import { MessageComposer } from './components/MessageComposer';
import { DetailsPanel } from './components/DetailsPanel';
import { CreateGroupModal } from './components/CreateGroupModal';
import { NewChatModal } from './components/NewChatModal';
import { ChatEmptyState } from './components/ChatEmptyState';
import type { Colleague, Conversation, ConversationFilter, Message, PendingAttachment } from './types';
import './chat.css';

export function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c') || '';

  const [detailsOpen, setDetailsOpen] = useState(true);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listFilter, setListFilter] = useState<ConversationFilter>('all');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingMap, setTypingMap] = useState<Record<string, string[]>>({});
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<Message[]>([]);
  const notifAsked = useRef(false);

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
  } = useQuery({
    queryKey: ['chat-conversations', listFilter],
    queryFn: async () =>
      (
        await api.get('/chat/conversations', {
          params: { filter: listFilter === 'all' ? undefined : listFilter },
        })
      ).data.data as Conversation[],
  });

  // Automatically select first conversation if none selected
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setParams({ c: conversations[0]._id }, { replace: true });
    }
  }, [activeId, conversations, setParams]);

  const { data: colleagues = [] } = useQuery({
    queryKey: ['chat-colleagues'],
    queryFn: async () => (await api.get('/chat/colleagues')).data.data as Colleague[],
  });

  const {
    data: messages = [],
    refetch: refetchMessages,
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: ['chat-messages', activeId],
    queryFn: async () => {
      const res = await api.get(`/chat/conversations/${activeId}/messages`, { params: { limit: 40 } });
      setHasMore(!!res.data.meta?.hasMore);
      return res.data.data as Message[];
    },
    enabled: !!activeId,
  });

  const activeConversation = useMemo(
    () => conversations.find((c) => c._id === activeId),
    [conversations, activeId]
  );

  const peerId = useMemo(() => {
    if (!activeConversation || activeConversation.type !== 'direct') return null;
    return activeConversation.members.find((m) => m._id !== user?.id)?._id || null;
  }, [activeConversation, user?.id]);

  const typingUsers = typingMap[activeId] || [];
  const typingLabel =
    typingUsers.length === 0
      ? undefined
      : typingUsers.length === 1
        ? 'typing…'
        : 'several people typing…';

  // Presence + realtime
  useEffect(() => {
    const socket = connectSocket();

    const onMessage = (msg: Message & { conversation?: string }) => {
      const convId = String((msg as { conversation?: string }).conversation || '');
      if (convId === activeId) {
        qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) => {
          if (!old) return [msg];
          if (old.some((m) => m._id === msg._id || (msg.clientId && m.clientId === msg.clientId))) {
            return old.map((m) =>
              m.clientId && msg.clientId && m.clientId === msg.clientId ? { ...msg, status: 'sent' } : m
            );
          }
          return [...old, msg];
        });
        void api.post(`/chat/conversations/${activeId}/read`).catch(() => undefined);
      } else if (convId && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const muted = false;
        if (!muted && document.visibilityState !== 'visible') {
          const n = new Notification('New message', {
            body: (msg.body || 'Attachment').slice(0, 80),
            tag: convId,
          });
          n.onclick = () => {
            window.focus();
            setParams({ c: convId });
          };
        }
      }
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    };

    const onUpdate = (msg: Message) => {
      const convId = String((msg as { conversation?: string }).conversation || activeId);
      if (convId !== activeId) return;
      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
        (old || []).map((m) => (m._id === msg._id ? msg : m))
      );
    };

    const onDelete = (payload: { messageId: string; conversationId: string; scope: string }) => {
      if (payload.conversationId !== activeId) return;
      if (payload.scope === 'me') {
        qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
          (old || []).filter((m) => m._id !== payload.messageId)
        );
      } else {
        qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
          (old || []).map((m) =>
            m._id === payload.messageId
              ? { ...m, body: '', attachments: [], deletedForEveryone: true, tombstone: 'This message was deleted' }
              : m
          )
        );
      }
    };

    const onNotify = () => {
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    };

    const onTyping = (p: { conversationId: string; userId: string; typing: boolean }) => {
      if (p.userId === user?.id) return;
      setTypingMap((prev) => {
        const cur = new Set(prev[p.conversationId] || []);
        if (p.typing) cur.add(p.userId);
        else cur.delete(p.userId);
        return { ...prev, [p.conversationId]: [...cur] };
      });
    };

    const onPresence = (p: { userId: string; online: boolean }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(p.userId);
        else next.delete(p.userId);
        return next;
      });
    };

    const onRead = () => {
      void qc.invalidateQueries({ queryKey: ['chat-messages', activeId] });
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:message:update', onUpdate);
    socket.on('chat:message:delete', onDelete);
    socket.on('chat:notify', onNotify);
    socket.on('chat:typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('chat:read', onRead);

    socket.emit('presence:ping');
    void api.get('/chat/presence').then((res) => {
      setOnlineIds(new Set((res.data.data?.onlineIds || []) as string[]));
    }).catch(() => undefined);

    if (!notifAsked.current && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      notifAsked.current = true;
      void Notification.requestPermission();
    }

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:message:update', onUpdate);
      socket.off('chat:message:delete', onDelete);
      socket.off('chat:notify', onNotify);
      socket.off('chat:typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('chat:read', onRead);
    };
  }, [activeId, qc, setParams, user?.id]);

  useEffect(() => {
    if (!activeId) return;
    const socket = connectSocket();
    socket.emit('chat:join', activeId);
    setReplyTo(null);
    void api
      .post(`/chat/conversations/${activeId}/read`)
      .then(() => qc.invalidateQueries({ queryKey: ['chat-conversations'] }))
      .catch(() => undefined);
    return () => {
      socket.emit('chat:leave', activeId);
    };
  }, [activeId, qc]);

  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailsOpen]);

  const startDirectMutation = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post('/chat/conversations/direct', { userId })).data.data as Conversation,
    onSuccess: (c) => {
      setParams({ c: c._id });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      toast.success('Conversation opened');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const createGroupMutation = useMutation({
    mutationFn: async ({
      name,
      memberIds,
      description,
    }: {
      name: string;
      memberIds: string[];
      description?: string;
    }) =>
      (await api.post('/chat/conversations/group', { name, memberIds, description })).data
        .data as Conversation,
    onSuccess: (c) => {
      setGroupModalOpen(false);
      setParams({ c: c._id });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      toast.success(`Group "${c.name}" created`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const patchPrefs = useCallback(
    async (body: Record<string, unknown>) => {
      if (!activeId) return;
      await api.patch(`/chat/conversations/${activeId}/prefs`, body);
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
    [activeId, qc]
  );

  const sendMessage = async (payload: {
    body: string;
    attachments?: PendingAttachment[];
    replyTo?: string;
  }) => {
    if (!activeId) return;

    const clientId = crypto.randomUUID();
    const optimistic: Message = {
      _id: `temp-${clientId}`,
      clientId,
      body: payload.body,
      createdAt: new Date().toISOString(),
      sender: {
        _id: user?.id || '',
        name: user?.name || 'You',
        avatar: user?.avatar,
      },
      attachments: payload.attachments,
      replyTo: replyTo || undefined,
      status: 'pending',
      readBy: [user?.id || ''],
    };

    qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) => [
      ...(old || []),
      optimistic,
    ]);

    try {
      const res = await api.post(`/chat/conversations/${activeId}/messages`, {
        body: payload.body,
        clientId,
        replyTo: payload.replyTo,
        attachments: payload.attachments?.map(({ name, url, size, mime, publicId }) => ({
          name,
          url,
          size,
          mime,
          publicId,
        })),
      });
      const msg = res.data.data as Message;
      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) => {
        const without = (old || []).filter((m) => m.clientId !== clientId && m._id !== msg._id);
        return [...without, { ...msg, status: 'sent' }];
      });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    } catch (e) {
      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
        (old || []).map((m) => (m.clientId === clientId ? { ...m, status: 'failed' } : m))
      );
      toast.error(getErrorMessage(e));
    }
  };

  const uploadFile = async (file: File): Promise<PendingAttachment> => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(`/chat/conversations/${activeId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data as PendingAttachment;
  };

  const loadMore = async () => {
    if (!activeId || !messages.length || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0]?.createdAt;
      const res = await api.get(`/chat/conversations/${activeId}/messages`, {
        params: { limit: 40, before: oldest },
      });
      const older = res.data.data as Message[];
      setHasMore(!!res.data.meta?.hasMore);
      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) => {
        const ids = new Set((old || []).map((m) => m._id));
        return [...older.filter((m) => !ids.has(m._id)), ...(old || [])];
      });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['chat-conversations'] }),
      refetchMessages(),
    ]);
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const runSearch = async () => {
    if (!activeId || searchQ.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    try {
      const res = await api.get(`/chat/conversations/${activeId}/search`, { params: { q: searchQ } });
      setSearchHits(res.data.data as Message[]);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const detailsPanel = (
    <DetailsPanel
      conversation={activeConversation}
      colleagues={colleagues}
      messages={messages}
      currentUserId={user?.id}
      currentUserRole={user?.role}
      peerOnline={!!(peerId && onlineIds.has(peerId))}
      onClose={() => setDetailsOpen(false)}
      onStartDirect={(id) => {
        startDirectMutation.mutate(id);
        setDetailsOpen(false);
      }}
      onConversationUpdated={() => {
        void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
        setParams({});
      }}
      onPreviewImage={(url, name) => setPreview({ url, name })}
      initialTab={activeConversation ? 'details' : 'directory'}
    />
  );

  return (
    <div className="sm-chat h-full w-full">
      <div className="sm-chat-shell flex h-full w-full">
        <div className={`${activeId ? 'hidden md:flex' : 'flex w-full md:w-auto'} h-full shrink-0`}>
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => setParams({ c: id })}
            onNewGroup={() => setGroupModalOpen(true)}
            onOpenDirectory={() => setNewChatModalOpen(true)}
            currentUserId={user?.id}
            isLoading={isLoadingConversations}
            onlineIds={onlineIds}
            typingByConversation={typingMap}
            filter={listFilter}
            onFilterChange={setListFilter}
          />
        </div>

        <div
          className={`${!activeId ? 'hidden md:flex' : 'flex'} relative h-full min-w-0 flex-1 flex-col bg-white`}
        >
          {activeConversation ? (
            <>
              <ChatHeader
                conversation={activeConversation}
                currentUserId={user?.id}
                onBack={() => setParams({})}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((p) => !p)}
                peerOnline={!!(peerId && onlineIds.has(peerId))}
                typingLabel={typingLabel}
                onTogglePin={() => void patchPrefs({ pinned: !activeConversation.pinned })}
                onToggleMute={() => void patchPrefs({ muted: !activeConversation.muted })}
                onToggleArchive={() => void patchPrefs({ archived: !activeConversation.archived })}
                onHide={() => {
                  void patchPrefs({ hidden: true }).then(() => setParams({}));
                }}
                onSearchMessages={() => setSearchOpen((p) => !p)}
              />

              {searchOpen && (
                <div className="border-b border-slate-200 bg-slate-50/90 px-3 py-2 sm:px-4">
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <label className="sr-only" htmlFor="chat-msg-search">
                        Search messages
                      </label>
                      <input
                        id="chat-msg-search"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                        placeholder="Search in this conversation…"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void runSearch()}
                      className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchHits([]);
                        setSearchQ('');
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600"
                      aria-label="Close search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {searchHits.length > 0 && (
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200">
                      {searchHits.map((h) => (
                        <button
                          key={h._id}
                          type="button"
                          className="block w-full truncate border-b border-slate-50 px-3 py-2 text-left text-xs text-slate-600 last:border-0 hover:bg-teal-50 hover:text-teal-800"
                          onClick={() =>
                            document
                              .getElementById(`msg-${h._id}`)
                              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }
                        >
                          <span className="font-semibold">{h.sender?.name}: </span>
                          {h.body}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <MessageTimeline
                conversation={activeConversation}
                messages={messages}
                currentUserId={user?.id}
                onSendStarter={(text) => void sendMessage({ body: text })}
                isLoading={isLoadingMessages}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                typingUsers={typingUsers}
                onReply={setReplyTo}
                onReact={(id, emoji) => {
                  void api
                    .post(`/chat/messages/${id}/react`, { emoji })
                    .then((res) => {
                      const msg = res.data.data as Message;
                      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
                        (old || []).map((m) => (m._id === msg._id ? msg : m))
                      );
                    })
                    .catch((e) => toast.error(getErrorMessage(e)));
                }}
                onDelete={(id, scope) => {
                  void api
                    .post(`/chat/messages/${id}/delete`, { scope })
                    .then(() => {
                      if (scope === 'me') {
                        qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
                          (old || []).filter((m) => m._id !== id)
                        );
                      } else {
                        qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
                          (old || []).map((m) =>
                            m._id === id
                              ? {
                                  ...m,
                                  body: '',
                                  attachments: [],
                                  deletedForEveryone: true,
                                  tombstone: 'This message was deleted',
                                }
                              : m
                          )
                        );
                      }
                    })
                    .catch((e) => toast.error(getErrorMessage(e)));
                }}
                onEdit={(msg) => {
                  const next = window.prompt('Edit message', msg.body);
                  if (next == null || !next.trim()) return;
                  void api
                    .patch(`/chat/messages/${msg._id}`, { body: next.trim() })
                    .then((res) => {
                      const updated = res.data.data as Message;
                      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) =>
                        (old || []).map((m) => (m._id === updated._id ? updated : m))
                      );
                    })
                    .catch((e) => toast.error(getErrorMessage(e)));
                }}
                onPreviewImage={(url, name) => setPreview({ url, name })}
              />

              <MessageComposer
                onSend={(p) => void sendMessage(p)}
                placeholder={`Message ${
                  activeConversation.type === 'group'
                    ? activeConversation.name
                    : activeConversation.members.find((m) => m._id !== user?.id)?.name || 'teammate'
                }…`}
                autoFocus
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onUploadFile={uploadFile}
                draft={activeConversation.draft}
                onDraftChange={(draft) => void patchPrefs({ draft })}
                onTyping={(typing) => {
                  connectSocket().emit('chat:typing', { conversationId: activeId, typing });
                }}
              />
            </>
          ) : (
            <ChatEmptyState
              variant="no-conversation"
              onOpenDirectory={() => setNewChatModalOpen(true)}
              onNewGroup={() => setGroupModalOpen(true)}
            />
          )}
        </div>

        {detailsOpen && <div className="hidden h-full shrink-0 lg:flex">{detailsPanel}</div>}
      </div>

      {detailsOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            className="sm-chat-drawer-backdrop fixed inset-0 z-40 bg-slate-900/40"
            aria-label="Close details overlay"
            onClick={() => setDetailsOpen(false)}
          />
          <div className="sm-chat-drawer-panel fixed inset-y-0 right-0 z-50 flex w-[min(100vw,320px)] shadow-2xl">
            {detailsPanel}
          </div>
        </div>
      )}

      <CreateGroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        colleagues={colleagues}
        onCreate={(name, memberIds, description) =>
          createGroupMutation.mutate({ name, memberIds, description })
        }
        isPending={createGroupMutation.isPending}
      />

      <NewChatModal
        open={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
        colleagues={colleagues}
        onStartDirect={(id) => startDirectMutation.mutate(id)}
        onOpenNewGroup={() => setGroupModalOpen(true)}
        onlineIds={onlineIds}
        isPending={startDirectMutation.isPending}
      />

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={() => setPreview(null)}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={preview.url}
            alt={preview.name}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
