import { ApiClient } from './client.js'

export interface ConversationDto {
  id: string
  type: 'direct' | 'group'
  name: string | null
  lastMessage: MessageDto | null
  unreadCount: number
  participants: { userId: string; lastReadAt: string | null }[]
  createdAt: string
  updatedAt: string
}

export interface MessageDto {
  id: string
  conversationId: string
  senderId: string
  sender: { id: string; displayName: string; avatarUrl: string | null }
  content: string
  type: 'text' | 'image' | 'location' | 'file'
  metadata: Record<string, unknown> | null
  createdAt: string
}

export class ChatApi {
  constructor(private client: ApiClient) {}

  async getConversations(): Promise<{ conversations: ConversationDto[] }> {
    return this.client.get('/api/v1/conversations')
  }

  async getConversation(id: string): Promise<{ conversation: ConversationDto }> {
    return this.client.get(`/api/v1/conversations/${id}`)
  }

  async createConversation(data: { type: 'direct' | 'group'; name?: string; memberIds: string[] }): Promise<{ conversation: ConversationDto }> {
    return this.client.post('/api/v1/conversations', data)
  }

  async getMessages(conversationId: string, page = 1, limit = 50): Promise<{ messages: MessageDto[] }> {
    return this.client.get(`/api/v1/conversations/${conversationId}/messages?page=${page}&limit=${limit}`)
  }

  async markRead(conversationId: string, messageId: string): Promise<void> {
    return this.client.post(`/api/v1/conversations/${conversationId}/read`, { messageId })
  }
}
