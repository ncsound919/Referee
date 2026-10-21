import { expect, test, describe } from 'bun:test';
import { POST as presignPost } from '../app/api/upload/presign/route';
import { POST as mistralPost } from '../app/api/mistral/generate/route';
import { POST as offloadPost } from '../app/api/compute/offload/route';

describe('Integration Unit Tests: API Routes without live server', () => {
  test('S3 Presign Upload Endpoint rejects unpermitted content types', async () => {
    const req = new Request('http://localhost/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'malicious.exe', contentType: 'application/x-msdownload' }),
    });

    const res = await presignPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('not permitted');
  });

  test('S3 Presign Upload Endpoint enforces file size cap', async () => {
    const req = new Request('http://localhost/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: 'text/csv',
        fileSize: 100 * 1024 * 1024, // 100MB > 50MB cap
      }),
    });

    const res = await presignPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('maximum limit');
  });

  test('Mistral Generation Endpoint rejects empty prompt', async () => {
    const req = new Request('http://localhost/api/mistral/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });

    const res = await mistralPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  test('Compute Offload Endpoint rejects invalid targets', async () => {
    const req = new Request('http://localhost/api/compute/offload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'unapproved_target', task: { id: 'test' } }),
    });

    const res = await offloadPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid compute offload target');
  });

  test('Compute Offload Endpoint accepts allowed targets', async () => {
    const req = new Request('http://localhost/api/compute/offload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'cloudflare', task: { id: 'test' } }),
    });

    const res = await offloadPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.status).toBe('queued');
  });
});
