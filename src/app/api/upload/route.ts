import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { analyzeWithOpenAI } from "@/lib/openai"; 
import { OpenAI } from "openai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Buffer } from "buffer";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function uploadToS3(fileBuffer: Buffer, fileName: string, mimeType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: fileName,
    Body: fileBuffer,
    ContentType: mimeType,
  });
  await s3.send(command);
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

// to be implemented later
// const charactersPath = path.join(process.cwd(), "src", "data", "characters.json");
// const charactersRaw = await fs.readFile(charactersPath, "utf-8");
// const characters = JSON.parse(charactersRaw) as { name: string, work: string, traits: string[], description: string }[];

// Helper function to split text into chunks
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({
      analysis: "",
      fileContent: "",
      chatHistory: [],
      error: "No file uploaded"
    }, { status: 400 });
  }

  const allowedTypes = [
    "text/plain", // .txt
    "text/csv",   // .csv
    "application/vnd.ms-excel",
    "application/zip" // .zip
  ];

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({
      analysis: "",
      fileContent: "",
      chatHistory: [],
      error: "Only .txt, .csv, and .zip files are allowed"
    }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Upload to S3
  const s3Url = await uploadToS3(buffer, file.name, file.type);

  // Load characters summary for prompt (move this up, before file type checks)
  const charactersPath = path.join(process.cwd(), "src", "data", "characters.json");
  const charactersRaw = await fs.readFile(charactersPath, "utf-8");
  const characters: { name: string; traits: string[]; description: string }[] = JSON.parse(charactersRaw);
  const characterSummaries = characters.map((c) => `이름: ${c.name}, 특징: ${c.traits.join(", ")}, 설명: ${c.description}`).join("\n");

  if (file.type === "text/plain") {
    // Save and read the file content
    const filePath = path.join(process.cwd(), "public", "uploads", file.name);
    await fs.writeFile(filePath, buffer);
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Chunked summarization (parallelized)
    const maxChars = 20000;
    const chunks = splitIntoChunks(fileContent, maxChars);
    const chunkSummaries: string[] = await Promise.all(
      chunks.map(async (chunk) => {
        const chunkPrompt = `아래 채팅방 대화 기록을 한 문장으로 요약해 줘. (조건: 임팩트 있고, 밈/드립/짤 느낌, '이 방은' 없이, 진짜 웃기게, 이유도 한두 문장으로! 절대 이모지(😂, ✈️, 🍜 등)나 특수문자(!!, ?? 등)는 쓰지 마. 생리, 성, 의료 등 민감하거나 불쾌할 수 있는 주제(예: 생리대, 임신, 성 관련 단어)는 절대 언급하지 마.)\n\n채팅방 대화 기록:\n"""\n${chunk}\n"""`;
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
          { role: "user", content: chunkPrompt }
        ];
        let chunkSummaryRaw = await analyzeWithOpenAI(messages) ?? "";
        chunkSummaryRaw = chunkSummaryRaw.trim();
        if (chunkSummaryRaw.startsWith("```json")) {
          chunkSummaryRaw = chunkSummaryRaw.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (chunkSummaryRaw.startsWith("```")) {
          chunkSummaryRaw = chunkSummaryRaw.replace(/^```/, "").replace(/```$/, "").trim();
        }
        return chunkSummaryRaw;
      })
    );
    // Step 1: Extract key points/topics from chunk summaries
    const keyPointsPrompt = `아래 여러 부분 요약을 보고, 각 부분에서 빠지지 않고 반복되거나, 독특하게 등장한 특징/밈/사건을 최대한 많이 뽑아서 리스트로 만들어 줘. 그리고 채팅방에서 가장 많이 언급된 주제(키워드)도 따로 리스트로 뽑아 줘.
부분 요약들:
${chunkSummaries.join("\n")}
`;
    const keyPointsMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: "You are an assistant that extracts key points and topics from chat summaries." },
      { role: "user", content: keyPointsPrompt }
    ];
    let keyPointsRaw = await analyzeWithOpenAI(keyPointsMessages) ?? "";
    keyPointsRaw = keyPointsRaw.trim();
    if (keyPointsRaw.startsWith("```json")) {
      keyPointsRaw = keyPointsRaw.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (keyPointsRaw.startsWith("```")) {
      keyPointsRaw = keyPointsRaw.replace(/^```/, "").replace(/```$/, "").trim();
    }
    // Step 2: Final summary using key points
    const finalPrompt = `너는 요즘 유행하는 짤, 드립, 틱톡 자막 스타일로 대화방을 요약하는 드립 장인이야.

아래 리스트(핵심 포인트/주제)를 참고해서, 각 부분에서 반복되거나 중요한 특징/밈/사건이 빠지지 않게, 전체 채팅방을 대표하는 한 문장으로 요약해 줘.

반드시 다음 조건을 지켜:
1. **한 문장만** 써. 절대 두 문장 이상 쓰지 마.  
2. "이 방은", "이 채팅방은" 같은 서론 금지
3. **이모지 금지**, **감상적인 말투 금지**, **분석 같은 문장 금지**  
4. "~인 듯", "~같다", "웃음도 상승 중" 같은 마무리 금지 (재미없고 분위기 식음)  
5. **요즘 유행하는 드립, 짤 말투, 짧고 임팩트 있는 표현**으로 써 줘  
6. **비속어, 성적인 내용, 생리 관련 등 민감한 소재는 절대 금지**  
7. 상황을 **과장하거나, 의외성 있게 비틀면 좋음**

그리고 마지막엔, 왜 그런 문장이 나왔는지 **아주 짧게** 한두 문장으로 설명해 줘.  
대화 내용 중 반복되거나 튀는 특징을 근거로 설명해.

아래는 부분 요약에서 뽑은 핵심 포인트/주제야:
${keyPointsRaw}
`;
    const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
      { role: "user", content: finalPrompt }
    ];
    let finalSummaryRaw = await analyzeWithOpenAI(finalMessages) ?? "";
    if (typeof finalSummaryRaw === "string") {
      finalSummaryRaw = finalSummaryRaw.trim();
      if (finalSummaryRaw.startsWith("```json")) {
        finalSummaryRaw = finalSummaryRaw.replace(/^```json/, "").replace(/```$/, "").trim();
      } else if (finalSummaryRaw.startsWith("```")) {
        finalSummaryRaw = finalSummaryRaw.replace(/^```/, "").replace(/```$/, "").trim();
      }
    }
    let finalSummaryObj;
    try {
      finalSummaryObj = JSON.parse(finalSummaryRaw);
    } catch {
      finalSummaryObj = { error: "Failed to parse summary JSON", raw: finalSummaryRaw };
    }

    // For character/awards, use last chunk as before
    const truncatedChat = chunks[chunks.length - 1];

    // Analyze with OpenAI
    const userPrompt = `아래 채팅방 대화 기록을 분석해서, 다음 세 가지를 해 줘.

1. 이 채팅방을 한 마디로 요약
채팅방의 분위기, 특징, 밈, 대화 스타일을 한 문장(짧고 임팩트 있게, 요즘 유행하는 드립/밈/유행어/짤 느낌으로)으로 요약해 줘.
(반드시 한국어로, 그리고 진짜 웃기게 써 줘야 해.
"이 방은", "이 채팅방은" 등과 같은 말은 빼고, 바로 임팩트 있는 한 문장만 써 줘!
예: "배고픔이 부른 우정의 연대기")
그리고, 왜 그런 요약이 나왔는지 한두 문장으로 재치있게 이유도 써 줘.
(실제 대화 내용, 분위기, 멤버들의 특징 등을 근거로!)

2. 멤버별 캐릭터 매칭
아래 캐릭터 목록에서, 채팅방에 등장하는 각 멤버(별명/이름 등)마다 실제 대화에서 보인 특징을 근거로 가장 비슷한 캐릭터를 골라, 그 이유를 재치있고 웃기게 설명해 줘.

캐릭터 목록:
${characterSummaries}

3. 단톡방 시상식
아래 시상식 주제(예: "${truncatedChat}")를 참고해서, 채팅방 멤버 각각의 순위를 매기고, 그 이유를 유쾌하고 재치있게 써 줘.

아래 채팅방 대화 기록과 시상식 주제를 참고해서, 위 세 가지를 JSON 객체로만 반환해 줘.
반드시 JSON 객체만 반환해 줘.
예시 형식:
{
  "summary": "배고픔이 부른 우정의 연대기",
  "summary_reason": "대화 내내 배고프다는 얘기만 하다가 결국 야식 메뉴까지 정함. 우정도 배고픔 앞에선 한 팀!",
  "character_analysis": [
    { "name": "철수", "character": "버럭이", "reason": "진짜 화수분임. 대화하다가 갑자기 버럭하는 거 레전드 ㅋㅋ" },
    { "name": "영희", "character": "올라프", "reason": "긍정 에너지 뿜뿜, 분위기 메이커 인정~" },
    { "name": "지현", "character": "퉁퉁퉁 사후르", "reason": "갑자기 분위기 띄우는 드립러, 대화에 '퉁퉁퉁~' 느낌으로 튀어나옴 ㅋㅋ" }
  ],
  "awards": [
    { "rank": 1, "name": "주형우", "reason": "감정이입 장인, 드립치다가도 갑자기 감성 폭발." },
    { "rank": 2, "name": "이재현", "reason": "겉으론 쿨한 척하지만, 속으론 이미 울고 있음" },
    { "rank": 3, "name": "곽규민", "reason": "티는 안 내지만, 집에 가서 몰래 운다 ㅋㅋㅠㅠ" }
  ]
}

채팅방 대화 기록:
"""
${truncatedChat}
"""

시상식 주제:
"""
${truncatedChat}
"""
`;
    console.log("Prompt length (chars):", userPrompt.length);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: "You are an assistant that analyzes text files in multiple ways and returns a JSON object." },
      { role: "user", content: userPrompt }
    ];
    let analysisRaw = await analyzeWithOpenAI(messages) ?? "";

    // Remove Markdown code block if present
    if (typeof analysisRaw === "string") {
      analysisRaw = analysisRaw.trim();
      if (analysisRaw.startsWith("```json")) {
        analysisRaw = analysisRaw.replace(/^```json/, "").replace(/```$/, "").trim();
      } else if (analysisRaw.startsWith("```")) {
        analysisRaw = analysisRaw.replace(/^```/, "").replace(/```$/, "").trim();
      }
    }

    const chatHistory = [
      { role: "user", content: userPrompt },
      { role: "assistant", content: analysisRaw }
    ];

    return NextResponse.json({
      analysis: finalSummaryObj,
      fileContent,
      chatHistory,
      s3Url
    });
  }

  if (file.type === "application/zip") {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    let firstAnalysis = null;
    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.endsWith(".txt")) {
        const content = entry.getData().toString("utf-8");
        // Chunked summarization (parallelized)
        const maxChars = 20000;
        const chunks = splitIntoChunks(content, maxChars);
        const chunkSummaries: string[] = await Promise.all(
          chunks.map(async (chunk) => {
            const chunkPrompt = `아래 채팅방 대화 기록을 한 문장으로 요약해 줘. (조건: 임팩트 있고, 밈/드립/짤 느낌, '이 방은' 없이, 진짜 웃기게, 이유도 한두 문장으로! 절대 이모지(😂, ✈️, 🍜 등)나 특수문자(!!, ?? 등)는 쓰지 마. 생리, 성, 의료 등 민감하거나 불쾌할 수 있는 주제(예: 생리대, 임신, 성 관련 단어)는 절대 언급하지 마.)\n\n채팅방 대화 기록:\n"""\n${chunk}\n"""`;
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
              { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
              { role: "user", content: chunkPrompt }
            ];
            let chunkSummaryRaw = await analyzeWithOpenAI(messages) ?? "";
            chunkSummaryRaw = chunkSummaryRaw.trim();
            if (chunkSummaryRaw.startsWith("```json")) {
              chunkSummaryRaw = chunkSummaryRaw.replace(/^```json/, "").replace(/```$/, "").trim();
            } else if (chunkSummaryRaw.startsWith("```")) {
              chunkSummaryRaw = chunkSummaryRaw.replace(/^```/, "").replace(/```$/, "").trim();
            }
            return chunkSummaryRaw;
          })
        );
        // Step 1: Extract key points/topics from chunk summaries
        const keyPointsPrompt = `아래 여러 부분 요약을 보고, 각 부분에서 빠지지 않고 반복되거나, 독특하게 등장한 특징/밈/사건을 최대한 많이 뽑아서 리스트로 만들어 줘. 그리고 채팅방에서 가장 많이 언급된 주제(키워드)도 따로 리스트로 뽑아 줘.
부분 요약들:
${chunkSummaries.join("\n")}
`;
        const keyPointsMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that extracts key points and topics from chat summaries." },
          { role: "user", content: keyPointsPrompt }
        ];
        let keyPointsRaw = await analyzeWithOpenAI(keyPointsMessages) ?? "";
        keyPointsRaw = keyPointsRaw.trim();
        if (keyPointsRaw.startsWith("```json")) {
          keyPointsRaw = keyPointsRaw.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (keyPointsRaw.startsWith("```")) {
          keyPointsRaw = keyPointsRaw.replace(/^```/, "").replace(/```$/, "").trim();
        }
        // Step 2: Final summary using key points
        const finalPrompt = `너는 요즘 유행하는 짤, 드립, 틱톡 자막 스타일로 대화방을 요약하는 드립 장인이야.

아래 리스트(핵심 포인트/주제)를 참고해서, 각 부분에서 반복되거나 중요한 특징/밈/사건이 빠지지 않게, 전체 채팅방을 대표하는 한 문장으로 요약해 줘.

반드시 다음 조건을 지켜:
1. **한 문장만** 써. 절대 두 문장 이상 쓰지 마.  
2. "이 방은", "이 채팅방은" 같은 서론 금지
3. **이모지 금지**, **감상적인 말투 금지**, **분석 같은 문장 금지**  
4. "~인 듯", "~같다", "웃음도 상승 중" 같은 마무리 금지 (재미없고 분위기 식음)  
5. **요즘 유행하는 드립, 짤 말투, 짧고 임팩트 있는 표현**으로 써 줘  
6. **비속어, 성적인 내용, 생리 관련 등 민감한 소재는 절대 금지**  
7. 상황을 **과장하거나, 의외성 있게 비틀면 좋음**

그리고 마지막엔, 왜 그런 문장이 나왔는지 **아주 짧게** 한두 문장으로 설명해 줘.  
대화 내용 중 반복되거나 튀는 특징을 근거로 설명해.

아래는 부분 요약에서 뽑은 핵심 포인트/주제야:
${keyPointsRaw}
`;
        const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
          { role: "user", content: finalPrompt }
        ];
        let finalSummaryRaw = await analyzeWithOpenAI(finalMessages) ?? "";
        if (typeof finalSummaryRaw === "string") {
          finalSummaryRaw = finalSummaryRaw.trim();
          if (finalSummaryRaw.startsWith("```json")) {
            finalSummaryRaw = finalSummaryRaw.replace(/^```json/, "").replace(/```$/, "").trim();
          } else if (finalSummaryRaw.startsWith("```")) {
            finalSummaryRaw = finalSummaryRaw.replace(/^```/, "").replace(/```$/, "").trim();
          }
        }
        let finalSummaryObj;
        try {
          finalSummaryObj = JSON.parse(finalSummaryRaw);
        } catch {
          finalSummaryObj = { error: "Failed to parse summary JSON", raw: finalSummaryRaw };
        }
        // For character/awards, use last chunk as before
        //const truncatedContent = chunks[chunks.length - 1];
        firstAnalysis = { file: entry.entryName, content, analysis: finalSummaryObj };
        break; // Only process the first .txt file
      }
    }

    if (!firstAnalysis) {
      return NextResponse.json({
        analysis: "",
        fileContent: "",
        chatHistory: [],
        message: "No .txt files found in the zip.",
        s3Url
      });
    }

    return NextResponse.json({
      analysis: firstAnalysis.analysis,
      fileContent: firstAnalysis.content,
      chatHistory: [],
      message: `Zip uploaded and first .txt file (${firstAnalysis.file}) analyzed.`,
      file: firstAnalysis.file,
      s3Url
    });
  } else {
    // Save the file as usual
    const filePath = path.join(process.cwd(), "public", "uploads", file.name);
    await fs.writeFile(filePath, buffer);
    return NextResponse.json({
      analysis: "",
      fileContent: "",
      chatHistory: [],
      message: "File uploaded successfully (but not analyzed).",
      s3Url
    });
  }
}
