import { Client } from 'minio';

let minioClient: Client | null = null;

export function getMinio(): Client {
  if (!minioClient) {
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;

    if (!accessKey || !secretKey) {
      throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required');
    }

    minioClient = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    });
  }
  return minioClient;
}

export function getBucketName(): string {
  return process.env.MINIO_BUCKET || 'voxrelay-recordings';
}

export async function ensureBucket(): Promise<void> {
  const mc = getMinio();
  const buckets = [getBucketName(), 'voxrelay-uploads'];

  for (const bucket of buckets) {
    const exists = await mc.bucketExists(bucket);
    if (!exists) {
      await mc.makeBucket(bucket);
      console.log(`MinIO bucket "${bucket}" created`);
    }
  }
}
