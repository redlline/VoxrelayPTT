export interface RecordingSession {
  id: string;
  channelId: string;
  startedBy: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  participants: string[];
  filePath: string;
  fileSize: number;
}

export interface RecordingSegment {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  startOffsetMs: number;
  durationMs: number;
  filePath: string;
}
