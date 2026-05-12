"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, ArrowLeft, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";

type ExtItem = {
  id: string;
  documentId: string;
  itemCategory?: string | null;
  bidSection?: string | null;
  itemType?: string | null;
  itemNo?: string | null;
  title?: string | null;
  description?: string | null;
  consequence?: string | null;
  legalReference?: string | null;
  location?: { pageNumber?: number; blockIndex?: number } | null;
  extractionConfidence?: string | null;
  extractedBy?: string | null;
};

type DocInfo = { id: string; name: string; docType: string };

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
  documentId: "",
};

export default function ExtractionItemsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [items, setItems] = useState<(ExtItem & { documentName?: string })[]>([]);
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDocId, setFilterDocId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExtItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
      // Fetch extraction items from all documents
      const allItems: (ExtItem & { documentName?: string })[] = [];
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data = await res.json();
      const documents: DocInfo[] = data.documents || [];

      for (const doc of documents) {
        const iRes = await fetch(`/api/documents/${doc.id}/extraction-items`);
        if (iRes.ok) {
          const iData = await iRes.json();
          for (const item of iData.items || []) {
            allItems.push({ ...item, documentName: doc.name, documentId: doc.id });
          }
        }
      }
      setItems(allItems);
    } catch (e) {
      console.error("Failed to fetch items:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchDocs(); fetchItems(); }, [fetchDocs, fetchItems]);

  const filtered = items.filter((item) => {
    if (filterDocId && item.documentId !== filterDocId) return false;
    if (filterType && item.itemType !== filterType) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${item.title || ""} ${item.description || ""} ${item.itemNo || ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const itemTypes = [...new Set(items.map((i) => i.itemType).filter(Boolean))] as string[];

  const resetForm = useCallback(() => {
    setForm({ ...defaultForm, documentId: filterDocId || docs[0]?.id || "" });
    setEditing(null);
  }, [filterDocId, docs]);

  const openEdit = useCallback((item: ExtItem & { documentName?: string }) => {
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
      documentId: item.documentId,
    });
    setOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title?.trim()) { toast({ title: "标题不能为空", variant: "destructive" }); return; }
    if (!form.documentId) { toast({ title: "请选择关联文档", variant: "destructive" }); return; }
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
        extractionConfidence: editing ? undefined : 0.9,
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

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/projects/${projectId}/documents`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <h2 className="text-h2">审查项管理</h2>
        <p className="text-muted-foreground">管理项目中所有文档的审查项和应答项</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="搜索标题/描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterDocId || "all"} onValueChange={(v) => setFilterDocId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="全部文档" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部文档</SelectItem>
            {docs.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {itemTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => { resetForm(); setOpen(true); }}
        >
          <Plus className="mr-1 h-4 w-4" />
          手动添加
        </Button>
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
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <div>标题 / 描述</div>
            <div className="w-16 text-center">类别</div>
            <div className="w-20 text-center">类型</div>
            <div className="w-28 text-center">关联文档</div>
            <div className="w-16 text-center">操作</div>
          </div>
          <div className="divide-y">
            {filtered.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-muted/20">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {item.bidSection && <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">{item.bidSection}</Badge>}
                    {item.itemNo && <Badge variant="outline" className="text-xs">{item.itemNo}</Badge>}
                    {item.consequence && <Badge variant="outline" className="text-xs text-red-500">后果: {item.consequence}</Badge>}
                  </div>
                </div>
                <div className="w-16 text-center">
                  <Badge variant={item.itemCategory !== "response" ? "destructive" : "secondary"} className="text-xs">
                    {item.itemCategory !== "response" ? "审查项" : "应答项"}
                  </Badge>
                </div>
                <div className="w-20 text-center">
                  <Badge variant="secondary" className="text-xs">{item.itemType}</Badge>
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
            <DialogTitle>{editing ? "编辑提取项" : "手动添加提取项"}</DialogTitle>
            <DialogDescription>{editing ? "修改提取项" : "添加自定义审查项或应答项"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">关联文档 *</label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.documentId}
                onChange={(e) => setForm({ ...form, documentId: e.target.value })}
              >
                <option value="">选择文档...</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">类别</label>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.itemCategory} onChange={(e) => setForm({ ...form, itemCategory: e.target.value as any })}>
                  <option value="review">审查项</option>
                  <option value="response">应答项</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">标段</label>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.bidSection} onChange={(e) => setForm({ ...form, bidSection: e.target.value })}>
                  <option value="">不限</option>
                  <option value="技术标">技术标</option>
                  <option value="商务标">商务标</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">类型</label>
                <Input className="mt-1 h-8 text-sm" value={form.itemType}
                  onChange={(e) => setForm({ ...form, itemType: e.target.value })} placeholder="如：资质要求" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">条款编号</label>
              <Input className="mt-1 h-8 text-sm" value={form.itemNo}
                onChange={(e) => setForm({ ...form, itemNo: e.target.value })} placeholder="如：第三章第5条" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">标题 *</label>
              <Input className="mt-1 h-8 text-sm" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="审查项标题" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">描述</label>
              <Textarea className="mt-1 text-sm" rows={3} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="详细描述..." />
            </div>
            {form.itemCategory === "review" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">不满足后果</label>
                  <Input className="mt-1 h-8 text-sm" value={form.consequence}
                    onChange={(e) => setForm({ ...form, consequence: e.target.value })} placeholder="如：废标" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">法律依据</label>
                  <Input className="mt-1 h-8 text-sm" value={form.legalReference}
                    onChange={(e) => setForm({ ...form, legalReference: e.target.value })} placeholder="法律法规条款..." />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">页码</label>
                <Input className="mt-1 h-8 text-sm" type="number" min={0} value={form.pageNumber}
                  onChange={(e) => setForm({ ...form, pageNumber: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">区块索引</label>
                <Input className="mt-1 h-8 text-sm" type="number" min={0} value={form.blockIndex}
                  onChange={(e) => setForm({ ...form, blockIndex: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {editing ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
