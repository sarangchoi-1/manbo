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
    const userPrompt = "Please analyze this file and provide a summary.";
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: `You are an assistant helping with analysis of this file:\n\n${fileContent}` },
      { role: "user", content: userPrompt }
    ];
    const analysis = await analyzeWithOpenAI(messages);

    const chatHistory = [
      { role: "user", content: userPrompt },
      { role: "assistant", content: analysis }
    ];

    return NextResponse.json({
      analysis,
      fileContent,
      chatHistory
    });
  }

  if (file.type === "application/zip") {
    // Decompress the zip and extract .txt files
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    const extractedFiles: string[] = [];

    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.endsWith(".txt")) {
        const content = entry.getData();
        const outPath = path.join(uploadsDir, entry.entryName);
        await fs.writeFile(outPath, content);
        extractedFiles.push(entry.entryName);
      }
    }

    if (extractedFiles.length === 0) {
      return NextResponse.json({
        analysis: "",
        fileContent: "",
        chatHistory: [],
        message: "No .txt files found in the zip."
      });
    }

    return NextResponse.json({
      analysis: "",
      fileContent: "",
      chatHistory: [],
      message: "Zip uploaded and .txt files extracted.",
      files: extractedFiles
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
