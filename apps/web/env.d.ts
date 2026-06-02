/// <reference types="vite/client" />

declare module 'mediasoup-client' {
  const Device: any;
  export default Device;
  export { Device };
  export const version: string;
}

declare module 'mediasoup-client/lib/types' {
  export class Device {
    loaded: boolean;
    load(options: { routerRtpCapabilities: any }): Promise<void>;
    createSendTransport(options: any): any;
    createRecvTransport(options: any): any;
    rtpCapabilities: any;
  }
  export type Transport = any;
  export type Producer = any;
  export type Consumer = any;
}
