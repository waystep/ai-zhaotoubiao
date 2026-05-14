"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

type ExtItem = {
  id: string;
  documentId: string;
  section?: string | null;
  title?: string | null;
  checkpoint?: string | null;
  consequence?: string | null;
  blocks?: Array<{ blockId: string; pageNumber: number; blockIndex: number }> | null;
  extractedBy?: string | null;
};

type DocInfo = { id: string; name: string; docType: string };

const defaultForm = {
  section: "" as string,
  title: "",
  checkpoint: "",
  consequence: 0,
  documentId: "",
};

export default function ExtractionItemsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [items, setItems] = useState<(ExtItem & { documentName?: string })[]>([]);
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDocId, setFilterDocId] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterTitle, setFilterTitle] = useState("");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExtItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
      }
    } catch {}
  }, [projectId]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const allItems: (ExtItem & { documentName?: string })[] = [];
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data = await res.json();
      const documents: DocInfo[] = data.documents || [];

      const results = await Promise.all(
        documents.map(async (doc) => {
          try {
            const iRes = await fetch(`/api/documents/${doc.id}/extraction-items`);
            if (!iRes.ok) return [];
            const iData = await iRes.json();
            return (iData.items || []).map((item: ExtItem) => ({
              ...item,
              documentName: doc.name,
              documentId: doc.id,
            }));
          } catch {
            return [];
          }
        })
      );

      for (const docItems of results) {
        allItems.push(...docItems);
      }
      setItems(allItems);
    } catch (e) {
      console.error("Failed to fetch items:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchDocs(); fetchItems(); }, [fetchDocs, fetchItems]);

  // 筛选条件变更时清空选择
  useEffect(() => { setSelectedIds(new Set()); }, [filterDocId, filterSection, filterTitle, search]);

  const filtered = items.filter((item) => {
    if (filterDocId && item.documentId !== filterDocId) return false;
    if (filterSection && item.section !== filterSection) return false;
    if (filterTitle && item.title !== filterTitle) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${item.title || ""} ${item.checkpoint || ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const itemTitles = [...new Set(items.map((i) => i.title).filter(Boolean))] as string[];
  const itemSections = [...new Set(items.map((i) => i.section).filter(Boolean))] as string[];

  const resetForm = useCallback(() => {
    setForm({ ...defaultForm, documentId: filterDocId || docs[0]?.id || "" });
    setEditing(null);
  }, [filterDocId, docs]);

  const openEdit = useCallback((item: ExtItem & { documentName?: string }) => {
    setEditing(item);
    setForm({
      section: item.section || "",
      title: item.title || "",
      checkpoint: item.checkpoint || "",
      consequence: item.consequence ? Number(item.consequence) : 0,
      documentId: item.documentId,
    });
    setOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title?.trim()) { toast({ title: "标题不能为空", variant: "destructive" }); return; }
    if (!form.checkpoint?.trim()) { toast({ title: "检查点不能为空", variant: "destructive" }); return; }
    if (!form.documentId) { toast({ title: "请选择关联文档", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        projectId,
        section: form.section || null,
        title: form.title,
        checkpoint: form.checkpoint,
        consequence: form.consequence || null,
        blocks: editing ? undefined : [],
      };

      const method = editing ? "PATCH" : "POST";
      const url = editing
        ? `/api/documents/${editing.documentId}/extraction-items/${editing.id}`
        : `/api/documents/${form.documentId}/extraction-items`;

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "保存失败");

      toast({ title: editing ? "已更新" : "已添加" });
      setOpen(false); resetForm(); fetchItems();
    } catch (e: any) {
      toast({ title: "保存失败", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }, [form, projectId, editing, toast, resetForm, fetchItems]);

  const handleDelete = useCallback(async (item: ExtItem & { documentName?: string }) => {
    if (!confirm(`确定删除"${item.title}"？`)) return;
    setDeleting(item.id);
    try {
      const res = await fetch(`/api/documents/${item.documentId}/extraction-items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      toast({ title: "已删除" });
      fetchItems();
    } catch (e: any) {
      toast({ title: "删除失败", description: e.message, variant: "destructive" });
    } finally { setDeleting(null); }
  }, [toast, fetchItems]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((i) => i.id));
    });
  }, [filtered]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条审查项？此操作不可撤销。`)) return;
    setBatchDeleting(true);
    try {
      const res = await fetch("/api/extraction-items/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "批量删除失败");
      toast({ title: `已删除 ${selectedIds.size} 条审查项` });
      setSelectedIds(new Set());
      fetchItems();
    } catch (e: any) {
      toast({ title: "批量删除失败", description: e.message, variant: "destructive" });
    } finally { setBatchDeleting(false); }
  }, [selectedIds, toast, fetchItems]);

  const isAllSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2">审查项管理</h2>
        <p className="text-muted-foreground">管理项目中所有文档的审查项和检查点</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="搜索标题/检查点..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterDocId || "all"} onValueChange={(v) => setFilterDocId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="全部文档" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部文档</SelectItem>
            {docs.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSection || "all"} onValueChange={(v) => setFilterSection(v === "all" ? "" : v)}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="全部标段" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部标段</SelectItem>
            {itemSections.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterTitle || "all"} onValueChange={(v) => setFilterTitle(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {itemTitles.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedIds.size > 0 ? (
          <Button
            size="sm"
            variant="destructive"
            className="ml-auto"
            onClick={handleBatchDelete}
            disabled={batchDeleting}
          >
            {batchDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            删除选中 ({selectedIds.size})
          </Button>
        ) : (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => { resetForm(); setOpen(true); }}
          >
            <Plus className="mr-1 h-4 w-4" />
            手动添加
          </Button>
        )}
      </div>

      {/* Items table */}
      {loading ? (
        <Card><CardContent className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">暂无审查项，请先对文档发起提取或手动添加</p>
        </CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground items-center">
            <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} />
            <div>标题 / 检查点</div>
            <div className="w-16 text-center">标段</div>
            <div className="w-28 text-center">关联文档</div>
            <div className="w-16 text-center">操作</div>
          </div>
          <div className="divide-y">
            {filtered.map((item) => (
              <div key={item.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-muted/20">
                <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.checkpoint}</p>
                  {item.consequence != null && Number(item.consequence) > 0 && (
                    <Badge variant="outline" className="text-xs text-red-500 mt-0.5">
                      权重: {Number(item.consequence).toFixed(2)}
                    </Badge>
                  )}
                </div>
                <div className="w-16 text-center">
                  {item.section && (
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">{item.section}</Badge>
                  )}
                </div>
                <div className="w-28 text-center text-xs text-muted-foreground truncate" title={item.documentName}>
                  {item.documentName}
                </div>
                <div className="w-16 flex justify-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(item)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(item)} disabled={deleting === item.id}>
                    {deleting === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑审查项" : "手动添加审查项"}</DialogTitle>
            <DialogDescription>
              {editing ? "修改审查项的内容" : "添加自定义审查项，关联到指定文档"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* 关联文档 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">关联文档 <span className="text-destructive">*</span></label>
              <Select value={form.documentId || undefined} onValueChange={(v) => setForm({ ...form, documentId: v })}>
                <SelectTrigger><SelectValue placeholder="选择文档..." /></SelectTrigger>
                <SelectContent>
                  {docs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 标段 / 标题 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">标段</label>
                <Select value={form.section || "all"} onValueChange={(v) => setForm({ ...form, section: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="不限" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">不限</SelectItem>
                    <SelectItem value="技术标">技术标</SelectItem>
                    <SelectItem value="商务标">商务标</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">标题 <span className="text-destructive">*</span></label>
                <Input value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：完整性" />
              </div>
            </div>

            {/* 检查点 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">检查点 <span className="text-destructive">*</span></label>
              <Textarea rows={3} value={form.checkpoint}
                onChange={(e) => setForm({ ...form, checkpoint: e.target.value })}
                placeholder="如：技术标必须包含施工组织设计、技术方案..." />
            </div>

            {/* 权重 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">权重</label>
              <Input type="number" min={0} max={1} step={0.1} value={form.consequence}
                onChange={(e) => setForm({ ...form, consequence: Number(e.target.value) })}
                placeholder="0 ~ 1，如 0.6" />
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {editing ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
