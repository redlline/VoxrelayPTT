import { create } from 'zustand';
import type { Producer, Consumer } from 'mediasoup-client/lib/types';

interface PTTState {
  isPTTActive: boolean;
  isMicEnabled: boolean;
  audioStream: MediaStream | null;
  audioLevel: number;
  producer: Producer | null;
  consumers: Map<string, Consumer>;
  floorGranted: boolean;
  floorQueued: number;
  floorSpeaker: { userId: string; displayName: string } | null;
  isReconnecting: boolean;
  isMuted: boolean;
  voiceAnnouncement: { channelId: string; text: string } | null;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  videoStream: MediaStream | null;
  videoProducer: Producer | null;
  videoConsumers: Map<string, { consumer: Consumer; peerId: string; displayName: string }>;
  screenStream: MediaStream | null;
  screenProducer: Producer | null;

  setPTTActive: (active: boolean) => void;
  setMicEnabled: (enabled: boolean) => void;
  setAudioStream: (stream: MediaStream | null) => void;
  setAudioLevel: (level: number) => void;
  setProducer: (producer: Producer | null) => void;
  addConsumer: (producerId: string, consumer: Consumer) => void;
  removeConsumer: (producerId: string) => void;
  setFloorGranted: (granted: boolean) => void;
  setFloorQueued: (position: number) => void;
  setFloorSpeaker: (speaker: { userId: string; displayName: string } | null) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setMuted: (muted: boolean) => void;
  setVoiceAnnouncement: (announcement: { channelId: string; text: string } | null) => void;
  setCameraEnabled: (enabled: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  setVideoStream: (stream: MediaStream | null) => void;
  setVideoProducer: (producer: Producer | null) => void;
  addVideoConsumer: (producerId: string, data: { consumer: Consumer; peerId: string; displayName: string }) => void;
  removeVideoConsumer: (producerId: string) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  setScreenProducer: (producer: Producer | null) => void;
  reset: () => void;
}

export const usePTTStore = create<PTTState>((set) => ({
  isPTTActive: false,
  isMicEnabled: false,
  audioStream: null,
  audioLevel: 0,
  producer: null,
  consumers: new Map(),
  floorGranted: false,
  floorQueued: 0,
  floorSpeaker: null,
  isReconnecting: false,
  isMuted: false,
  voiceAnnouncement: null,
  isCameraEnabled: false,
  isScreenSharing: false,
  videoStream: null,
  videoProducer: null,
  videoConsumers: new Map(),
  screenStream: null,
  screenProducer: null,

  setPTTActive: (active) => set({ isPTTActive: active }),
  setMicEnabled: (enabled) => set({ isMicEnabled: enabled }),
  setAudioStream: (stream) => set({ audioStream: stream }),
  setAudioLevel: (level) => set({ audioLevel: level }),
  setProducer: (producer) => set({ producer }),
  addConsumer: (producerId, consumer) =>
    set((state) => {
      const consumers = new Map(state.consumers);
      consumers.set(producerId, consumer);
      return { consumers };
    }),
  removeConsumer: (producerId) =>
    set((state) => {
      const consumers = new Map(state.consumers);
      const consumer = consumers.get(producerId);
      if (consumer) {
        consumer.close();
      }
      consumers.delete(producerId);
      return { consumers };
    }),
  setFloorGranted: (granted) => set({ floorGranted: granted, floorQueued: granted ? 0 : 0 }),
  setFloorQueued: (position) =>
    set((state) => ({
      floorQueued: position,
      // Keep floor while clearing queue after grant (setFloorQueued(0) must not drop the floor)
      floorGranted: position > 0 ? false : state.floorGranted,
    })),
  setFloorSpeaker: (speaker) => set({ floorSpeaker: speaker }),
  setReconnecting: (reconnecting) => set({ isReconnecting: reconnecting }),
  setMuted: (muted) => set({ isMuted: muted }),
  setVoiceAnnouncement: (announcement) => set({ voiceAnnouncement: announcement }),
  setCameraEnabled: (enabled) => set({ isCameraEnabled: enabled }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
  setVideoStream: (stream) => set({ videoStream: stream }),
  setVideoProducer: (producer) => set({ videoProducer: producer }),
  addVideoConsumer: (producerId, data) =>
    set((state) => {
      const videoConsumers = new Map(state.videoConsumers);
      videoConsumers.set(producerId, data);
      return { videoConsumers };
    }),
  removeVideoConsumer: (producerId) =>
    set((state) => {
      const videoConsumers = new Map(state.videoConsumers);
      const entry = videoConsumers.get(producerId);
      if (entry) {
        entry.consumer.close();
      }
      videoConsumers.delete(producerId);
      return { videoConsumers };
    }),
  setScreenStream: (stream) => set({ screenStream: stream }),
  setScreenProducer: (producer) => set({ screenProducer: producer }),
  reset: () =>
    set((state) => {
      // Clean up audio producer
      if (state.producer) {
        state.producer.close();
      }
      // Clean up all audio consumers
      state.consumers.forEach((consumer) => {
        consumer.close();
      });
      // Clean up audio stream
      if (state.audioStream) {
        state.audioStream.getTracks().forEach(track => track.stop());
      }
      // Clean up video producer
      if (state.videoProducer) {
        state.videoProducer.close();
      }
      // Clean up video consumers
      state.videoConsumers.forEach((entry) => {
        entry.consumer.close();
      });
      // Clean up video stream
      if (state.videoStream) {
        state.videoStream.getTracks().forEach(track => track.stop());
      }
      // Clean up screen producer
      if (state.screenProducer) {
        state.screenProducer.close();
      }
      // Clean up screen stream
      if (state.screenStream) {
        state.screenStream.getTracks().forEach(track => track.stop());
      }

      return {
        isPTTActive: false,
        isMicEnabled: false,
        audioStream: null,
        audioLevel: 0,
        producer: null,
        consumers: new Map(),
        floorGranted: false,
        floorQueued: 0,
        floorSpeaker: null,
        isReconnecting: false,
        isMuted: false,
        voiceAnnouncement: null,
        isCameraEnabled: false,
        isScreenSharing: false,
        videoStream: null,
        videoProducer: null,
        videoConsumers: new Map(),
        screenStream: null,
        screenProducer: null,
      };
    }),
}));
