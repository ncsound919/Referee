import { Mistral } from '@mistralai/mistralai';

// Initialize Mistral Client
export const mistralClient = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || '',
});

// Example usage for chat completion
export async function getMistralResponse(prompt: string, model: string = 'mistral-large-latest') {
  return await mistralClient.chat.complete({
    model: model,
    messages: [{ role: 'user', content: prompt }],
  });
}
