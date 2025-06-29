import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeWithOpenAI(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string = "gpt-3.5-turbo"
) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });
  return response.choices[0].message?.content;
}

export default openai;