export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'dispatcher' | 'user' | 'listener';
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: 'public' | 'private';
  ownerId: string | null;
  isActive: boolean;
  maxBitrate: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export interface SpeakingEvent {
  type: 'speaking.start' | 'speaking.stop';
  channelId: string;
  userId: string;
  displayName?: string;
}

export interface PresenceEvent {
  type: 'user.online' | 'user.offline' | 'user.joined' | 'user.left';
  channelId?: string;
  userId: string;
}

export interface SignalMessage {
  type: 'signal';
  channelId: string;
  userId: string;
  payload: any;
}

export type ServerMessage = SpeakingEvent | PresenceEvent | SignalMessage;

export interface ClientMessage {
  type: 'ping' | 'speaking.start' | 'speaking.stop' | 'channel.join' | 'channel.leave' | 'signal' | 'chat.send';
  channelId?: string;
  payload?: any;
}

// ----- Instant Messaging -----

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: string | null;
  isAdmin: boolean;
  joinedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'location' | 'file';
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface ConversationWithLastMessage extends Conversation {
  lastMessage: Message | null;
  unreadCount: number;
  participants: Pick<ConversationParticipant, 'userId' | 'lastReadAt'>[];
}

export interface MessageWithSender extends Message {
  sender: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
}
