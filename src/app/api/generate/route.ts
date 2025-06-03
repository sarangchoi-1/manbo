import { NextResponse } from 'next/server';
import openai from '@/lib/openai';

interface GenerateRequest {
  prompt: string;
}

export async function POST(request: Request) {
  const body: GenerateRequest = await request.json();

  if (!body.prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: body.prompt }],
      max_tokens: 150,
    });

    return NextResponse.json({ result: response.choices[0].message.content });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}