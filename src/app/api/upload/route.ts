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

    // Chunking for large files
    const maxChars = 20000;
    const chunks = splitIntoChunks(fileContent, maxChars);

    // 1. Summarize each chunk
    const chunkSummaries: string[] = await Promise.all(
      chunks.map(async (chunk) => {
        const chunkPrompt = `너는 요즘 드립 장인 + 틱톡 밈 편집러야.  
내가 넣어주는 카카오톡 채팅방 내용을 보고, 그 방을 한 문장으로 요약해.

**절대 지키길 바라는 조건은 다음과 같아:**

1. 반드시 **짧고 웃긴 한 문장만** 써 줘. (길게 설명 금지)  
2. "이 방은", "이 채팅방은" 같은 서론 금지 
3. **이모지 금지**, **감상적인 표현 금지**, **분석 느낌 금지**  
4. "~인 듯", "~같다", "웃음도 상승 중" 같은 말투 금지 (재미없고 흐름 끊김)  
5. **요즘 유행하는 드립/짤 말투**로, 딱 보고 피식하게  
6. **말도 안 되게 과장하거나** 갑자기 튀는 비유 쓰면 더 좋음  
7. **비속어, 민감한 주제**는 절대 쓰지 마

그리고 마지막에, 왜 그렇게 요약했는지 아주 짧게 설명해 줘.
####

채팅방 대화 기록:
"""
${chunk}
"""`;
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
          { role: "user", content: chunkPrompt }
        ];
        const chunkSummaryRaw = await analyzeWithOpenAI(messages) ?? "";
        let cleaned = typeof chunkSummaryRaw === "string" ? chunkSummaryRaw.trim() : "";
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        return cleaned;
      })
    );

    // 2. Combine chunk summaries into a final summary
    const finalPrompt = `아래는 각 부분 요약이야. 이걸 참고해서 전체 채팅방을 대표하는 한 문장으로 요약해 줘.

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

아래는 부분 요약이야:
${chunkSummaries.join("\n")}
`;
        const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
          { role: "user", content: finalPrompt }
        ];
        const summaryRaw = await analyzeWithOpenAI(finalMessages) ?? "";
        let summaryObj: unknown = summaryRaw;
        if (typeof summaryRaw === "string") {
          let cleaned = summaryRaw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          try {
            summaryObj = JSON.parse(cleaned);
          } catch {
            summaryObj = { error: "Failed to parse summary JSON", raw: summaryRaw };
          }
        }

        // 3. For character/awards, use only the last chunk (limit to 5,000 chars)
        const lastChunk = chunks[chunks.length - 1];
        const safeLastChunk = lastChunk.length > 5000 ? lastChunk.slice(-5000) : lastChunk;
        const characterPrompt = `아래 채팅방 대화 기록을 보고, 멤버별 캐릭터 매칭과 단톡방 시상식만 해 줘.

2. 멤버별 캐릭터 매칭
너는 지금부터 성격 분석가이자, 드립 장인 짤 생성기야.

내가 주는 채팅방 대화와 멤버들(별명/이름 등)의 목록을 보고,  
각 멤버가 아래 캐릭터 중 누구랑 가장 비슷한지 골라줘.

근데 그냥 "비슷하다"는 식으로 말하면 재미없어.  
무조건 **드립을 섞어서 재치 있고 웃기게** 설명해 줘야 해.

조건은 아래와 같아:
a. **채팅방에 등장하는 모든 멤버 각각에 대해**, 가장 비슷한 캐릭터 하나만 선택해. (멤버를 절대 빼먹지 마!)  
b. 선택한 이유는 **웃기고, 캐릭터에 빙의하거나 말투를 패러디해서 써 줘.**  
   (예: “이 친구는 거의 스폰지밥임. 이유? 아무 말 하고 다 웃음.” / “얘는 얼어붙은 엘사 그 자체. 감정 표현이 -50도야.”)  
c. 너무 길지 않게, **재치 있는 한두 문장**으로 설명  
d. **진지한 분석, 감성적인 말투, 과도한 설명은 금지**  
e. 욕설, 성적인 표현, 민감한 주제는 절대 금지  

이런 식으로 **캐릭터랑 대화 특징을 오버랩** 시켜서 재밌게 연결해줘.
캐릭터 목록:
${characterSummaries}

3. 단톡방 시상식
아래 시상식 주제(예: "${safeLastChunk.slice(0, 100)}...")를 참고해서, 채팅방 멤버 각각의 순위를 매기고, 그 이유를 유쾌하고 재치있게 써 줘.

**시상식 순위(awards)는 반드시 1~3등까지만** 주고, **채팅방에서의 특징을 찰지게 드립으로 설명**  
- 진지한 감상 ❌, 웃긴 과장/반전 드립 환영  
- 말투는 "얘는 거의 00상 줘야 함ㅋㅋ", "존재 자체가 이벤트임" 등 자유롭게

아래 채팅방 대화 기록과 시상식 주제를 참고해서, 위 두 가지를 JSON 객체로만 반환해 줘.
반드시 JSON 객체만 반환해 줘. (최대한 짧고 간결하게!)
**절대 JSON 포맷을 바꾸면 안 되고**,  
안의 내용은 **유쾌하고 웃기고 드립력 충만하게** 써 줘야 해.

예시 형식:
{
  "character_analysis": [
    { "name": "철수", "character": "버럭이", "reason": "진짜 화수분임. 대화하다가 갑자기 버럭하는 거 레전드야 그냥" },
    { "name": "영희", "character": "올라프", "reason": "긍정 에너지 뿜뿜, 분위기 메이커 굿" }
  ],
  "awards": [
    { "rank": 1, "name": "주형우", "reason": "감정이입 장인, 드립치다가도 갑자기 감성 폭발." },
    { "rank": 2, "name": "이재현", "reason": "겉으론 쿨한 척하지만, 속으론 이미 울고 있을듯,,," },
    { "rank": 3, "name": "김철수", "reason": "존재 자체가 이벤트임ㅋㅋ" }
  ]
}

채팅방 대화 기록:
"""
${safeLastChunk}
"""`;
        const characterMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that analyzes chat logs and returns character/awards analysis as a JSON object." },
          { role: "user", content: characterPrompt }
        ];
        const characterRaw = await analyzeWithOpenAI(characterMessages) ?? "";
        let characterObj: unknown = characterRaw;
        if (typeof characterRaw === "string") {
          let cleaned = characterRaw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          console.log('[CHARACTER_RAW_BEFORE_PARSE]', cleaned);
          try {
            characterObj = JSON.parse(cleaned);
          } catch {
            // Try to recover the largest valid JSON substring
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const possibleJson = cleaned.slice(firstBrace, lastBrace + 1);
              try {
                characterObj = JSON.parse(possibleJson);
              } catch {
                characterObj = { error: "Failed to parse character JSON", raw: characterRaw };
              }
            } else {
              characterObj = { error: "Failed to parse character JSON", raw: characterRaw };
            }
          }
        }

        // Merge summary and character/awards analysis
        let mergedResult: Record<string, unknown> = typeof summaryObj === 'object' && summaryObj !== null ? summaryObj as Record<string, unknown> : {};
        if (typeof characterObj === "object" && characterObj !== null) {
          mergedResult = { ...mergedResult, ...characterObj as Record<string, unknown> };
        }

        // Log the final analysis result for debugging
        console.log("[ANALYSIS_RESULT]", JSON.stringify(mergedResult, null, 2));

        return NextResponse.json({
          analysis: mergedResult,
          fileContent,
          chatHistory: [],
          s3Url
        });
  }

  if (file.type === "application/zip") {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.endsWith(".txt")) {
        const content = entry.getData().toString("utf-8");
        // Chunking for large files
        const maxChars = 20000;
        const chunks = splitIntoChunks(content, maxChars);

        // 1. Summarize each chunk
        const chunkSummaries: string[] = await Promise.all(
          chunks.map(async (chunk) => {
            const chunkPrompt = `너는 요즘 드립 장인 + 틱톡 밈 편집러야.  
내가 넣어주는 카카오톡 채팅방 내용을 보고, 그 방을 한 문장으로 요약해.

**절대 지키길 바라는 조건은 다음과 같아:**

1. 반드시 **짧고 웃긴 한 문장만** 써 줘. (길게 설명 금지)  
2. "이 방은", "이 채팅방은" 같은 서론 금지  
3. **이모지 금지**, **감상적인 표현 금지**, **분석 느낌 금지**  
4. "~인 듯", "~같다", "웃음도 상승 중" 같은 말투 금지 (재미없고 흐름 끊김)  
5. **요즘 유행하는 드립/짤 말투**로, 딱 보고 피식하게  
6. **말도 안 되게 과장하거나** 갑자기 튀는 비유 쓰면 더 좋음  
7. **비속어, 민감한 주제**는 절대 쓰지 마
8. **느낌표 금지**

그리고 마지막에, 왜 그렇게 요약했는지 아주 짧게 설명해 줘.
####

채팅방 대화 기록:
"""
${chunk}
"""`;
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
              { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
              { role: "user", content: chunkPrompt }
            ];
            const chunkSummaryRaw = await analyzeWithOpenAI(messages) ?? "";
            let cleaned = typeof chunkSummaryRaw === "string" ? chunkSummaryRaw.trim() : "";
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
            return cleaned;
          })
        );

        // 2. Combine chunk summaries into a final summary
        const finalPrompt = `아래는 각 부분 요약이야. 이걸 참고해서 전체 채팅방을 대표하는 한 마디로 요약해 줘. 10자 이내로!

반드시 다음 조건을 지켜:
1. **한 문장만** 써. 절대 두 문장 이상 쓰지 마.  
2. "이 방은", "이 채팅방은" 같은 서론 금지
3. **이모지 금지**, **감상적인 말투 금지**, **분석 같은 문장 금지**  
4. "~인 듯", "~같다", "웃음도 상승 중" 같은 마무리 금지 (재미없고 분위기 식음)  
5. **요즘 유행하는 드립, 짤 말투, 짧고 임팩트 있는 표현**으로 써 줘  
6. **비속어, 성적인 내용, 생리 관련 등 민감한 소재는 절대 금지**  
7. 상황을 **과장하거나, 의외성 있게 비틀면 좋음**
8. **느낌표 금지**

그리고 마지막엔, 왜 그런 문장이 나왔는지 **아주 짧게** 한두 문장으로 설명해 줘.  
대화 내용 중 반복되거나 튀는 특징을 근거로 설명해.

아래는 부분 요약이야:
${chunkSummaries.join("\n")}
`;
        const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that summarizes chat logs in a funny, meme-like way and returns a JSON object." },
          { role: "user", content: finalPrompt }
        ];
        const summaryRaw = await analyzeWithOpenAI(finalMessages) ?? "";
        let summaryObj: unknown = summaryRaw;
        if (typeof summaryRaw === "string") {
          let cleaned = summaryRaw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          try {
            summaryObj = JSON.parse(cleaned);
          } catch {
            summaryObj = { error: "Failed to parse summary JSON", raw: summaryRaw };
          }
        }

        // 3. For character/awards, use only the last chunk (limit to 5,000 chars)
        const lastChunk = chunks[chunks.length - 1];
        const safeLastChunk = lastChunk.length > 5000 ? lastChunk.slice(-5000) : lastChunk;
        const characterPrompt = `아래 채팅방 대화 기록을 보고, 멤버별 캐릭터 매칭과 단톡방 시상식만 해 줘.

2. 멤버별 캐릭터 매칭
너는 지금부터 성격 분석가이자, 드립 장인 짤 생성기야.

내가 주는 채팅방 대화와 멤버들(별명/이름 등)의 목록을 보고,  
각 멤버가 아래 캐릭터 중 누구랑 가장 비슷한지 골라줘.

근데 그냥 "비슷하다"는 식으로 말하면 재미없어.  
무조건 **드립을 섞어서 재치 있고 웃기게** 설명해 줘야 해.

조건은 아래와 같아:
a. **채팅방에 등장하는 모든 멤버 각각에 대해**, 가장 비슷한 캐릭터 하나만 선택해. (멤버를 절대 빼먹지 마!)  
b. 선택한 이유는 **웃기고, 캐릭터에 빙의하거나 말투를 패러디해서 써 줘.**  
   (예: "이 친구는 거의 스폰지밥임. 이유? 아무 말 하고 다 웃음." / "얘는 얼어붙은 엘사 그 자체. 감정 표현이 -50도야.")  
c. 너무 길지 않게, **재치 있는 한두 문장**으로 설명  
d. **진지한 분석, 감성적인 말투, 과도한 설명은 금지**  
e. 욕설, 성적인 표현, 민감한 주제는 절대 금지  

이런 식으로 **캐릭터랑 대화 특징을 오버랩** 시켜서 재밌게 연결해줘.
캐릭터 목록:
${characterSummaries}

3. 단톡방 시상식
아래 시상식 주제(예: "${safeLastChunk.slice(0, 100)}...")를 참고해서, 채팅방 멤버 각각의 순위를 매기고, 그 이유를 유쾌하고 재치있게 써 줘.

**시상식 순위(awards)는 반드시 1~3등까지만** 주고, **채팅방에서의 특징을 찰지게 드립으로 설명**  
- 진지한 감상 ❌, 웃긴 과장/반전 드립 환영  
- 말투는 "얘는 거의 00상 줘야 함ㅋㅋ", "존재 자체가 이벤트임" 등 자유롭게

아래 채팅방 대화 기록과 시상식 주제를 참고해서, 위 두 가지를 JSON 객체로만 반환해 줘.
반드시 JSON 객체만 반환해 줘. (최대한 짧고 간결하게!)
**절대 JSON 포맷을 바꾸면 안 되고**,  
안의 내용은 **유쾌하고 웃기고 드립력 충만하게** 써 줘야 해.

예시 형식:
{
  "character_analysis": [
    { "name": "철수", "character": "버럭이", "reason": "진짜 화수분임. 대화하다가 갑자기 버럭하는 거 레전드야 그냥" },
    { "name": "영희", "character": "올라프", "reason": "긍정 에너지 뿜뿜, 분위기 메이커 굿" }
  ],
  "awards": [
    { "rank": 1, "name": "주형우", "reason": "감정이입 장인, 드립치다가도 갑자기 감성 폭발." },
    { "rank": 2, "name": "이재현", "reason": "겉으론 쿨한 척하지만, 속으론 이미 울고 있을듯,,," },
    { "rank": 3, "name": "김철수", "reason": "존재 자체가 이벤트임ㅋㅋ" }
  ]
}

채팅방 대화 기록:
"""
${safeLastChunk}
"""`;
        const characterMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that analyzes chat logs and returns character/awards analysis as a JSON object." },
          { role: "user", content: characterPrompt }
        ];
        const characterRaw = await analyzeWithOpenAI(characterMessages) ?? "";
        let characterObj: unknown = characterRaw;
        if (typeof characterRaw === "string") {
          let cleaned = characterRaw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          console.log('[CHARACTER_RAW_BEFORE_PARSE]', cleaned);
          try {
            characterObj = JSON.parse(cleaned);
          } catch {
            // Try to recover the largest valid JSON substring
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const possibleJson = cleaned.slice(firstBrace, lastBrace + 1);
              try {
                characterObj = JSON.parse(possibleJson);
              } catch {
                characterObj = { error: "Failed to parse character JSON", raw: characterRaw };
              }
            } else {
              characterObj = { error: "Failed to parse character JSON", raw: characterRaw };
            }
          }
        }

        // Merge summary and character/awards analysis
        let mergedResult: Record<string, unknown> = typeof summaryObj === 'object' && summaryObj !== null ? summaryObj as Record<string, unknown> : {};
        if (typeof characterObj === "object" && characterObj !== null) {
          mergedResult = { ...mergedResult, ...characterObj as Record<string, unknown> };
        }

        // Log the zip analysis result for debugging
        console.log("[ANALYSIS_RESULT] (zip)", JSON.stringify(mergedResult, null, 2));
        return NextResponse.json({
          analysis: mergedResult,
          fileContent: content,
          chatHistory: [],
          message: `Zip uploaded and first .txt file (${entry.entryName}) analyzed.`,
          file: entry.entryName,
          s3Url
        });
      }
    }

    // If no .txt file found in the zip
    return NextResponse.json({
      analysis: "",
      fileContent: "",
      chatHistory: [],
      message: "No .txt files found in the zip.",
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

