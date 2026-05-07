import fs from "fs";
import path from "path";

/**
 * 图片存储服务
 *
 * 保存 MinerU 返回的 base64 图片到文件系统
 */

// 图片存储根目录
const IMAGES_DIR = path.join(process.cwd(), "uploads", "parsed-images");

/**
 * 保存图片到文件系统
 *
 * @param documentId 文档 ID
 * @param imagesData MinerU 返回的图片数据 { filename: base64Data }
 * @returns 保存的图片路径映射 { filename: relativePath }
 */
export async function saveImages(
  documentId: string,
  imagesData: Record<string, string>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  if (!imagesData || Object.keys(imagesData).length === 0) {
    return result;
  }

  // 创建文档专属目录
  const docDir = path.join(IMAGES_DIR, documentId);

  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
    console.log(`[ImageStorage] 创建目录: ${docDir}`);
  }

  // 保存每张图片
  for (const [filename, base64Data] of Object.entries(imagesData)) {
    try {
      // 解析 base64 数据
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);

      if (!matches) {
        console.warn(`[ImageStorage] 无效的 base64 格式: ${filename}`);
        continue;
      }

      const extension = matches[1]; // jpg, png, etc.
      const base64 = matches[2];

      // 保存文件
      const filePath = path.join(docDir, filename);
      const buffer = Buffer.from(base64, "base64");

      fs.writeFileSync(filePath, buffer);

      // 记录相对路径（用于 API 访问）
      const relativePath = `${documentId}/${filename}`;
      result[filename] = relativePath;

      console.log(`[ImageStorage] 保存图片: ${filename} (${buffer.length} bytes)`);
    } catch (error) {
      console.error(`[ImageStorage] 保存图片失败: ${filename}`, error);
    }
  }

  console.log(`[ImageStorage] 共保存 ${Object.keys(result).length} 张图片到 ${docDir}`);
  return result;
}

/**
 * 获取图片文件路径
 */
export function getImagePath(documentId: string, filename: string): string | null {
  const filePath = path.join(IMAGES_DIR, documentId, filename);

  if (fs.existsSync(filePath)) {
    return filePath;
  }

  return null;
}

/**
 * 获取图片存储根目录
 */
export function getImagesDir(): string {
  return IMAGES_DIR;
}

/**
 * 删除文档的所有图片
 */
export function deleteImages(documentId: string): void {
  const docDir = path.join(IMAGES_DIR, documentId);

  if (fs.existsSync(docDir)) {
    fs.rmSync(docDir, { recursive: true });
    console.log(`[ImageStorage] 删除目录: ${docDir}`);
  }
}