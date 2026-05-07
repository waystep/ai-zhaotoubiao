"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Mail, Loader2, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "请输入邮箱地址";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "请输入有效的邮箱地址";
  return undefined;
}

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    setError(err);
    if (err) return;

    setIsLoading(true);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({
          title: "提交失败",
          description: data.error || "请稍后重试",
          variant: "destructive",
        });
        return;
      }

      setSubmitted(true);
      if (typeof data._devResetUrl === "string") {
        setDevLink(data._devResetUrl);
      }
      toast({
        title: "请求已处理",
        description: data.message || "请查收邮件",
      });
    } catch {
      toast({
        title: "网络错误",
        description: "请检查网络后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function copyDevLink() {
    if (!devLink) return;
    try {
      await navigator.clipboard.writeText(devLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "已复制重置链接" });
    } catch {
      toast({ title: "复制失败", variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">智能招标审查平台</span>
          </div>
          <CardTitle className="text-2xl text-center">忘记密码</CardTitle>
          <CardDescription className="text-center">
            输入注册邮箱，我们将发送重置链接（仅支持邮箱密码登录的账号）
          </CardDescription>
        </CardHeader>

        {!submitted ? (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(undefined);
                    }}
                    disabled={isLoading}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    发送中…
                  </>
                ) : (
                  "发送重置邮件"
                )}
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回登录
                </Link>
              </Button>
            </CardFooter>
          </form>
        ) : (
          <>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                若该邮箱已注册且使用密码登录，您将收到一封重置邮件（含垃圾邮件箱）。
                配置 <code className="text-xs bg-muted px-1 rounded">RESEND_API_KEY</code>{" "}
                与 <code className="text-xs bg-muted px-1 rounded">RESEND_FROM_EMAIL</code>{" "}
                后可自动发信。
              </p>
              {devLink && (
                <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    开发环境：未配置邮件服务，可使用下方链接完成重置（勿用于生产）
                  </p>
                  <p className="text-xs break-all text-muted-foreground">{devLink}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={copyDevLink}
                  >
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        复制重置链接
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">返回登录</Link>
              </Button>
              <Button
                variant="link"
                className="text-sm"
                onClick={() => {
                  setSubmitted(false);
                  setDevLink(null);
                }}
              >
                使用其他邮箱重试
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
