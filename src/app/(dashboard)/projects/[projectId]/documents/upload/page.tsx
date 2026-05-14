"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Upload, FileText, Loader2, ArrowLeft, X, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXT = /\.(pdf|doc|docx|xls|xlsx)$/i;

const DOC_TYPES = [
  { value: "tender_doc", label: "招标文件", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "bid_doc", label: "投标文件", color: "bg-green-50 text-green-700 border-green-200" },
];

// 根据文件名推测文档类型
function inferDocType(fileName: string): string {
  const name = fileName.toLowerCase();

  // 招标文件关键词
  if (name.includes("招标") || name.includes("tender") || name.includes("招標") ||
      name.includes("资格预审") || name.includes("资格") || name.includes("预审") ||
      name.includes("招标公告") || name.includes("招标文件") || name.includes("招標文件")) {
    return "tender_doc";
  }

  // 投标文件关键词
  if (name.includes("投标") || name.includes("bid") || name.includes("投標") ||
      name.includes("投标文件") || name.includes("技术标") || name.includes("商务标") ||
      name.includes("投标书") || name.includes("投標書")) {
    return "bid_doc";
  }

  // 默认招标文件
  return "tender_doc";
}

function fileKey(f: File) {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function isAllowedFile(file: File): boolean {
  if (file.type && ALLOWED_TYPES.has(file.type)) return true;
  return ALLOWED_EXT.test(file.name);
}

interface FileWithDocType {
  file: File;
  docType: string;
  id: string;
}

function dedupeFilesWithDocType(items: FileWithDocType[]): FileWithDocType[] {
  const seen = new Set<string>();
  const out: FileWithDocType[] = [];
  for (const item of items) {
    const k = fileKey(item.file);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export default function DocumentUploadPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [fileItems, setFileItems] = useState<FileWithDocType[]>([]);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const valid: FileWithDocType[] = [];
      const invalid: string[] = [];
      for (const file of incoming) {
        if (isAllowedFile(file)) {
          valid.push({
            file,
            docType: inferDocType(file.name),
            id: fileKey(file),
          });
        } else {
          invalid.push(file.name);
        }
      }
      if (invalid.length) {
        toast({
          title: "已跳过不支持的文件",
          description: `${invalid.slice(0, 5).join("、")}${invalid.length > 5 ? ` 等共 ${invalid.length} 个` : ""}（仅支持 PDF、Word、Excel）`,
          variant: "destructive",
        });
      }
      if (!valid.length) return;
      setFileItems((prev) => dedupeFilesWithDocType([...prev, ...valid]));
    },
    [toast]
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (list?.length) {
      addFiles(Array.from(list));
    }
    event.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const list = e.dataTransfer.files;
    if (list?.length) {
      addFiles(Array.from(list));
    }
  }

  function removeFile(id: string) {
    setFileItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateDocType(id: string, docType: string) {
    setFileItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, docType } : item))
    );
  }

  function clearFiles() {
    setFileItems([]);
  }

  async function handleUpload() {
    if (fileItems.length === 0) {
      toast({
        title: "请选择文件",
        description: "请先选择或拖入要上传的文档",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    let success = 0;
    const failures: string[] = [];

    try {
      for (const item of fileItems) {
        try {
          const formData = new FormData();
          formData.append("file", item.file);

          const uploadResponse = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}));
            failures.push(`${item.file.name}: ${errorData.error || "上传失败"}`);
            continue;
          }

          const uploadData = await uploadResponse.json();
          if (!uploadData.file?.storagePath) {
            failures.push(`${item.file.name}: 服务器未返回文件路径`);
            continue;
          }

          const docResponse = await fetch(`/api/projects/${projectId}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              docType: item.docType,
              name: item.file.name,
              originalName: uploadData.file.originalName || item.file.name,
              fileSize: uploadData.file.fileSize || item.file.size,
              mimeType: uploadData.file.mimeType || item.file.type,
              storagePath: uploadData.file.storagePath,
            }),
          });

          if (docResponse.ok) {
            success += 1;
          } else {
            const error = await docResponse.json().catch(() => ({}));
            failures.push(`${item.file.name}: ${error.error || "创建记录失败"}`);
          }
        } catch {
          failures.push(`${item.file.name}: 网络错误`);
        }
      }

      if (success > 0) {
        const failHint =
          failures.length > 0
            ? ` 失败 ${failures.length} 个：${failures.slice(0, 2).join("；")}${failures.length > 2 ? "…" : ""}`
            : "";
        toast({
          title: failures.length > 0 ? "上传完成（部分失败）" : "上传完成",
          description: `已成功上传 ${success} 个文档。${failHint}`.trim(),
        });
        router.push(`/projects/${projectId}/documents`);
        router.refresh();
      } else {
        toast({
          title: "全部上传失败",
          description: failures.slice(0, 3).join("；") + (failures.length > 3 ? "…" : ""),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "上传失败",
        description: "请检查您的网络连接",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // 按类型分组统计
  const typeStats = fileItems.reduce((acc, item) => {
    acc[item.docType] = (acc[item.docType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/projects/${projectId}/documents`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回文档管理
        </Button>
        <h2 className="text-h2">上传文档</h2>
        <p className="text-muted-foreground">
          上传招标文件或投标文件（支持多选、批量拖拽，自动识别类型）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            文档上传
          </CardTitle>
          <CardDescription>
            支持 PDF、Word、Excel；可多选文件，系统会根据文件名自动推测文档类型，您也可以手动修改
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>选择文件</Label>
              {fileItems.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8"
                  onClick={clearFiles}
                  disabled={isLoading}
                >
                  清空列表
                </Button>
              )}
            </div>

            {/* 类型统计 */}
            {fileItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map((t) => {
                  const count = typeStats[t.value] || 0;
                  if (count === 0) return null;
                  return (
                    <Badge key={t.value} className={cn("text-xs", t.color)}>
                      {t.label} {count}
                    </Badge>
                  );
                })}
              </div>
            )}

            <div
              role="button"
              tabIndex={0}
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-primary"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={handleFileChange}
                disabled={isLoading}
              />
              {fileItems.length > 0 ? (
                <div className="space-y-3 text-left">
                  <p className="text-sm text-muted-foreground text-center">
                    已选 {fileItems.length} 个文件；点击此区域或下方按钮可继续添加
                  </p>
                  <ul className="max-h-[min(40vh,320px)] overflow-y-auto space-y-2">
                    {fileItems.map((item) => {
                      const typeInfo = DOC_TYPES.find((t) => t.value === item.docType);
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(item.file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          {/* 类型选择 - Popover 单选 */}
                          <Popover
                            open={openPopoverId === item.id}
                            onOpenChange={(open) => setOpenPopoverId(open ? item.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                disabled={isLoading}
                                className={cn(
                                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                                  "hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring",
                                  typeInfo?.color
                                )}
                              >
                                {typeInfo?.label}
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-[auto] min-w-0 p-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex flex-col gap-1">
                                {DOC_TYPES.map((t) => (
                                  <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => {
                                      updateDocType(item.id, t.value);
                                      setOpenPopoverId(null);
                                    }}
                                    className={cn(
                                      "inline-flex items-center rounded px-2 py-1 text-xs font-medium transition-colors",
                                      item.docType === t.value ? "ring-1 ring-primary" : "hover:bg-muted/50",
                                      t.color
                                    )}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          {/* 删除按钮 */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(item.id);
                            }}
                            disabled={isLoading}
                            aria-label={`移除 ${item.file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex justify-center pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={isLoading}
                    >
                      添加更多文件
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    点击选择文件或拖拽文件到此处
                  </p>
                  <p className="text-xs text-muted-foreground">
                    支持多选；PDF、Word、Excel 格式
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={handleUpload} disabled={isLoading || fileItems.length === 0}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {fileItems.length > 1
                    ? `上传 ${fileItems.length} 个文档`
                    : "上传文档"}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/projects/${projectId}/documents`)}
              disabled={isLoading}
            >
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}