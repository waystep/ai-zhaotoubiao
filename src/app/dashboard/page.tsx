import { redirect } from "next/navigation";

/** 兼容设计稿/旧链接：路由组 `(dashboard)` 不会出现在 URL 中，实际工作台在 `/projects` 等路径。 */
export default function DashboardAliasPage() {
  redirect("/projects");
}
