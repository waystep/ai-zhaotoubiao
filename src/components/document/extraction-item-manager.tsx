"use client";

import { useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type ExtItem = {
  id: string;
  section?: string | null;
  title?: string | null;
  checkpoint?: string | null;
  consequence?: string | null;
  blocks?: Array<{ blockId: string; pageNumber: number; blockIndex: number }> | null;
};

interface Props { documentId: string; projectId: string; items: ExtItem[]; onRefresh: () => void; }

const defaultForm = { section: "" as string, title: "", checkpoint: "", consequence: 0 };

export function ExtractionItemManager({ documentId, projectId, items, onRefresh }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExtItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const resetForm = useCallback(() => { setForm(defaultForm); setEditing(null); }, []);

  const openEdit = useCallback((item: ExtItem) => {
    setEditing(item);
    setForm({
      section: item.section || "",
      title: item.title || "",
      checkpoint: item.checkpoint || "",
      consequence: item.consequence ? Number(item.consequence) : 0,
    });
    setOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) { toast({ title: "标题不能为空", variant: "destructive" }); return; }
    if (!form.checkpoint.trim()) { toast({ title: "检查点不能为空", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        projectId, section: form.section || null, title: form.title,
        checkpoint: form.checkpoint, consequence: form.consequence || null,
      };
      const method = editing ? "PATCH" : "POST";
      const url = editing
        ? `/api/documents/${documentId}/extraction-items/${editing.id}`
        : `/api/documents/${documentId}/extraction-items`;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "保存失败");
      toast({ title: editing ? "已更新" : "已添加" }); setOpen(false); resetForm(); onRefresh();
    } catch (e: any) { toast({ title: "保存失败", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }, [form, projectId, documentId, editing, toast, resetForm, onRefresh]);

  const handleDelete = useCallback(async (itemId: string) => {
    if (!confirm("确定删除？")) return;
    setDeleting(itemId);
    try {
      const res = await fetch(`/api/documents/${documentId}/extraction-items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      toast({ title: "已删除" }); onRefresh();
    } catch (e: any) { toast({ title: "删除失败", description: e.message, variant: "destructive" }); }
    finally { setDeleting(null); }
  }, [documentId, toast, onRefresh]);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">审查项</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" />手动添加
        </Button>
      </div>
      <div className="max-h-[calc(100vh-24rem)] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border bg-background p-2.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <Badge variant="secondary" className="text-xs">{item.title}</Badge>
                  {item.section && <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">{item.section}</Badge>}
                  {item.consequence != null && Number(item.consequence) > 0 && (
                    <Badge variant="outline" className="text-xs text-red-500">权重: {Number(item.consequence).toFixed(2)}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.checkpoint}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)} disabled={deleting === item.id}>
                  {deleting === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑审查项" : "手动添加审查项"}</DialogTitle>
            <DialogDescription>{editing ? "修改审查项的内容" : "添加自定义审查项"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">标段</label>
                <Select value={form.section || "all"} onValueChange={(v) => setForm({ ...form, section: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="不限" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">不限</SelectItem><SelectItem value="技术标">技术标</SelectItem><SelectItem value="商务标">商务标</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">标题 <span className="text-destructive">*</span></label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：完整性" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">检查点 <span className="text-destructive">*</span></label>
              <Textarea rows={3} value={form.checkpoint} onChange={(e) => setForm({ ...form, checkpoint: e.target.value })} placeholder="审查判定标准..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">权重</label>
              <Input type="number" min={0} max={1} step={0.1} value={form.consequence} onChange={(e) => setForm({ ...form, consequence: Number(e.target.value) })} placeholder="0 ~ 1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}{editing ? "保存" : "添加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
