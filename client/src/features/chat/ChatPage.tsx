import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { ConversationSidebar } from './components/ConversationSidebar';
import { ChatHeader } from './components/ChatHeader';
import { MessageTimeline } from './components/MessageTimeline';
import { MessageComposer } from './components/MessageComposer';
import { DetailsPanel } from './components/DetailsPanel';
import { CreateGroupModal } from './components/CreateGroupModal';
import { ChatEmptyState } from './components/ChatEmptyState';
import type { Colleague, Conversation, Message } from './types';

export function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c') || '';

  const [detailsOpen, setDetailsOpen] = useState(true);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Conversations Query
  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
  } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: async () => (await api.get('/chat/conversations')).data.data as Conversation[],
  });

  // Colleagues Query (Full directory)
  const { data: colleagues = [] } = useQuery({
    queryKey: ['chat-colleagues'],
    queryFn: async () =>
      (await api.get('/chat/colleagues')).data.data as Colleague[],
  });

  // Active Messages Query
  const {
    data: messages = [],
    refetch: refetchMessages,
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: ['chat-messages', activeId],
    queryFn: async () =>
      (await api.get(`/chat/conversations/${activeId}/messages`, { params: { limit: 100 } })).data
        .data as Message[],
    enabled: !!activeId,
  });

  // Active Conversation Object
  const activeConversation = useMemo(
    () => conversations.find((c) => c._id === activeId),
    [conversations, activeId]
  );

  // Real-time socket events
  useEffect(() => {
    const socket = connectSocket();

    const onMessage = (msg: Message & { conversation?: string }) => {
      const convId = (msg as { conversation?: string }).conversation || activeId;
      if (convId === activeId) {
        qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) => {
          if (!old) return [msg];
          if (old.some((m) => m._id === msg._id || (msg.clientId && m.clientId === msg.clientId))) {
            return old;
          }
          return [...old, msg];
        });
      }
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    };

    const onNotify = () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:notify', onNotify);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:notify', onNotify);
    };
  }, [activeId, qc]);

  // Join active conversation room and mark as read
  useEffect(() => {
    if (!activeId) return;
    const socket = connectSocket();
    socket.emit('chat:join', activeId);

    api
      .post(`/chat/conversations/${activeId}/read`)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      })
      .catch(() => undefined);

    return () => {
      socket.emit('chat:leave', activeId);
    };
  }, [activeId, qc]);

  // Start Direct Chat Mutation
  const startDirectMutation = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post('/chat/conversations/direct', { userId })).data.data as Conversation,
    onSuccess: (c) => {
      setParams({ c: c._id });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      toast.success('Conversation opened');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Create Group Mutation
  const createGroupMutation = useMutation({
    mutationFn: async ({ name, memberIds }: { name: string; memberIds: string[] }) =>
      (
        await api.post('/chat/conversations/group', {
          name,
          memberIds,
        })
      ).data.data as Conversation,
    onSuccess: (c) => {
      setGroupModalOpen(false);
      setParams({ c: c._id });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      toast.success(`Group "${c.name}" created successfully`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      const clientId = crypto.randomUUID();
      return (
        await api.post(`/chat/conversations/${activeId}/messages`, {
          body: text.trim(),
          clientId,
        })
      ).data.data as Message;
    },
    onSuccess: (msg) => {
      qc.setQueryData(['chat-messages', activeId], (old: Message[] | undefined) => {
        if (!old) return [msg];
        if (old.some((m) => m._id === msg._id)) return old;
        return [...old, msg];
      });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Manual Refresh Handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['chat-conversations'] }),
      refetchMessages(),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
    toast.success('Messages refreshed');
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] min-h-[580px] w-full overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-xs">
      <div className="flex h-full w-full">
        {/* PANEL 1: CONVERSATIONS SIDEBAR */}
        <div
          className={`${
            activeId ? 'hidden md:flex' : 'flex w-full md:w-auto'
          } h-full shrink-0`}
        >
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => setParams({ c: id })}
            onNewGroup={() => setGroupModalOpen(true)}
            onOpenDirectory={() => setDetailsOpen(true)}
            currentUserId={user?.id}
            isLoading={isLoadingConversations}
          />
        </div>

        {/* PANEL 2: CENTER CHAT TIMELINE */}
        <div
          className={`${
            !activeId ? 'hidden md:flex' : 'flex'
          } flex-1 flex-col h-full min-w-0 bg-white relative`}
        >
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <ChatHeader
                conversation={activeConversation}
                currentUserId={user?.id}
                onBack={() => setParams({})}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((prev) => !prev)}
              />

              {/* Message Timeline */}
              <MessageTimeline
                conversation={activeConversation}
                messages={messages}
                currentUserId={user?.id}
                onSendStarter={(text) => sendMessageMutation.mutate(text)}
                isLoading={isLoadingMessages}
              />

              {/* Anchored Message Composer */}
              <MessageComposer
                onSend={(text) => sendMessageMutation.mutate(text)}
                isPending={sendMessageMutation.isPending}
                placeholder={`Message ${
                  activeConversation.type === 'group'
                    ? activeConversation.name
                    : activeConversation.members.find((m) => m._id !== user?.id)?.name || 'teammate'
                }…`}
                autoFocus
              />
            </>
          ) : (
            <ChatEmptyState
              variant="no-conversation"
              onOpenDirectory={() => setDetailsOpen(true)}
              onNewGroup={() => setGroupModalOpen(true)}
            />
          )}
        </div>

        {/* PANEL 3: RIGHT DETAILS & PEOPLE PANEL */}
        {detailsOpen && (
          <div className="hidden lg:flex h-full shrink-0">
            <DetailsPanel
              conversation={activeConversation}
              colleagues={colleagues}
              currentUserId={user?.id}
              currentUserRole={user?.role}
              onClose={() => setDetailsOpen(false)}
              onStartDirect={(id) => startDirectMutation.mutate(id)}
              initialTab={activeConversation ? 'details' : 'directory'}
            />
          </div>
        )}
      </div>

      {/* CREATE GROUP MODAL */}
      <CreateGroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        colleagues={colleagues}
        onCreate={(name, memberIds) => createGroupMutation.mutate({ name, memberIds })}
        isPending={createGroupMutation.isPending}
      />
    </div>
  );
}
