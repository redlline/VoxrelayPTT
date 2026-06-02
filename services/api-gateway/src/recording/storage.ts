import { getMinio, getBucketName } from '../lib/minio.js';
import { Readable } from 'stream';

export class RecordingStorage {
  async saveAudio(
    channelId: string,
    sessionId: string,
    segmentIndex: number,
    audioBuffer: Buffer,
    options?: { extension?: string; contentType?: string },
  ): Promise<string> {
    const mc = getMinio();
    const bucket = getBucketName();
    const extension = options?.extension || 'ogg';
    const contentType = options?.contentType || 'audio/ogg';
    const objectKey = `recordings/${channelId}/${sessionId}/segment_${segmentIndex}.${extension}`;

    await mc.putObject(bucket, objectKey, Readable.from(audioBuffer), audioBuffer.length, {
      'Content-Type': contentType,
      'X-Channel-Id': channelId,
      'X-Session-Id': sessionId,
    });

    return objectKey;
  }

  async getAudio(key: string): Promise<Buffer | null> {
    try {
      const mc = getMinio();
      const bucket = getBucketName();
      const stream = await mc.getObject(bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async deleteAudio(key: string): Promise<void> {
    try {
      const mc = getMinio();
      await mc.removeObject(getBucketName(), key);
    } catch (err) {
      console.error('Failed to delete recording:', err);
    }
  }

  async listRecordings(channelId: string): Promise<string[]> {
    const mc = getMinio();
    const bucket = getBucketName();
    const prefix = `recordings/${channelId}/`;

    const objects: string[] = [];
    const stream = mc.listObjects(bucket, prefix, true);
    for await (const obj of stream) {
      if (obj.name) objects.push(obj.name);
    }
    return objects;
  }
}

export const recordingStorage = new RecordingStorage();
