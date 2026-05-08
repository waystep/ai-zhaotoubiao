"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function CopyButton({
  value,
  label = "已复制",
  size = "sm",
}: {
  value: string;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: label, description: value });
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast({ title: "复制失败", description: "请检查浏览器权限", variant: "destructive" });
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={onCopy}
      className="h-8 px-2"
      title="复制"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

