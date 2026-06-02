import { ApiClient } from './client.js'

export class AdminApi {
  constructor(private client: ApiClient) {}

  async updateUser(userId: string, data: { displayName?: string; role?: string; isActive?: boolean }): Promise<void> {
    return this.client.put(`/api/v1/admin/users/${userId}`, data)
  }

  async getStats(): Promise<{ users: number; channels: number; activeCalls: number }> {
    return this.client.get('/api/v1/admin/stats')
  }

  async getLogs(since?: string): Promise<{ logs: unknown[] }> {
    const qs = since ? `?since=${since}` : ''
    return this.client.get(`/api/v1/admin/logs${qs}`)
  }
}
