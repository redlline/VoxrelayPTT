import { ApiClient } from './client.js'

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  displayName: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    displayName: string
    role: string
  }
}

export interface MeResponse {
  user: {
    id: string
    email: string
    displayName: string
    role: string
    isActive: boolean
    lastSeenAt: string | null
    createdAt: string
  }
}

export class AuthApi {
  constructor(private client: ApiClient) {}

  async login(data: LoginRequest): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/api/v1/auth/login', data)
    this.client.setTokens(res.accessToken, res.refreshToken)
    return res
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/api/v1/auth/register', data)
    this.client.setTokens(res.accessToken, res.refreshToken)
    return res
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/api/v1/auth/refresh', { refreshToken })
    this.client.setTokens(res.accessToken, res.refreshToken)
    return res
  }

  async logout(): Promise<void> {
    await this.client.post('/api/v1/auth/logout')
    this.client.clearTokens()
  }

  async me(): Promise<MeResponse> {
    return this.client.get<MeResponse>('/api/v1/auth/me')
  }
}
