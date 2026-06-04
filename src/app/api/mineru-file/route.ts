import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { verifyMineruFileSignature } from "@/lib/ai/mineru-file-url";

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    const encodedPath = request.nextUrl.searchParams.get("path");
    const expiresRaw = request.nextUrl.searchParams.get("expires");
    const signature = request.nextUrl.searchParams.get("sig");
    const displayName = request.nextUrl.searchParams.get("name");

    if (!encodedPath || !expiresRaw || !signature) {
      return NextResponse.json({ error: "缺少签名参数" }, { status: 400 });
    }

    const filePath = decodeBase64Url(encodedPath);
    const expiresAt = Number(expiresRaw);
    const verifiedPath = verifyMineruFileSignature(filePath, expiresAt, signature);

    if (!fs.existsSync(verifiedPath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const stat = fs.statSync(verifiedPath);
    const fileName = displayName || path.basename(verifiedPath);
    const stream = Readable.toWeb(fs.createReadStream(verifiedPath));

    return new NextResponse(stream as BodyInit, {
      headers: {
        "Content-Type": contentTypeFor(fileName),
        "Content-Length": String(stat.size),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件链接无效";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
