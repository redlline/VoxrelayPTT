import { ApiClient } from './client.js'

export interface ChannelDto {
  id: string
  name: string
  description: string
  type: 'public' | 'private'
  ownerId: string | null
  isActive: boolean
  maxBitrate: number
  memberCount: number
  currentUserRole: string | null
  memberRole: string | null
  isDirectCall: boolean
  createdAt: string
  updatedAt: string
}

export interface ChannelMemberDto {
  id: string
  userId: string
  channelId: string
  role: string
  displayName: string
  avatarUrl: string | null
  isOnline: boolean
  joinedAt: string
}

export interface LocationDto {
  userId: string
  displayName: string
  latitude: number
  longitude: number
  timestamp: string
}

export class ChannelsApi {
  constructor(private client: ApiClient) {}

  async list(): Promise<{ channels: ChannelDto[] }> {
    return this.client.get('/api/v1/channels')
  }

  async get(id: string): Promise<{ channel: ChannelDto }> {
    return this.client.get(`/api/v1/channels/${id}`)
  }

  async create(data: { name: string; description?: string; type?: 'public' | 'private' }): Promise<{ channel: ChannelDto }> {
    return this.client.post('/api/v1/channels', data)
  }

  async update(id: string, data: Partial<ChannelDto>): Promise<{ channel: ChannelDto }> {
    return this.client.put(`/api/v1/channels/${id}`, data)
  }

  async delete(id: string): Promise<void> {
    return this.client.delete(`/api/v1/channels/${id}`)
  }

  async getMembers(id: string): Promise<{ members: ChannelMemberDto[] }> {
    return this.client.get(`/api/v1/channels/${id}/members`)
  }

  async addMember(id: string, userId: string, role?: string): Promise<void> {
    return this.client.post(`/api/v1/channels/${id}/members`, { userId, role })
  }

  async removeMember(id: string, userId: string): Promise<void> {
    return this.client.delete(`/api/v1/channels/${id}/members/${userId}`)
  }

  async muteMember(id: string, userId: string, muted: boolean): Promise<void> {
    return this.client.post(`/api/v1/channels/${id}/members/${userId}/mute`, { muted })
  }

  async getLocations(id: string): Promise<{ locations: LocationDto[] }> {
    return this.client.get(`/api/v1/channels/${id}/locations`)
  }

  async sendSos(id: string, message: string): Promise<void> {
    return this.client.post(`/api/v1/channels/${id}/sos`, { message })
  }
}
