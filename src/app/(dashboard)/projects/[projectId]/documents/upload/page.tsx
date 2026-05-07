"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Upload, FileText, Loader2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXT = /\.(pdf|doc|docx|xls|xlsx)$/i;

function fileKey(f: File) {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function isAllowedFile(file: File): boolean {
  if (file.type && ALLOWED_TYPES.has(file.type)) return true;
  return ALLOWED_EXT.test(file.name);
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const f of files) {
    const k = fileKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

export default function DocumentUploadPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<string>("tender_doc");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const valid: File[] = [];
      const invalid: string[] = [];
      for (const file of incoming) {
        if (isAllowedFile(file)) valid.push(file);
        else invalid.push(file.name);
      }
      if (invalid.length) {
        toast({
          title: "已跳过不支持的文件",
          description: `${invalid.slice(0, 5).join("、")}${invalid.length > 5 ? ` 等共 ${invalid.length} 个` : ""}（仅支持 PDF、Word、Excel）`,
          variant: "destructive",
        });
      }
      if (!valid.length) return;
      setSelectedFiles((prev) => dedupeFiles([...prev, ...valid]));
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

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function clearFiles() {
    setSelectedFiles([]);
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) {
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
      for (const selectedFile of selectedFiles) {
        try {
          const formData = new FormData();
          formData.append("file", selectedFile);

          const uploadResponse = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}));
            failures.push(`${selectedFile.name}: ${errorData.error || "上传失败"}`);
            continue;
          }

          const uploadData = await uploadResponse.json();
          if (!uploadData.file?.storagePath) {
            failures.push(`${selectedFile.name}: 服务器未返回文件路径`);
            continue;
          }

          const docResponse = await fetch(`/api/projects/${projectId}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              docType,
              name: selectedFile.name,
              originalName: uploadData.file.originalName || selectedFile.name,
              fileSize: uploadData.file.fileSize || selectedFile.size,
              mimeType: uploadData.file.mimeType || selectedFile.type,
              storagePath: uploadData.file.storagePath,
            }),
          });

          if (docResponse.ok) {
            success += 1;
          } else {
            const error = await docResponse.json().catch(() => ({}));
            failures.push(`${selectedFile.name}: ${error.error || "创建记录失败"}`);
          }
        } catch {
          failures.push(`${selectedFile.name}: 网络错误`);
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回项目详情
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">上传文档</h2>
        <p className="text-muted-foreground">
          上传招标文件、法律文件或投标文件（支持多选、批量拖拽）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            文档上传
          </CardTitle>
          <CardDescription>
            支持 PDF、Word、Excel；可多选文件，或拖入多个文件到下方区域
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="docType">文档类型</Label>
            <p className="text-xs text-muted-foreground">
              本次批量上传的文件将使用同一文档类型
            </p>
            <select
              id="docType"
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={isLoading}
            >
              <option value="tender_doc">招标文件</option>
              <option value="legal_doc">法律文件</option>
              <option value="bid_doc">投标文件</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="file">选择文件</Label>
              {selectedFiles.length > 0 && (
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
                id="file"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={handleFileChange}
                disabled={isLoading}
              />
              {selectedFiles.length > 0 ? (
                <div className="space-y-3 text-left">
                  <p className="text-sm text-muted-foreground text-center">
                    已选 {selectedFiles.length} 个文件；点击此区域或下方按钮可继续添加
                  </p>
                  <ul className="max-h-52 overflow-y-auto space-y-2 pr-1">
                    {selectedFiles.map((file, index) => (
                      <li
                        key={`${fileKey(file)}-${index}`}
                        className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          disabled={isLoading}
                          aria-label={`移除 ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
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
            <Button onClick={handleUpload} disabled={isLoading || selectedFiles.length === 0}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {selectedFiles.length > 1
                    ? `上传 ${selectedFiles.length} 个文档`
                    : "上传文档"}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/projects/${projectId}`)}
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
