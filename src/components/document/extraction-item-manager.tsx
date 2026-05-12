"use client";

import { useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type ExtItem = {
  id: string;
  itemCategory?: string | null;
  bidSection?: string | null;
  itemType?: string | null;
  itemNo?: string | null;
  title?: string | null;
  description?: string | null;
  consequence?: string | null;
  legalReference?: string | null;
  extractionConfidence?: string | null;
  location?: { pageNumber?: number; blockIndex?: number } | null;
  extractedBy?: string | null;
};

interface Props {
  documentId: string;
  projectId: string;
  items: ExtItem[];
  onRefresh: () => void;
}

const defaultForm = {
  itemCategory: "review" as const,
  bidSection: "",
  itemType: "",
  itemNo: "",
  title: "",
  description: "",
  consequence: "",
  legalReference: "",
  pageNumber: 0,
  blockIndex: 0,
};

export function ExtractionItemManager({ documentId, projectId, items, onRefresh }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExtItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setForm(defaultForm);
    setEditing(null);
  }, []);

  const openEdit = useCallback((item: ExtItem) => {
    setEditing(item);
    setForm({
      itemCategory: (item.itemCategory as any) || "review",
      bidSection: item.bidSection || "",
      itemType: item.itemType || "",
      itemNo: item.itemNo || "",
      title: item.title || "",
      description: item.description || "",
      consequence: item.consequence || "",
      legalReference: item.legalReference || "",
      pageNumber: item.location?.pageNumber || 0,
      blockIndex: item.location?.blockIndex || 0,
    });
    setOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) {
      toast({ title: "标题不能为空", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        projectId,
        itemCategory: form.itemCategory,
        bidSection: form.bidSection || null,
        itemType: form.itemType || "手动添加",
        itemNo: form.itemNo || null,
        title: form.title,
        description: form.description,
        consequence: form.consequence || null,
        legalReference: form.legalReference || null,
        location: { pageNumber: form.pageNumber, blockIndex: form.blockIndex },
        extractionConfidence: editing ? undefined : 0.9, // 手动添加高置信度
      };

      const method = editing ? "PATCH" : "POST";
      const url = editing
        ? `/api/documents/${documentId}/extraction-items/${editing.id}`
        : `/api/documents/${documentId}/extraction-items`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error((await res.json()).error || "保存失败");

      toast({ title: editing ? "已更新" : "已添加" });
      setOpen(false);
      resetForm();
      onRefresh();
    } catch (e: any) {
      toast({ title: "保存失败", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [form, projectId, documentId, editing, toast, resetForm, onRefresh]);

  const handleDelete = useCallback(async (itemId: string) => {
    if (!confirm("确定删除此提取项？")) return;
    setDeleting(itemId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/extraction-items/${itemId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("删除失败");
      toast({ title: "已删除" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "删除失败", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }, [documentId, toast, onRefresh]);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">提取项管理</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => { resetForm(); setOpen(true); }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          手动添加
        </Button>
      </div>

      <div className="max-h-[calc(100vh-24rem)] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border bg-background p-2.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <Badge variant={item.itemCategory === "review" ? "destructive" : "secondary"} className="text-xs">
                    {item.itemCategory === "review" ? "审查项" : "应答项"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">{item.itemType}</Badge>
                  {item.bidSection && (
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">{item.bidSection}</Badge>
                  )}
                  {item.extractedBy === "manual" && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">手动</Badge>
                  )}
                </div>
                <div className="font-medium truncate">{item.title}</div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => openEdit(item)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                >
                  {deleting === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑提取项" : "手动添加提取项"}</DialogTitle>
            <DialogDescription>
              {editing ? "修改提取项的内容" : "添加一个自定义的审查项或应答项"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">类别</label>
                <select
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  value={form.itemCategory}
                  onChange={(e) => setForm({ ...form, itemCategory: e.target.value as any })}
                >
                  <option value="review">审查项</option>
                  <option value="response">应答项</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">标段</label>
                <select
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  value={form.bidSection}
                  onChange={(e) => setForm({ ...form, bidSection: e.target.value })}
                >
                  <option value="">不限</option>
                  <option value="技术标">技术标</option>
                  <option value="商务标">商务标</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">类型</label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={form.itemType}
                  onChange={(e) => setForm({ ...form, itemType: e.target.value })}
                  placeholder="如：资质要求"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">条款编号</label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.itemNo}
                onChange={(e) => setForm({ ...form, itemNo: e.target.value })}
                placeholder="如：第三章第5条"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">标题 *</label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="审查项标题"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">描述</label>
              <Textarea
                className="mt-1 text-sm"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="详细描述..."
              />
            </div>
            {form.itemCategory === "review" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">不满足后果</label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    value={form.consequence}
                    onChange={(e) => setForm({ ...form, consequence: e.target.value })}
                    placeholder="如：废标"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">法律依据</label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    value={form.legalReference}
                    onChange={(e) => setForm({ ...form, legalReference: e.target.value })}
                    placeholder="法律法规条款..."
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">页码</label>
                <Input
                  className="mt-1 h-8 text-sm"
                  type="number"
                  min={0}
                  value={form.pageNumber}
                  onChange={(e) => setForm({ ...form, pageNumber: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">区块索引</label>
                <Input
                  className="mt-1 h-8 text-sm"
                  type="number"
                  min={0}
                  value={form.blockIndex}
                  onChange={(e) => setForm({ ...form, blockIndex: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {editing ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
