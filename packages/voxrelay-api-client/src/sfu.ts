import { ApiClient } from './client.js'

export interface RtpCapabilitiesResponse {
  rtpCapabilities: unknown
}

export class SfuApi {
  constructor(private client: ApiClient) {}

  async getRtpCapabilities(channelId: string): Promise<RtpCapabilitiesResponse> {
    return this.client.get(`/api/v1/sfu/${channelId}/rtp-capabilities`)
  }
}
