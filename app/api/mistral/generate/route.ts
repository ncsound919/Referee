import { NextResponse } from 'next/server';
import { mistralClient } from '@/lib/integrations/mistral';

export async function POST(req: Request) {
  const { prompt, model = 'mistral-large-latest' } = await req.json();

  try {
    const chatResponse = await mistralClient.chat.complete({
      model: model,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = chatResponse.choices?.[0]?.message?.content || 'No response';
    return NextResponse.json({ text: content });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to call Mistral API' }, { status: 500 });
  }
}
