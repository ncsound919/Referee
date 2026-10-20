import { expect, test, describe } from 'bun:test';

describe('Integration Test: New API Routes', () => {
  const BASE_URL = 'http://localhost:3000';

  test('S3 Presign Upload Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/upload/presign`, {
      method: 'POST',
      body: JSON.stringify({ key: 'test-key.json', contentType: 'application/json' }),
    });
    // This expects to fail in this environment because AWS credentials are not set,
    // but the route should be reachable and return 500
    expect(res.status).toBe(500); 
  });

  test('Mistral Generation Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/mistral/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Hello' }),
    });
    expect(res.status).toBe(500);
  });

  test('Compute Offload Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/compute/offload`, {
      method: 'POST',
      body: JSON.stringify({ target: 'cloudflare', task: { id: 'test' } }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.status).toBe('queued');
  });
});
