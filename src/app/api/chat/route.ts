import { NextRequest, NextResponse } from "next/server";
import { analyzeWithOpenAI } from "@/lib/openai"; // You'll need to implement this

export async function POST(req: NextRequest) {
  const { fileContent, chatHistory, userMessage } = await req.json();

  // Build the message array for OpenAI
  const chatHistoryArray = Array.isArray(chatHistory) ? chatHistory : [];
  const messages = [
    { role: "system", content: `You are an assistant helping with analysis of this file:\n\n${fileContent}` },
    ...chatHistoryArray,
    { role: "user", content: userMessage }
  ];

  // Call OpenAI
  const assistantReply = await analyzeWithOpenAI(messages);

  // Add the new assistant message to history
  const updatedHistory = [
    ...chatHistoryArray,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantReply }
  ];

  return NextResponse.json({ reply: assistantReply, chatHistory: updatedHistory });
}