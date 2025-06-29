import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { analyzeWithOpenAI } from "@/lib/openai"; 
import { OpenAI } from "openai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Buffer } from "buffer";
import { randomUUID } from "crypto";

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

// Helper: filter out non-informative messages
function isInformativeMessage(msg: string): boolean {
  const trimmed = msg.trim();
  if (trimmed.length < 2) return false;
  const nonInformativePatterns = [
    /^ㅋ+$/, /^ㅎ+$/, /^ㅌ+$/, /^ㄷ+$/, // laughter
    /^응+$/, /^ㅇ+$/, /^ㅇㅇ+$/, /^ㄴㄴ+$/, // short agreements
    /^네+$/, /^아니+$/, /^웅+$/, /^헐+$/, /^오+$/, /^아+$/, /^음+$/, /^흠+$/, /^헉+$/,
    /^[?!.,~]+$/, // just punctuation
    /^([ㅋㅎㅌㄷ]+)+$/, // repeated laughter
    /^([0-9]+)$/,
  ];
  for (const pattern of nonInformativePatterns) {
    if (pattern.test(trimmed)) return false;
  }
  if (trimmed.length < 4) return false;
  return true;
}

// Helper: collect up to 3 informative messages per member from a chat chunk
function collectMemberMessages(chat: string): Record<string, string[]> {
  const memberMessages: Record<string, string[]> = {};
  const lines = chat.split('\n');
  const messageRegex = /^(\S+)\s*:\s*(.+)$/; // e.g., "철수: 메시지"
  for (const line of lines) {
    const match = line.match(messageRegex);
    if (match) {
      const name = match[1];
      const message = match[2];
      if (!isInformativeMessage(message)) continue;
      if (!memberMessages[name]) memberMessages[name] = [];
      if (memberMessages[name].length < 3) {
        memberMessages[name].push(message);
      }
    }
  }
  return memberMessages;
}

// Helper: merge member messages across chunks, limit to 3 per member
function mergeMemberMessages(
  all: Record<string, string[]>,
  chunk: Record<string, string[]>
): Record<string, string[]> {
  for (const [name, msgs] of Object.entries(chunk)) {
    if (!all[name]) all[name] = [];
    all[name].push(...msgs);
    all[name] = Array.from(new Set(all[name])).slice(0, 3); // dedupe, limit to 3
  }
  return all;
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

  // Generate unique chatId
  const originalName = file.name.replace(/\.[^/.]+$/, "");
  const timestamp = Date.now();
  const uniqueId = randomUUID();
  const chatId = `${originalName}_${timestamp}_${uniqueId}`;

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

    // Collect representative messages per member across all chunks
    let allMemberMessages: Record<string, string[]> = {};
    for (const chunk of chunks) {
      const chunkMessages = collectMemberMessages(chunk);
      allMemberMessages = mergeMemberMessages(allMemberMessages, chunkMessages);
    }

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
        // Standardize explanation key
        if (typeof summaryObj === "object" && summaryObj !== null) {
          const obj = summaryObj as Record<string, unknown>;
          if ("reasoning" in obj && !("explanation" in obj)) {
            obj.explanation = obj.reasoning;
            delete obj.reasoning;
          }
          if ("reason" in obj && !("explanation" in obj)) {
            obj.explanation = obj.reason;
            delete obj.reason;
          }
        }

        // Read awards topics
        const awardsTopicsPath = path.join(process.cwd(), "src", "data", "awards_topics.json");
        const awardsTopicsRaw = await fs.readFile(awardsTopicsPath, "utf-8");
        const awardsTopics: string[] = JSON.parse(awardsTopicsRaw);

        // 3. For character/awards, use only the last chunk (limit to 5,000 chars)
        const lastChunk = chunks[chunks.length - 1];
        const safeLastChunk = lastChunk.length > 5000 ? lastChunk.slice(-5000) : lastChunk;

        // Step 1: Character assignment (no evidence yet)
        const characterAssignPrompt = `아래 채팅방 대화 기록을 보고, 멤버별 캐릭터 매칭만 해 줘.\n\n조건:\n- 반드시 채팅방에 등장하는 모든 멤버 각각에 대해, 아래 캐릭터 중 가장 비슷한 캐릭터 하나만 선택해. (멤버를 절대 빼먹지 마!)\n- 선택한 이유는 짧고 재치 있게 써 줘.\n- JSON 배열로만 반환해. (예: [ { \"name\": \"철수\", \"character\": \"버럭이\", \"reason\": \"진짜 화수분임. 대화하다가 갑자기 버럭하는 거 레전드야 그냥\" }, ... ])\n\n캐릭터 목록:\n${characterSummaries}\n\n채팅방 대화 기록:\n"""\n${safeLastChunk}\n"""`;
        const characterAssignMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that analyzes chat logs and returns character assignments as a JSON array." },
          { role: "user", content: characterAssignPrompt }
        ];
        const characterAssignRaw = await analyzeWithOpenAI(characterAssignMessages) ?? "";
        let characterAssignArr: { name: string; character: string; reason: string }[] = [];
        if (typeof characterAssignRaw === "string") {
          let cleaned = characterAssignRaw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          try {
            characterAssignArr = JSON.parse(cleaned);
          } catch {
            // Try to recover the largest valid JSON array substring
            const firstBracket = cleaned.indexOf('[');
            const lastBracket = cleaned.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
              const possibleJson = cleaned.slice(firstBracket, lastBracket + 1);
              try {
                characterAssignArr = JSON.parse(possibleJson);
              } catch {
                characterAssignArr = [];
              }
            }
          }
        }
        // Ensure all members are included in characterAssignArr
        const allChat = chunks.join('\n');
        const allMemberMessagesForAssignment = collectMemberMessages(allChat);
        const allMembers = Object.keys(allMemberMessagesForAssignment);
        const assignedNames = new Set(characterAssignArr.map(c => c.name));
        for (const member of allMembers) {
          if (!assignedNames.has(member)) {
            characterAssignArr.push({
              name: member,
              character: '분석 불가',
              reason: '메시지가 부족하거나 분석이 불가합니다.'
            });
          }
        }

        // Assign characterImage in a round-robin fashion (1.png~4.png)
        const imageCount = 4;
        characterAssignArr = characterAssignArr.map((c, idx) => ({
          ...c,
          characterImage: `/images/${(idx % imageCount) + 1}.png`
        }));

        // Step 2: Skip evidence extraction for speed. Use characterAssignArr directly.

        // Step 3: Awards for all topics
        const allAwardsResults: { topic: string; awards: { rank: number; name: string; reason: string }[] }[] = await Promise.all(
          awardsTopics.map(async (topic) => {
            const awardsPrompt = `아래 채팅방 대화 기록을 보고, "${topic}"에 대한 단톡방 시상식(awards)만 해 줘.\n\n조건:\n- 반드시 1~3등까지만 주고, 채팅방에서의 특징을 찰지게 드립으로 설명\n- 진지한 감상 ❌, 웃긴 과장/반전 드립 환영\n- 말투는 \"얘는 거의 00상 줘야 함ㅋㅋ\", \"존재 자체가 이벤트임\" 등 자유롭게\n- 반드시 아래 형식의 JSON 배열로만 반환해. (예: [ { \"rank\": 1, \"name\": \"주형우\", \"reason\": \"감정이입 장인, 드립치다가도 갑자기 감성 폭발.\" }, ... ])\n\n채팅방 대화 기록:\n"""\n${safeLastChunk}\n"""`;
            const awardsMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
              { role: "system", content: "You are an assistant that analyzes chat logs and returns awards as a JSON array." },
              { role: "user", content: awardsPrompt }
            ];
            const awardsRaw = await analyzeWithOpenAI(awardsMessages) ?? "";
            let awardsArr: { rank: number; name: string; reason: string }[] = [];
            if (typeof awardsRaw === "string") {
              let cleaned = awardsRaw.trim();
              cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
              try {
                awardsArr = JSON.parse(cleaned);
              } catch {
                // Try to recover the largest valid JSON array substring
                const firstBracket = cleaned.indexOf('[');
                const lastBracket = cleaned.lastIndexOf(']');
                if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                  const possibleJson = cleaned.slice(firstBracket, lastBracket + 1);
                  try {
                    awardsArr = JSON.parse(possibleJson);
                  } catch {
                    awardsArr = [];
                  }
                }
              }
            }
            return { topic, awards: awardsArr };
          })
        );

        // Merge summary and character/awards analysis
        const mergedResult: Record<string, unknown> = typeof summaryObj === 'object' && summaryObj !== null ? summaryObj as Record<string, unknown> : {};
        mergedResult.character_analysis = characterAssignArr;
        mergedResult.awards = allAwardsResults;

        // Log the final analysis result for debugging
        console.log("[ANALYSIS_RESULT]", JSON.stringify(mergedResult, null, 2));

        // Save only allAwardsResults to S3 (not mergedResult)
        const resultsJson = JSON.stringify(allAwardsResults, null, 2);
        const s3Key = `awards_results/${chatId}.json`;
        const putCommand = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: resultsJson,
          ContentType: "application/json",
        });
        await s3.send(putCommand);

        return NextResponse.json({
          analysis: mergedResult,
          fileContent,
          chatHistory: [],
          s3Url,
          chatId
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

        // Collect representative messages per member across all chunks
        let allMemberMessages: Record<string, string[]> = {};
        for (const chunk of chunks) {
          const chunkMessages = collectMemberMessages(chunk);
          allMemberMessages = mergeMemberMessages(allMemberMessages, chunkMessages);
        }

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
        // Standardize explanation key (zip)
        if (typeof summaryObj === "object" && summaryObj !== null) {
          const obj = summaryObj as Record<string, unknown>;
          if ("reasoning" in obj && !("explanation" in obj)) {
            obj.explanation = obj.reasoning;
            delete obj.reasoning;
          }
          if ("reason" in obj && !("explanation" in obj)) {
            obj.explanation = obj.reason;
            delete obj.reason;
          }
        }

        // Read awards topics
        const awardsTopicsPath = path.join(process.cwd(), "src", "data", "awards_topics.json");
        const awardsTopicsRaw = await fs.readFile(awardsTopicsPath, "utf-8");
        const awardsTopics: string[] = JSON.parse(awardsTopicsRaw);

        // 3. For character/awards, use only the last chunk (limit to 5,000 chars)
        const lastChunk = chunks[chunks.length - 1];
        const safeLastChunk = lastChunk.length > 5000 ? lastChunk.slice(-5000) : lastChunk;

        // Step 1: Character assignment (no evidence yet)
        const characterAssignPrompt = `아래 채팅방 대화 기록을 보고, 멤버별 캐릭터 매칭만 해 줘.\n\n조건:\n- 반드시 채팅방에 등장하는 모든 멤버 각각에 대해, 아래 캐릭터 중 가장 비슷한 캐릭터 하나만 선택해. (멤버를 절대 빼먹지 마!)\n- 선택한 이유는 재치 있게 두 문장 써 줘.\n- JSON 배열로만 반환해. (예: [ { \"name\": \"철수\", \"character\": \"버럭이\", \"reason\": \"진짜 화수분임. 대화하다가 갑자기 버럭하는 거 레전드야 그냥\" }, ... ])\n\n캐릭터 목록:\n${characterSummaries}\n\n채팅방 대화 기록:\n"""\n${safeLastChunk}\n"""`;
        const characterAssignMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an assistant that analyzes chat logs and returns character assignments as a JSON array." },
          { role: "user", content: characterAssignPrompt }
        ];
        const characterAssignRaw = await analyzeWithOpenAI(characterAssignMessages) ?? "";
        let characterAssignArr: { name: string; character: string; reason: string }[] = [];
        if (typeof characterAssignRaw === "string") {
          let cleaned = characterAssignRaw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          try {
            characterAssignArr = JSON.parse(cleaned);
          } catch {
            // Try to recover the largest valid JSON array substring
            const firstBracket = cleaned.indexOf('[');
            const lastBracket = cleaned.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
              const possibleJson = cleaned.slice(firstBracket, lastBracket + 1);
              try {
                characterAssignArr = JSON.parse(possibleJson);
              } catch {
                characterAssignArr = [];
              }
            }
          }
        }
        // Ensure all members are included in characterAssignArr (zip)
        const allChat = chunks.join('\n');
        const allMemberMessagesForAssignment = collectMemberMessages(allChat);
        const allMembers = Object.keys(allMemberMessagesForAssignment);
        const assignedNames = new Set(characterAssignArr.map(c => c.name));
        for (const member of allMembers) {
          if (!assignedNames.has(member)) {
            characterAssignArr.push({
              name: member,
              character: '분석 불가',
              reason: '메시지가 부족하거나 분석이 불가합니다.'
            });
          }
        }

        // Assign characterImage in a round-robin fashion (1.png~4.png) for zip
        const imageCount = 4;
        characterAssignArr = characterAssignArr.map((c, idx) => ({
          ...c,
          characterImage: `/images/${(idx % imageCount) + 1}.png`
        }));

        // Step 2: Skip evidence extraction for speed. Use characterAssignArr directly.

        // Step 3: Awards for all topics
        const allAwardsResults: { topic: string; awards: { rank: number; name: string; reason: string }[] }[] = await Promise.all(
          awardsTopics.map(async (topic) => {
            const awardsPrompt = `아래 채팅방 대화 기록을 보고, "${topic}"에 대한 단톡방 시상식(awards)만 해 줘.\n\n조건:\n- 반드시 1~3등까지만 주고, 채팅방에서의 특징을 찰지게 드립으로 설명\n- 진지한 감상 ❌, 웃긴 과장/반전 드립 환영\n- 말투는 \"얘는 거의 00상 줘야 함ㅋㅋ\", \"존재 자체가 이벤트임\" 등 자유롭게\n- 반드시 아래 형식의 JSON 배열로만 반환해. (예: [ { \"rank\": 1, \"name\": \"주형우\", \"reason\": \"감정이입 장인, 드립치다가도 갑자기 감성 폭발.\" }, ... ])\n\n채팅방 대화 기록:\n"""\n${safeLastChunk}\n"""`;
            const awardsMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
              { role: "system", content: "You are an assistant that analyzes chat logs and returns awards as a JSON array." },
              { role: "user", content: awardsPrompt }
            ];
            const awardsRaw = await analyzeWithOpenAI(awardsMessages) ?? "";
            let awardsArr: { rank: number; name: string; reason: string }[] = [];
            if (typeof awardsRaw === "string") {
              let cleaned = awardsRaw.trim();
              cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
              try {
                awardsArr = JSON.parse(cleaned);
              } catch {
                // Try to recover the largest valid JSON array substring
                const firstBracket = cleaned.indexOf('[');
                const lastBracket = cleaned.lastIndexOf(']');
                if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                  const possibleJson = cleaned.slice(firstBracket, lastBracket + 1);
                  try {
                    awardsArr = JSON.parse(possibleJson);
                  } catch {
                    awardsArr = [];
                  }
                }
              }
            }
            return { topic, awards: awardsArr };
          })
        );

        // Merge summary and character/awards analysis
        const mergedResult: Record<string, unknown> = typeof summaryObj === 'object' && summaryObj !== null ? summaryObj as Record<string, unknown> : {};
        mergedResult.character_analysis = characterAssignArr;
        mergedResult.awards = allAwardsResults;

        // Log the zip analysis result for debugging
        console.log("[ANALYSIS_RESULT] (zip)", JSON.stringify(mergedResult, null, 2));

        // Save only allAwardsResults to S3 (not mergedResult) for zip
        const resultsJson = JSON.stringify(allAwardsResults, null, 2);
        const s3Key = `awards_results/${chatId}.json`;
        const putCommand = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: resultsJson,
          ContentType: "application/json",
        });
        await s3.send(putCommand);

        return NextResponse.json({
          analysis: mergedResult,
          fileContent: content,
          chatHistory: [],
          message: `Zip uploaded and first .txt file (${entry.entryName}) analyzed.`,
          file: entry.entryName,
          s3Url,
          chatId
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

