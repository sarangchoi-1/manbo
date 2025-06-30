import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeWithOpenAI(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string = "gpt-4o"
) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: 1000,
    temperature: 0.7,
  });
  return response.choices[0].message?.content;
}

export default openai;