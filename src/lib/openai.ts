import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeWithOpenAI(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string = "gpt-3.5-turbo",
  max_tokens: number = 500
) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens,
  });
  return response.choices[0].message?.content;
}

export default openai;