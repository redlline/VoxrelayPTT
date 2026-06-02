import { create } from 'zustand';

interface User {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'location' | 'file' | 'voice';
  metadata: Record<string, any> | null;
  createdAt: string;
  sender: User;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: Message | null;
  unreadCount: number;
  participants: { userId: string; displayName?: string; lastReadAt: string | null }[];
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  loading: boolean;
  onlineUsers: Set<string>;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  prependMessages: (conversationId: string, messages: Message[], hasMore: boolean) => void;
  setMessages: (conversationId: string, messages: Message[], hasMore: boolean) => void;
  incrementUnread: (conversationId: string) => void;
  markRead: (conversationId: string) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (conversationId: string) => void;
  updateLastMessage: (conversationId: string, message: Message) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  hasMore: {},
  loading: false,
  onlineUsers: new Set<string>(),

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      const exists = existing.some((m) => m.id === message.id);
      if (exists) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message],
        },
      };
    }),

  prependMessages: (conversationId, messages, hasMore) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      const existingIds = new Set(existing.map((m) => m.id));
      const newMsgs = messages.filter((m) => !existingIds.has(m.id));
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...newMsgs, ...existing],
        },
        hasMore: {
          ...state.hasMore,
          [conversationId]: hasMore,
        },
      };
    }),

  setMessages: (conversationId, messages, hasMore) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
      hasMore: { ...state.hasMore, [conversationId]: hasMore },
    })),

  incrementUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c,
      ),
    })),

  markRead: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    })),

  addConversation: (conversation) =>
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conversation.id);
      if (exists) return state;
      return { conversations: [conversation, ...state.conversations] };
    }),

  removeConversation: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== conversationId),
      activeConversationId:
        state.activeConversationId === conversationId ? null : state.activeConversationId,
    })),

  updateLastMessage: (conversationId, message) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: message, updatedAt: message.createdAt }
          : c,
      ),
    })),

  setUserOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),

  setUserOffline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),
}));
