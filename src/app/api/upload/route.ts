import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { analyzeWithOpenAI } from "@/lib/openai"; // Make sure this is correct
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

  if (file.type === "text/plain") {
    // Save and read the file content
    const filePath = path.join(process.cwd(), "public", "uploads", file.name);
    await fs.writeFile(filePath, buffer);
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Analyze with OpenAI
    const userPrompt = `아래 채팅방 대화 기록을 보고, 다음 세 가지 방식으로 분석해 줘.  
분석 결과는 꼭 한국어로, 그리고 AI나 챗봇처럼 딱딱하거나 너무 친절하게 쓰지 말고, 요즘 20~30대가 친구들끼리 장난치듯이, 유행어랑 밈, 드립, 그리고 재치 있는 농담을 섞어서 써 줘.  
특히, 각 인물의 성격을 분석할 때는 그 사람이 실제로 쓴 말투, 자주 쓰는 단어, 대화에서 보인 행동(예: 드립력, 감정 표현 등)을 근거로, 실제 성격과 최대한 비슷하게 묘사해 줘.  
설명할 때는 꼭 그 인물이 했던 말이나 행동을 예시로 들어 주되, 반드시 그 성격이나 특징을 잘 보여주는, 실제로 관련 있는 대화 내용만 사용해 줘.  
분석과 직접적으로 연결되지 않는 아무 채팅이나 예시로 들지 말고, 꼭 관련 있는 대화만 골라서 써 줘.  
너무 과장하거나 뻔한 분석은 피하고, 실제 대화에서 드러난 특징을 중심으로 해 줘.

1. 인물 성격 분석  
채팅방에 나온 인물(별명/이름 등) 각각의 성격을, 실제 대화에서 보인 특징을 근거로, 유명한 캐릭터(예: 인사이드 아웃의 버럭이, 겨울왕국의 올라프, 무한도전 박명수, 런닝맨 유재석 등)에 빗대서 재밌게 설명해 줘.  
예시:  
- "철수는 진짜 버럭이 그 자체임. '아니 이건 아니지!' 이런 식으로 자주 버럭하는데, 다들 철수 나오면 긴장함 ㅋㅋ"  
- "영희는 올라프 느낌. '다 괜찮아~' 이런 말 자주 하고, 분위기 풀어주는 역할 담당."  
- "민지는 박명수st. '야 그거 아니거든?' 이런 식으로 투덜대면서도, 은근 챙겨주는 거 있음."  
- "준호는 유재석 느낌. 대화 주도하고, 다들 잘 챙기는데, 가끔 드립 치면 다 터짐 ㅋㅋ"

2. 시상식(어워즈)  
채팅방 멤버들에게 재밌는 상을 줘. 유행어나 밈, 예능 스타일로, 실제 대화에서 보인 특징을 근거로 해 줘.  
예시:  
- "최다 웃음상: 민수 (ㅋㅋ, ㅎㅎ 남발. 이 정도면 웃음 공장장임)"  
- "밈 장인상: 지현 (유행어 장착 완료, 밈 없으면 대화 못 함 ㅋㅋ)"  
- "눈치 제로상: 수빈 (상황 파악 못 하고 혼자 딴소리하는 거 국보급)"

3. IF(만약에)  
채팅방 멤버들을 대상으로 엉뚱하고 재밌는 가정 질문을 던지고, 실제 대화에서 보인 특징을 반영해서 답변해 줘.  
예시:  
- "만약 이 채팅방 사람들이 모두 고양이라면, 민수가 제일 먼저 캣타워 찜함. 이유? '야 나 먼저!' 이런 말 자주 하거든 ㅋㅋ"  
- "이 채팅방에서 대통령 뽑으면? 지현 당선 확정. 이유는? 말빨로 다 씹어먹음 ㄹㅇ"  
- "다 같이 아이돌 그룹 하면, 수빈은 무조건 비주얼 담당인데, 춤은... 음... 그냥 웃겨서 담당 ㅋㅋ"

아래 채팅방 대화 기록을 분석해서, 위 세 가지 방식(1. 인물 성격 분석, 2. 시상식, 3. IF)에 따라 각각 결과를 JSON 객체로만 반환해 줘.  
반드시 JSON 객체만 반환해 줘.  
예시 형식:  
{  
  "character_analysis": [ ... ],  
  "awards": [ ... ],  
  "if_category": [ ... ]  
}

채팅방 대화 기록:
"""
${fileContent}
"""
`;
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

    let analysis;
    try {
      analysis = JSON.parse(analysisRaw);
    } catch {
      analysis = { error: "Failed to parse analysis JSON", raw: analysisRaw };
    }

    const chatHistory = [
      { role: "user", content: userPrompt },
      { role: "assistant", content: analysisRaw }
    ];

    return NextResponse.json({
      analysis,
      fileContent,
      chatHistory,
      s3Url
    });
  }

  if (file.type === "application/zip") {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    const analyses: { file: string, content: string, analysis: string }[] = [];

    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.endsWith(".txt")) {
        const content = entry.getData().toString("utf-8");
        // Analyze with OpenAI
        const userPrompt = `아래 채팅방 대화 기록을 보고, 다음 세 가지 방식으로 분석해 줘.  
분석 결과는 꼭 한국어로, 그리고 AI나 챗봇처럼 딱딱하거나 너무 친절하게 쓰지 말고, 요즘 20~30대가 친구들끼리 장난치듯이, 유행어랑 밈, 드립, 그리고 재치 있는 농담을 섞어서 써 줘.  
특히, 각 인물의 성격을 분석할 때는 그 사람이 실제로 쓴 말투, 자주 쓰는 단어, 대화에서 보인 행동(예: 드립력, 감정 표현 등)을 근거로, 실제 성격과 최대한 비슷하게 묘사해 줘.  
설명할 때는 꼭 그 인물이 했던 말이나 행동을 예시로 들어 주되, 반드시 그 성격이나 특징을 잘 보여주는, 실제로 관련 있는 대화 내용만 사용해 줘.  
분석과 직접적으로 연결되지 않는 아무 채팅이나 예시로 들지 말고, 꼭 관련 있는 대화만 골라서 써 줘.  
너무 과장하거나 뻔한 분석은 피하고, 실제 대화에서 드러난 특징을 중심으로 해 줘.

1. 인물 성격 분석  
채팅방에 나온 인물(별명/이름 등) 각각의 성격을, 실제 대화에서 보인 특징을 근거로, 유명한 캐릭터(예: 인사이드 아웃의 버럭이, 겨울왕국의 올라프, 무한도전 박명수, 런닝맨 유재석 등)에 빗대서 재밌게 설명해 줘.  
예시:  
- "철수는 진짜 버럭이 그 자체임. '아니 이건 아니지!' 이런 식으로 자주 버럭하는데, 다들 철수 나오면 긴장함 ㅋㅋ"  
- "영희는 올라프 느낌. '다 괜찮아~' 이런 말 자주 하고, 분위기 풀어주는 역할 담당."  
- "민지는 박명수st. '야 그거 아니거든?' 이런 식으로 투덜대면서도, 은근 챙겨주는 거 있음."  
- "준호는 유재석 느낌. 대화 주도하고, 다들 잘 챙기는데, 가끔 드립 치면 다 터짐 ㅋㅋ"

2. 시상식(어워즈)  
채팅방 멤버들에게 재밌는 상을 줘. 유행어나 밈, 예능 스타일로, 실제 대화에서 보인 특징을 근거로 해 줘.  
예시:  
- "최다 웃음상: 민수 (ㅋㅋ, ㅎㅎ 남발. 이 정도면 웃음 공장장임)"  
- "밈 장인상: 지현 (유행어 장착 완료, 밈 없으면 대화 못 함 ㅋㅋ)"  
- "눈치 제로상: 수빈 (상황 파악 못 하고 혼자 딴소리하는 거 국보급)"

3. IF(만약에)  
채팅방 멤버들을 대상으로 엉뚱하고 재밌는 가정 질문을 던지고, 실제 대화에서 보인 특징을 반영해서 답변해 줘.  
예시:  
- "만약 이 채팅방 사람들이 모두 고양이라면, 민수가 제일 먼저 캣타워 찜함. 이유? '야 나 먼저!' 이런 말 자주 하거든 ㅋㅋ"  
- "이 채팅방에서 대통령 뽑으면? 지현 당선 확정. 이유는? 말빨로 다 씹어먹음 ㄹㅇ"  
- "다 같이 아이돌 그룹 하면, 수빈은 무조건 비주얼 담당인데, 춤은... 음... 그냥 웃겨서 담당 ㅋㅋ"

아래 채팅방 대화 기록을 분석해서, 위 세 가지 방식(1. 인물 성격 분석, 2. 시상식, 3. IF)에 따라 각각 결과를 JSON 객체로만 반환해 줘.  
반드시 JSON 객체만 반환해 줘.  
예시 형식:  
{  
  "character_analysis": [ ... ],  
  "awards": [ ... ],  
  "if_category": [ ... ]  
}

채팅방 대화 기록:
"""
${content}
"""
`;
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

        let analysis;
        try {
          analysis = JSON.parse(analysisRaw);
        } catch {
          analysis = { error: "Failed to parse analysis JSON", raw: analysisRaw };
        }
        analyses.push({ file: entry.entryName, content, analysis });
      }
    }

    if (analyses.length === 0) {
      return NextResponse.json({
        analysis: "",
        fileContent: "",
        chatHistory: [],
        message: "No .txt files found in the zip."
      });
    }

    return NextResponse.json({
      analysis: analyses, // array of { file, content, analysis }
      fileContent: analyses.length === 1 ? analyses[0].content : "",
      chatHistory: [],
      message: "Zip uploaded and .txt files analyzed.",
      files: analyses.map(a => a.file),
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
