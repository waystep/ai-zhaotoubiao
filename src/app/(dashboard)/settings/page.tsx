"use client";

import { Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">设置</h2>
        <p className="text-muted-foreground">账户与平台偏好（功能开发中）</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            工作台设置
          </CardTitle>
          <CardDescription>
            通知、语言、主题等选项将在此配置，当前版本为占位页面。
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          敬请期待
        </CardContent>
      </Card>
    </div>
  );
}
