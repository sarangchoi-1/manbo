import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json({ error: "Missing chatId" }, { status: 400 });
  }
  const s3Key = `awards_results/${chatId}.json`;
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: s3Key,
    });
    const s3Response = await s3.send(command);
    if (!s3Response.Body) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    const bodyContents = await s3Response.Body.transformToString();
    return NextResponse.json(JSON.parse(bodyContents));
  } catch {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }
} 