import { Mistral } from '@mistralai/mistralai';

// Primary & Alt Mistral clients
export const mistralClient = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || '',
});

export const mistralClientAlt = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY_ALT || process.env.MISTRAL_API_KEY || '',
});

/**
 * Execute chat completion with automated fallback to secondary Mistral account
 */
export async function getMistralResponse(prompt: string, model: string = 'mistral-large-latest') {
  try {
    return await mistralClient.chat.complete({
      model: model,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    if (process.env.MISTRAL_API_KEY_ALT) {
      return await mistralClientAlt.chat.complete({
        model: model,
        messages: [{ role: 'user', content: prompt }],
      });
    }
    throw err;
  }
}
