export enum FloorPriority {
  NORMAL = 0,
  DISPATCHER = 1,
  EMERGENCY = 2,
}

export interface FloorState {
  channelId: string;
  currentSpeaker: string | null;
  currentSpeakerName: string | null;
  currentSpeakerPriority: FloorPriority;
  speakingSince: number | null;
  queue: FloorQueueItem[];
  locked: boolean;
  lockedBy: string | null;
}

export interface FloorQueueItem {
  userId: string;
  displayName: string;
  priority: FloorPriority;
  requestedAt: number;
}

export interface FloorEvent {
  type: 'ptt.granted' | 'ptt.denied' | 'ptt.queued' | 'ptt.released' | 'ptt.force_release';
  channelId: string;
  userId?: string;
  displayName?: string;
  reason?: string;
  position?: number;
}

export interface SpeakerEvent {
  type: 'speaking.started' | 'speaking.stopped';
  channelId: string;
  userId: string;
  displayName?: string;
}
