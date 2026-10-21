import { NextResponse } from 'next/server';
import { mistralClient } from '@/lib/integrations/mistral';

const PINNED_MODEL = 'mistral-large-latest';
const MAX_PROMPT_LENGTH = 4000;

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'A text prompt string is required' }, { status: 400 });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt length exceeds maximum allowed limit of ${MAX_PROMPT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const chatResponse = await mistralClient.chat.complete({
      model: PINNED_MODEL,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = chatResponse.choices?.[0]?.message?.content || 'No response';
    return NextResponse.json({ text: content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to call Mistral API', details: msg }, { status: 500 });
  }
}
