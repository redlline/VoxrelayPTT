import { getDb } from '../db/connection.js';
import { recordingStorage } from './storage.js';
import { RecordingSession, RecordingSegment } from './types.js';

const MIN_RECORDING_BYTES = Number(process.env.MIN_RECORDING_BYTES || 192);
const MIN_UPLOADED_RECORDING_BYTES = Number(process.env.MIN_UPLOADED_RECORDING_BYTES || 64);

export class RecordingManager {
  private activeSessions = new Map<string, { sessionId: string; segmentIndex: number }>();

  private async createCompletedSessionWithSegment(
    channelId: string,
    speakerId: string,
    speakerName: string,
    audioBuffer: Buffer,
    durationMs: number,
    options?: { extension?: string; contentType?: string },
  ): Promise<string | null> {
    if (audioBuffer.length < MIN_UPLOADED_RECORDING_BYTES) return null;

    const sql = getDb();
    const [session] = await sql`
      INSERT INTO recording_sessions (
        channel_id,
        started_by,
        started_at,
        ended_at,
        duration_ms,
        participants,
        file_size
      )
      VALUES (
        ${channelId},
        ${speakerId},
        NOW() - (${durationMs} * INTERVAL '1 millisecond'),
        NOW(),
        ${durationMs},
        ARRAY[CAST(${speakerId} AS uuid)],
        ${audioBuffer.length}
      )
      RETURNING id
    `;

    const filePath = await recordingStorage.saveAudio(
      channelId,
      session.id,
      0,
      audioBuffer,
      options,
    );

    await sql`
      INSERT INTO recording_segments (
        session_id,
        speaker_id,
        speaker_name,
        start_offset_ms,
        duration_ms,
        file_path
      )
      VALUES (
        ${session.id},
        ${speakerId},
        ${speakerName},
        0,
        ${durationMs},
        ${filePath}
      )
    `;

    await sql`
      UPDATE recording_sessions
      SET file_path = ${filePath}
      WHERE id = ${session.id}
    `;

    return session.id;
  }

  async startSession(channelId: string, startedBy: string): Promise<string> {
    const active = this.activeSessions.get(channelId);
    if (active) {
      return active.sessionId;
    }

    const sql = getDb();
    const [session] = await sql`
      INSERT INTO recording_sessions (channel_id, started_by)
      VALUES (${channelId}, ${startedBy})
      RETURNING id
    `;

    this.activeSessions.set(channelId, { sessionId: session.id, segmentIndex: 0 });
    console.log(`Recording session started: ${session.id} for channel ${channelId}`);
    return session.id;
  }

  async stopSession(channelId: string): Promise<void> {
    const active = this.activeSessions.get(channelId);
    if (!active) return;

    const sql = getDb();
    const [session] = await sql`
      UPDATE recording_sessions
      SET ended_at = NOW(),
          duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::int * 1000
      WHERE id = ${active.sessionId}
      RETURNING file_size
    `;

    if (!session || Number(session.file_size || 0) < MIN_RECORDING_BYTES) {
      const segments = await sql<Array<{ file_path: string | null }>>`
        SELECT file_path
        FROM recording_segments
        WHERE session_id = ${active.sessionId}
          AND file_path IS NOT NULL
      `;

      for (const segment of segments) {
        if (segment.file_path) {
          await recordingStorage.deleteAudio(segment.file_path);
        }
      }

      await sql`
        DELETE FROM recording_sessions
        WHERE id = ${active.sessionId}
      `;
    }

    this.activeSessions.delete(channelId);
    console.log(`Recording session ended: ${active.sessionId}`);
  }

  async saveSegment(
    channelId: string,
    speakerId: string,
    speakerName: string,
    audioBuffer: Buffer,
    durationMs: number,
    options?: { extension?: string; contentType?: string; minBytes?: number },
  ): Promise<void> {
    const active = this.activeSessions.get(channelId);
    if (!active) return;
    const minBytes = options?.minBytes ?? MIN_RECORDING_BYTES;
    if (audioBuffer.length < minBytes) return;

    const filePath = await recordingStorage.saveAudio(
      channelId,
      active.sessionId,
      active.segmentIndex,
      audioBuffer,
      options,
    );

    const sql = getDb();
    await sql`
      INSERT INTO recording_segments (session_id, speaker_id, speaker_name, start_offset_ms, duration_ms, file_path)
      VALUES (
        ${active.sessionId},
        ${speakerId},
        ${speakerName},
        (SELECT COALESCE(SUM(duration_ms), 0) FROM recording_segments WHERE session_id = ${active.sessionId}),
        ${durationMs},
        ${filePath}
      )
    `;

    await sql`
      UPDATE recording_sessions
      SET file_size = file_size + ${audioBuffer.length},
          file_path = COALESCE(file_path, ${filePath})
      WHERE id = ${active.sessionId}
    `;

    await sql`
      UPDATE recording_sessions
      SET participants = array_append(participants, ${speakerId})
      WHERE id = ${active.sessionId}
        AND NOT (CAST(${speakerId} AS uuid) = ANY(participants))
    `;

    active.segmentIndex++;
  }

  async saveUploadedSegment(
    channelId: string,
    speakerId: string,
    speakerName: string,
    audioBuffer: Buffer,
    durationMs: number,
    options?: { extension?: string; contentType?: string },
  ): Promise<{ sessionId: string | null; detached: boolean }> {
    const active = this.activeSessions.get(channelId);

    if (active) {
      await this.saveSegment(channelId, speakerId, speakerName, audioBuffer, durationMs, {
        ...options,
        minBytes: MIN_UPLOADED_RECORDING_BYTES,
      });
      return { sessionId: active.sessionId, detached: false };
    }

    const sessionId = await this.createCompletedSessionWithSegment(
      channelId,
      speakerId,
      speakerName,
      audioBuffer,
      durationMs,
      options,
    );

    return { sessionId, detached: true };
  }

  async getSessions(channelId: string, limit = 50, offset = 0): Promise<RecordingSession[]> {
    const sql = getDb();
    const sessions = await sql`
      SELECT
        rs.id,
        rs.channel_id,
        rs.started_by,
        rs.started_at,
        rs.ended_at,
        rs.duration_ms,
        rs.participants,
        COALESCE(rs.file_path, first_segment.file_path) AS file_path,
        rs.file_size,
        rs.created_at
      FROM recording_sessions rs
      LEFT JOIN LATERAL (
        SELECT file_path
        FROM recording_segments
        WHERE session_id = rs.id
          AND file_path IS NOT NULL
        ORDER BY start_offset_ms ASC
        LIMIT 1
      ) AS first_segment ON true
      WHERE rs.channel_id = ${channelId}
        AND COALESCE(rs.file_size, 0) >= ${MIN_RECORDING_BYTES}
        AND COALESCE(rs.file_path, first_segment.file_path) IS NOT NULL
      ORDER BY started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return sessions as any[];
  }

  async getSegments(sessionId: string): Promise<RecordingSegment[]> {
    const sql = getDb();
    const segments = await sql`
      SELECT * FROM recording_segments
      WHERE session_id = ${sessionId}
      ORDER BY start_offset_ms
    `;
    return segments as any[];
  }

  async getAudioByKey(key: string): Promise<Buffer | null> {
    return recordingStorage.getAudio(key);
  }

  getActiveSession(channelId: string): string | undefined {
    return this.activeSessions.get(channelId)?.sessionId;
  }
}

export const recordingManager = new RecordingManager();
