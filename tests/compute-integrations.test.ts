import { expect, test, describe } from 'bun:test';
import { CloudflareService } from '../lib/integrations/cloudflare';
import { KaggleClusterService } from '../lib/integrations/kaggle';
import { GET as computeGet, POST as computePost } from '../app/api/compute/offload/route';
import { POST as presignPost } from '../app/api/upload/presign/route';

describe('Compute & Cloudflare & Kaggle Multi-Account Integrations', () => {
  test('KaggleClusterService loads all 3 accounts from environment', () => {
    const accounts = KaggleClusterService.getAccounts();
    expect(accounts.length).toBeGreaterThanOrEqual(3);

    const usernames = accounts.map((a) => a.username);
    expect(usernames).toContain('tap4500');
    expect(usernames).toContain('tap919beats');
    expect(usernames).toContain('ncsound919');
  });

  test('KaggleClusterService round-robin selects accounts across consecutive dispatches', () => {
    const acc1 = KaggleClusterService.selectAccount();
    const acc2 = KaggleClusterService.selectAccount();
    const acc3 = KaggleClusterService.selectAccount();

    expect(acc1.username).toBeDefined();
    expect(acc2.username).toBeDefined();
    expect(acc3.username).toBeDefined();

    // Specific account request overrides round-robin
    const explicit = KaggleClusterService.selectAccount('ncsound919');
    expect(explicit.username).toBe('ncsound919');
  });

  test('Kaggle kernel job dispatch formats tracking ID and kernel slug', async () => {
    const job = await KaggleClusterService.dispatchKernelJob({
      kernelSlug: 'test-audit-kernel',
      isGpu: true,
      account: 'tap919beats',
    });

    expect(job.status).toBe('queued');
    expect(job.engine).toBe('kaggle-cluster');
    expect(job.dispatchedAccount).toBe('tap919beats');
    expect(job.gpuEnabled).toBe(true);
    expect(String(job.kernelSlug)).toContain('tap919beats/test-audit-kernel');
    expect(String(job.trackingId)).toContain('kg_tap919beats_');
  });

  test('Cloudflare R2 presigned URL generation produces signed S3-compatible URL', async () => {
    const presign = await CloudflareService.getR2PresignedUploadUrl(
      'tests/sample_predictions.csv',
      'text/csv',
      'concordance-capsules'
    );

    expect(presign.url).toContain('https://');
    expect(presign.url).toContain('r2.cloudflarestorage.com');
    expect(presign.url).toContain('X-Amz-Signature');
    expect(presign.key).toBe('tests/sample_predictions.csv');
    expect(presign.bucket).toBe('concordance-capsules');
  });

  test('Cloudflare Worker dispatch structures queued execution payload', async () => {
    const dispatch = await CloudflareService.dispatchWorker({
      scriptName: 'truth-chain',
      payload: { claim_id: 'clm_123', metric: 'auc' },
    });

    expect(dispatch.status).toBe('queued');
    expect(dispatch.engine).toBe('cloudflare-workers');
    expect(dispatch.script).toBe('truth-chain');
    expect(dispatch.taskId).toBeDefined();
  });

  test('GET /api/compute/offload returns backend verification report', async () => {
    const res = await computeGet();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.backends).toBeDefined();
    expect(body.backends.kaggle.totalConfigured).toBeGreaterThanOrEqual(3);
    expect(body.backends.cloudflare.r2Buckets).toBeDefined();
  });

  test('POST /api/compute/offload routes to Kaggle cluster with account allocation', async () => {
    const req = new Request('http://localhost/api/compute/offload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'kaggle',
        task: {
          kernelName: 'eval-pipeline-audit',
          isGpu: true,
          account: 'ncsound919',
        },
      }),
    });

    const res = await computePost(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.result.status).toBe('queued');
    expect(body.result.dispatchedAccount).toBe('ncsound919');
    expect(body.result.gpuEnabled).toBe(true);
  });

  test('POST /api/compute/offload routes to Cloudflare worker dispatch', async () => {
    const req = new Request('http://localhost/api/compute/offload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'cloudflare',
        task: {
          scriptName: 'truth-chain',
          payload: { action: 'audit_validation' },
        },
      }),
    });

    const res = await computePost(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.result.status).toBe('queued');
    expect(body.result.engine).toBe('cloudflare-workers');
    expect(body.result.script).toBe('truth-chain');
  });

  test('POST /api/upload/presign supports Cloudflare R2 storage option', async () => {
    const req = new Request('http://localhost/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: 'text/csv',
        fileSize: 1024,
        storage: 'r2',
      }),
    });

    const res = await presignPost(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.url).toContain('r2.cloudflarestorage.com');
    expect(body.storage).toBe('cloudflare-r2');
    expect(body.key).toContain('uploads/');
  });
});
