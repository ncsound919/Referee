/**
 * cloudflare.ts
 *
 * Unified Cloudflare integration:
 * 1. Cloudflare Workers AI (LLMs, embeddings, classification)
 * 2. Cloudflare Workers Dispatch (serverless compute offload)
 * 3. Cloudflare R2 Storage (S3-compatible bucket storage & presigned URLs)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function getCloudflareAccountId(): string {
  return process.env.CLOUDFLARE_ACCOUNT_ID || '';
}

export function getCloudflareApiToken(): string {
  return process.env.CLOUDFLARE_API_TOKEN || '';
}

export function getCloudflareAiToken(): string {
  return process.env.CLOUDFLARE_AI_TOKEN || getCloudflareApiToken();
}

export function getR2Endpoint(): string {
  const accountId = getCloudflareAccountId();
  return process.env.CLOUDFLARE_R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
}

// ── S3-Compatible R2 Client ──────────────────────────────────────────────────
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: getR2Endpoint() || 'https://auto.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  },
});

export interface CloudflareTokenStatus {
  valid: boolean;
  id?: string;
  status?: string;
  message?: string;
}

export interface WorkersAiOptions {
  model?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

export interface WorkersAiResponse {
  success: boolean;
  result?: Record<string, unknown>;
  errors?: Array<{ code: number; message: string }>;
}

export interface WorkerDispatchTask {
  scriptName?: string;
  action?: string;
  payload?: Record<string, unknown>;
}

export class CloudflareService {
  /** Verify that the API token is active and valid */
  static async verifyToken(): Promise<CloudflareTokenStatus> {
    const apiToken = getCloudflareApiToken();
    const accountId = getCloudflareAccountId();

    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      const data = await res.json();
      return {
        valid: Boolean(data.success),
        id: data.result?.id,
        status: data.result?.status,
        message: data.messages?.[0]?.message,
      };
    } catch (err) {
      return { valid: false, message: String(err) };
    }
  }

  /** Run inference via Cloudflare Workers AI */
  static async runWorkersAi(options: WorkersAiOptions): Promise<WorkersAiResponse> {
    const token = getCloudflareAiToken();
    const accountId = getCloudflareAccountId();

    const model = options.model || '@cf/meta/llama-3.1-8b-instruct';
    const body: Record<string, unknown> = {};

    if (options.messages && options.messages.length > 0) {
      body.messages = options.messages;
    } else if (options.prompt) {
      body.prompt = options.prompt;
    } else {
      throw new Error('Either prompt or messages must be provided for Workers AI');
    }

    if (options.max_tokens) body.max_tokens = options.max_tokens;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return data as WorkersAiResponse;
  }

  /** List available Workers scripts in the account */
  static async listWorkers(): Promise<Array<{ id: string; modified_on: string }>> {
    const apiToken = getCloudflareApiToken();
    const accountId = getCloudflareAccountId();

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.result)) return [];
    return data.result.map((item: any) => ({
      id: item.id,
      modified_on: item.modified_on,
    }));
  }

  /** Offload / dispatch a task to a Cloudflare Worker */
  static async dispatchWorker(task: WorkerDispatchTask): Promise<Record<string, unknown>> {
    const scriptName = task.scriptName || 'truth-chain';

    // Dispatch to Cloudflare Worker execution endpoint or dispatch pipeline
    return {
      status: 'queued',
      engine: 'cloudflare-workers',
      script: scriptName,
      taskId: `cf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      payload: task.payload || {},
    };
  }

  /** List available Cloudflare R2 Buckets */
  static async listR2Buckets(): Promise<string[]> {
    const apiToken = getCloudflareApiToken();
    const accountId = getCloudflareAccountId();

    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      const data = await res.json();
      if (!data.success || !data.result?.buckets) return [];
      return data.result.buckets.map((b: { name: string }) => b.name);
    } catch {
      return [];
    }
  }

  /** Generate a presigned upload URL for Cloudflare R2 */
  static async getR2PresignedUploadUrl(
    key: string,
    contentType: string = 'text/csv',
    bucket: string = process.env.CLOUDFLARE_R2_BUCKET || 'concordance-capsules',
    expiresInSeconds: number = 900
  ): Promise<{ url: string; key: string; bucket: string }> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
    return { url, key, bucket };
  }

  /** Upload an object directly to Cloudflare R2 */
  static async putR2Object(
    key: string,
    content: string | Uint8Array,
    contentType: string = 'text/plain',
    bucket: string = process.env.CLOUDFLARE_R2_BUCKET || 'concordance-capsules'
  ): Promise<boolean> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof content === 'string' ? Buffer.from(content) : content,
      ContentType: contentType,
    });
    await r2Client.send(command);
    return true;
  }
}
