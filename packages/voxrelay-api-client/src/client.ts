type RequestInterceptor = (req: RequestInit & { url: string }) => RequestInit & { url: string }
type ResponseInterceptor = (res: Response) => Response | Promise<Response>

export interface ApiClientOptions {
  baseUrl: string
  wsUrl?: string
  fetch?: typeof globalThis.fetch
  interceptors?: {
    request?: RequestInterceptor[]
    response?: ResponseInterceptor[]
  }
}

export class ApiClient {
  protected baseUrl: string
  protected wsUrl: string
  protected accessToken: string | null = null
  protected refreshToken: string | null = null
  private fetchImpl: typeof globalThis.fetch
  private requestInterceptors: RequestInterceptor[]
  private responseInterceptors: ResponseInterceptor[]

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.wsUrl = options.wsUrl ?? this.baseUrl
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.requestInterceptors = options.interceptors?.request ?? []
    this.responseInterceptors = options.interceptors?.response ?? []
  }

  setTokens(access: string, refresh?: string) {
    this.accessToken = access
    if (refresh) this.refreshToken = refresh
  }

  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {}
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`

    let req: RequestInit & { url: string } = {
      url,
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }

    for (const interceptor of this.requestInterceptors) {
      req = interceptor(req)
    }

    let res = await this.fetchImpl(req.url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.body,
    })

    for (const interceptor of this.responseInterceptors) {
      res = await interceptor(res)
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, errBody.error ?? 'Request failed', errBody)
    }

    if (res.status === 204) return undefined as T

    return res.json() as Promise<T>
  }

  get<T = unknown>(path: string) { return this.request<T>('GET', path) }
  post<T = unknown>(path: string, body?: unknown) { return this.request<T>('POST', path, body) }
  put<T = unknown>(path: string, body?: unknown) { return this.request<T>('PUT', path, body) }
  patch<T = unknown>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body) }
  delete<T = unknown>(path: string) { return this.request<T>('DELETE', path) }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
