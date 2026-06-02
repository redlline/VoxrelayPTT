-- Migration: 002_recording_tables.sql
-- Created: 2026-05-27

-- Recording sessions table
CREATE TABLE IF NOT EXISTS recording_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  participants UUID[] DEFAULT '{}',
  file_path TEXT,
  file_size BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_sessions_channel_id ON recording_sessions(channel_id);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_started_at ON recording_sessions(started_at);

-- Recording segments table
CREATE TABLE IF NOT EXISTS recording_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES recording_sessions(id) ON DELETE CASCADE,
  speaker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  speaker_name VARCHAR(100),
  start_offset_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_segments_session_id ON recording_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_recording_segments_speaker_id ON recording_segments(speaker_id);
