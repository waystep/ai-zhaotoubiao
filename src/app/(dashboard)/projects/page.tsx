import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { tenderProjects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { ProjectsList } from "@/app/(dashboard)/projects/projects-list";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  // 获取项目列表
  let projects: typeof tenderProjects.$inferSelect[] = [];
  try {
    if (session.user?.orgId) {
      projects = await db.query.tenderProjects.findMany({
        where: eq(tenderProjects.orgId, session.user.orgId),
        orderBy: [desc(tenderProjects.createdAt)],
        limit: 20,
      });
    }
  } catch (error) {
    console.error("获取项目列表失败:", error);
  }

  return (
    <ProjectsList
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        projectNo: p.projectNo,
        status: p.status ?? null,
      }))}
    />
  );
}