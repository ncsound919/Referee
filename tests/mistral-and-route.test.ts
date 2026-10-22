/**
 * mistral-and-route.test.ts
 *
 * The Mistral lane has two behaviours that were never exercised:
 *
 *  - `getMistralResponse` fails over to the secondary account only when a
 *    secondary key exists, and otherwise surfaces the original error. A silent
 *    fallback to an invented answer would be worse than a failure.
 *  - `/api/mistral/generate` pins the model, caps the prompt length, and turns
 *    an SDK failure into a 500 with the reason, never into a fake completion.
 *
 * The two exported clients have their `chat.complete` replaced for the duration
 * of this file, so no test here touches the network or needs a key, and the
 * result does not depend on which file imported the client first.
 */
import { afterAll, afterEach, describe, expect, test } from 'bun:test';

const mistralModule = await import('../lib/integrations/mistral');
const { POST: mistralPost } = await import('../app/api/mistral/generate/route');

interface MistralCall {
  instance: number;
  model: string;
  content: string;
}

interface FakeRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

type Complete = (request: FakeRequest) => Promise<unknown>;

const mistral: {
  calls: MistralCall[];
  failInstances: number[];
  failWith: unknown;
  reply: string;
  withChoices: boolean;
} = {
  calls: [],
  failInstances: [],
  failWith: new Error('primary account unavailable'),
  reply: 'ok',
  withChoices: true,
};

/** The exported clients, in the order the module creates them. */
const CLIENTS = [mistralModule.mistralClient, mistralModule.mistralClientAlt];

const originals = CLIENTS.map((client) => ({
  client,
  complete: (client.chat as unknown as { complete: Complete }).complete,
}));

CLIENTS.forEach((client, index) => {
  const instance = index + 1;
  (client.chat as unknown as { complete: Complete }).complete = async (request) => {
    mistral.calls.push({ instance, model: request.model, content: request.messages[0]?.content ?? '' });
    if (mistral.failInstances.includes(instance)) throw mistral.failWith;
    return mistral.withChoices ? { choices: [{ message: { content: mistral.reply } }] } : {};
  };
});

afterAll(() => {
  for (const { client, complete } of originals) {
    (client.chat as unknown as { complete: Complete }).complete = complete;
  }
});

afterEach(() => {
  mistral.calls = [];
  mistral.failInstances = [];
  mistral.failWith = new Error('primary account unavailable');
  mistral.reply = 'ok';
  mistral.withChoices = true;
});

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) previous.set(key, process.env[key]);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/mistral/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// getMistralResponse
// ---------------------------------------------------------------------------

describe('getMistralResponse', () => {
  test('uses the primary account and the documented default model', async () => {
    const response = await mistralModule.getMistralResponse('summarise this claim');

    expect(response as unknown).toEqual({ choices: [{ message: { content: 'ok' } }] });
    expect(mistral.calls).toHaveLength(1);
    expect(mistral.calls[0].instance).toBe(1);
    expect(mistral.calls[0].model).toBe('mistral-large-latest');
    expect(mistral.calls[0].content).toBe('summarise this claim');
  });

  test('forwards a caller-chosen model', async () => {
    await mistralModule.getMistralResponse('short', 'mistral-small-latest');
    expect(mistral.calls[0].model).toBe('mistral-small-latest');
  });

  test('fails over to the secondary account when one is configured', async () => {
    mistral.failInstances = [1];

    await withEnv({ MISTRAL_API_KEY_ALT: 'secondary-key' }, async () => {
      await mistralModule.getMistralResponse('audit this');
    });

    expect(mistral.calls.map((c) => c.instance)).toEqual([1, 2]);
    expect(mistral.calls[1].content).toBe('audit this');
  });

  test('re-raises the primary error when there is no secondary account', async () => {
    mistral.failInstances = [1];

    await withEnv({ MISTRAL_API_KEY_ALT: undefined }, async () => {
      await expect(mistralModule.getMistralResponse('audit this')).rejects.toThrow('primary account unavailable');
    });

    expect(mistral.calls).toHaveLength(1);
  });

  test('a secondary account that also fails surfaces its own error', async () => {
    mistral.failInstances = [1, 2];
    mistral.failWith = new Error('all accounts unavailable');

    await withEnv({ MISTRAL_API_KEY_ALT: 'secondary-key' }, async () => {
      await expect(mistralModule.getMistralResponse('audit this')).rejects.toThrow('all accounts unavailable');
    });

    expect(mistral.calls.map((c) => c.instance)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/mistral/generate
// ---------------------------------------------------------------------------

describe('POST /api/mistral/generate', () => {
  test('refuses an empty prompt', async () => {
    const res = await mistralPost(post({ prompt: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('required');
  });

  test('refuses a prompt that is not a string', async () => {
    const res = await mistralPost(post({ prompt: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('required');
  });

  test('refuses a prompt longer than the cap', async () => {
    const res = await mistralPost(post({ prompt: 'x'.repeat(4001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('maximum allowed limit of 4000');
  });

  test('returns the completion and pins the model', async () => {
    mistral.reply = 'The claim is not reproducible.';
    const res = await mistralPost(post({ prompt: 'Interpret these results' }));

    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe('The claim is not reproducible.');
    expect(mistral.calls).toHaveLength(1);
    expect(mistral.calls[0].model).toBe('mistral-large-latest');
    expect(mistral.calls[0].content).toBe('Interpret these results');
  });

  test('answers "No response" when the completion carries no content', async () => {
    mistral.withChoices = false;
    const res = await mistralPost(post({ prompt: 'Interpret these results' }));
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe('No response');
  });

  test('turns an SDK failure into a 500 with the reason', async () => {
    mistral.failInstances = [1];
    const res = await mistralPost(post({ prompt: 'Interpret these results' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to call Mistral API');
    expect(body.details).toContain('primary account unavailable');
  });

  test('reports a non-Error failure as text', async () => {
    mistral.failInstances = [1];
    mistral.failWith = 'socket closed';
    const res = await mistralPost(post({ prompt: 'Interpret these results' }));

    expect(res.status).toBe(500);
    expect((await res.json()).details).toBe('socket closed');
  });

  test('answers 500 for a body that is not JSON', async () => {
    const res = await mistralPost(
      new Request('http://localhost/api/mistral/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      })
    );
    expect(res.status).toBe(500);
  });
});
