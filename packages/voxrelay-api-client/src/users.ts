import { ApiClient } from './client.js'

export interface UserDto {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: string
  isActive: boolean
  lastSeenAt: string | null
  createdAt: string
}

export class UsersApi {
  constructor(private client: ApiClient) {}

  async list(): Promise<{ users: UserDto[] }> {
    return this.client.get('/api/v1/users')
  }

  async get(id: string): Promise<{ user: UserDto }> {
    return this.client.get(`/api/v1/users/${id}`)
  }

  async update(id: string, data: { displayName?: string; avatarUrl?: string | null }): Promise<{ user: UserDto }> {
    return this.client.patch(`/api/v1/users/${id}`, data)
  }
}
