import crypto from "crypto";
import path from "path";

const DEFAULT_EXPIRES_SECONDS = 30 * 60;

function base64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function getSecret(): string {
  const secret = process.env.MINERU_FILE_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("MINERU_FILE_SECRET or AUTH_SECRET is required for signed file URLs");
  }
  return secret;
}

export function getUploadsRoot(): string {
  return path.resolve(process.cwd(), "uploads");
}

export function assertPathInUploads(filePath: string): string {
  const resolved = path.resolve(filePath);
  const uploadsRoot = getUploadsRoot();
  const relative = path.relative(uploadsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("文件不在 uploads 目录内，不能生成公开解析链接");
  }
  return resolved;
}

export function signMineruFilePath(filePath: string, expiresAt: number): string {
  const resolved = assertPathInUploads(filePath);
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${resolved}|${expiresAt}`)
    .digest("base64url");
}

export function verifyMineruFileSignature(filePath: string, expiresAt: number, signature: string): string {
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("链接已过期");
  }

  const expected = signMineruFilePath(filePath, expiresAt);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature || "")
    )
  ) {
    throw new Error("签名无效");
  }

  return assertPathInUploads(filePath);
}

export function createMineruSignedFileUrl(filePath: string, fileName?: string): string {
  const publicBaseUrl =
    process.env.MINERU_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL;

  if (!publicBaseUrl) {
    throw new Error("MINERU_PUBLIC_BASE_URL, NEXT_PUBLIC_APP_URL or AUTH_URL is required");
  }

  const resolved = assertPathInUploads(filePath);
  const expiresAt = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRES_SECONDS;
  const signature = signMineruFilePath(resolved, expiresAt);
  const url = new URL("/api/mineru-file", publicBaseUrl);
  url.searchParams.set("path", base64Url(resolved));
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("sig", signature);
  if (fileName) url.searchParams.set("name", fileName);
  return url.toString();
}

