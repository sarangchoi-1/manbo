import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { analyzeWithOpenAI } from "@/lib/openai"; // Make sure this is correct
import { OpenAI } from "openai";

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
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  if (file.type === "text/plain") {
    // Save and read the file content
    const filePath = path.join(uploadsDir, file.name);
    await fs.writeFile(filePath, buffer);
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Analyze with OpenAI
    const userPrompt = `아래의 채팅방 대화 기록을 바탕으로 세 가지 방식으로 분석해 주세요.  
**분석 결과는 반드시 한국어로, 그리고 AI나 챗봇처럼 딱딱하거나 친절하게 쓰지 말고, 요즘 유행하는 밈, 드립, 유행어, 과장, 장난스러운 말투, 그리고 재치 있는 농담을 적극적으로 활용해서 작성해 주세요.**  
분석은 마치 20대 한국인이 친구들끼리 장난치듯이, 웃기고 트렌디하게, 그리고 가끔은 약간의 뼈 있는 농담도 섞어서 해주세요.  
절대 정중하거나 설명조로 쓰지 말고, 너무 착하거나 무난하게 쓰지 마세요.  
(예: "~입니다", "~하세요" 대신 "ㅋㅋ", "ㄹㅇ", "이건 무조건~", "이 친구는 진짜~", "찐으로~", "이건 레전드" 등등)

1. 인물 성격 분석  
채팅방에 등장하는 인물(별명/이름 등)의 성격을 분석해 주세요. 각 인물이 어떤 성격을 가지고 있는지, 그리고 유명한 캐릭터(예: 인사이드 아웃의 버럭이, 겨울왕국의 올라프 등)에 비유해서 설명해 주세요.  
예시:  
- "철수는 인사이드 아웃의 버럭이처럼 다혈질임. 진짜 화수분임 ㅋㅋ 대화하다가 갑자기 버럭하는 거 레전드"  
- "영희는 올라프 그 자체. 긍정 에너지 뿜뿜, 분위기 메이커 인정~"

2. 시상식(어워즈) 카테고리  
채팅방 인물들에게 재미있는 상을 수여해 주세요. 한국의 유행이나 밈, 예능 스타일을 반영해서 유쾌하게 작성해 주세요.  
예시:  
- "최다 웃음상: 민수 (ㅋㅋ, ㅎㅎ 남발러. 이 정도면 웃음 공장장임)"  
- "밈 장인상: 지현 (유행어 장착 완료, 밈 없으면 대화 못 함 ㅋㅋ)"  
- "눈치 제로상: 수빈 (상황 파악 못 하고 혼자 딴소리하는 거 국보급)"

3. IF(만약에) 카테고리  
채팅방 인물들을 대상으로 재미있고 엉뚱한 가정 질문을 던지고, 그에 대한 답변을 상상해서 작성해 주세요.  
예시:  
- "만약 이 채팅방 사람들이 모두 고양이라면, 민수가 제일 먼저 캣타워 찜함. 이유? 집사한테 간식 달라고 제일 먼저 울 듯 ㅋㅋ"  
- "이 채팅방에서 대통령 뽑으면? 지현 당선 확정. 이유는? 말빨로 다 씹어먹음 ㄹㅇ"  
- "다 같이 아이돌 그룹 하면, 수빈은 무조건 비주얼 담당인데, 춤은... 음... 그냥 웃겨서 담당 ㅋㅋ"

아래의 채팅방 대화 기록을 분석하여, 위 세 가지 방식(1. 인물 성격 분석, 2. 시상식, 3. IF 카테고리)에 따라 각각 결과를 JSON 객체로 반환해 주세요.  
반드시 JSON 객체만 반환해 주세요.  
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
      chatHistory
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
        const userPrompt = `아래의 채팅방 대화 기록을 바탕으로 세 가지 방식으로 분석해 주세요.  
**분석 결과는 반드시 한국어로, 그리고 AI나 챗봇처럼 딱딱하거나 친절하게 쓰지 말고, 요즘 유행하는 밈, 드립, 유행어, 과장, 장난스러운 말투, 그리고 재치 있는 농담을 적극적으로 활용해서 작성해 주세요.**  
분석은 마치 20대 한국인이 친구들끼리 장난치듯이, 웃기고 트렌디하게, 그리고 가끔은 약간의 뼈 있는 농담도 섞어서 해주세요.  
절대 정중하거나 설명조로 쓰지 말고, 너무 착하거나 무난하게 쓰지 마세요.  
(예: "~입니다", "~하세요" 대신 "ㅋㅋ", "ㄹㅇ", "이건 무조건~", "이 친구는 진짜~", "찐으로~", "이건 레전드" 등등)

1. 인물 성격 분석  
채팅방에 등장하는 인물(별명/이름 등)의 성격을 분석해 주세요. 각 인물이 어떤 성격을 가지고 있는지, 그리고 유명한 캐릭터(예: 인사이드 아웃의 버럭이, 겨울왕국의 올라프 등)에 비유해서 설명해 주세요.  
예시:  
- "철수는 인사이드 아웃의 버럭이처럼 다혈질임. 진짜 화수분임 ㅋㅋ 대화하다가 갑자기 버럭하는 거 레전드"  
- "영희는 올라프 그 자체. 긍정 에너지 뿜뿜, 분위기 메이커 인정~"

2. 시상식(어워즈) 카테고리  
채팅방 인물들에게 재미있는 상을 수여해 주세요. 한국의 유행이나 밈, 예능 스타일을 반영해서 유쾌하게 작성해 주세요.  
예시:  
- "최다 웃음상: 민수 (ㅋㅋ, ㅎㅎ 남발러. 이 정도면 웃음 공장장임)"  
- "밈 장인상: 지현 (유행어 장착 완료, 밈 없으면 대화 못 함 ㅋㅋ)"  
- "눈치 제로상: 수빈 (상황 파악 못 하고 혼자 딴소리하는 거 국보급)"

3. IF(만약에) 카테고리  
채팅방 인물들을 대상으로 재미있고 엉뚱한 가정 질문을 던지고, 그에 대한 답변을 상상해서 작성해 주세요.  
예시:  
- "만약 이 채팅방 사람들이 모두 고양이라면, 민수가 제일 먼저 캣타워 찜함. 이유? 집사한테 간식 달라고 제일 먼저 울 듯 ㅋㅋ"  
- "이 채팅방에서 대통령 뽑으면? 지현 당선 확정. 이유는? 말빨로 다 씹어먹음 ㄹㅇ"  
- "다 같이 아이돌 그룹 하면, 수빈은 무조건 비주얼 담당인데, 춤은... 음... 그냥 웃겨서 담당 ㅋㅋ"

아래의 채팅방 대화 기록을 분석하여, 위 세 가지 방식(1. 인물 성격 분석, 2. 시상식, 3. IF 카테고리)에 따라 각각 결과를 JSON 객체로 반환해 주세요.  
반드시 JSON 객체만 반환해 주세요.  
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
      files: analyses.map(a => a.file)
    });
  } else {
    // Save the file as usual
    const filePath = path.join(uploadsDir, file.name);
    await fs.writeFile(filePath, buffer);
    return NextResponse.json({
      analysis: "",
      fileContent: "",
      chatHistory: [],
      message: "File uploaded successfully (but not analyzed)."
    });
  }
}
