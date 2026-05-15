import type { Metadata } from "next";
import "@/styles/globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "智能招投标预审平台",
    template: "%s · 智能招投标预审平台",
  },
  description:
    "面向招标与投标全流程的智能预审平台：支持 PDF/Office 文档解析、审查项与应答提取、AI 合规审查、图片风险识别与审查报告生成，帮助团队提升标书质量与评审效率。",
  keywords: [
    "招投标",
    "招标文件",
    "投标文件",
    "标书审查",
    "智能预审",
    "合规审查",
    "AI 审查",
    "文档解析",
    "审查报告",
    "投标预审",
  ],
  authors: [{ name: "智能招投标预审平台" }],
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  openGraph: {
    title: "智能招投标预审平台",
    description:
      "AI 驱动的招标文件解析、审查项管理、合规分析与报告生成，一站式招投标智能预审。",
    locale: "zh_CN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
