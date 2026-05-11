# AI 审查平台（ai-shencha）设计文档

> 文档版本：与代码库同步维护，描述当前架构与关键设计决策。

## 1. 项目概述

### 1.1 定位

面向招投标/资格预审等场景的 **智能文档审查工作台**：支持文档上传与解析（MinerU 等）、结构化区块与坐标、AI 合规审查报告、问题清单与 PDF 精确定位、组织级统计分析。

### 1.2 目标用户与边界

- **用户**：组织内审查人员（按 `orgId` 隔离数据）。
- **边界**：PDF 预览基于 `react-pdf`（渲染与定位），**不**承担“编辑并写回 PDF 文件”的能力；问题编辑若需上线需另行设计 API 与权限。

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15（App Router）、React 19 |
| 语言 | TypeScript |
| UI | Tailwind CSS、Radix UI、shadcn 风格组件 |
| 鉴权 | NextAuth v5（beta）+ Drizzle Adapter |
| 数据 | PostgreSQL、Drizzle ORM |
| PDF | `react-pdf` / pdf.js（CDN worker） |
| AI 编排 | Mastra（`@mastra/core`）、多 Agent + Memory（PG） |
| 其他 | Zod、date-fns 等 |

---

## 3. 系统架构

### 3.1 逻辑分层

```
浏览器 (Dashboard / 报告详情 / 分析)
    ↓ HTTPS
Next.js App Router
    ├── Server Components（部分列表/入口）
    ├── Client Components（PDF、筛选、Tabs 已合并为工作台）
    └── Route Handlers（/api/*）
            ↓
PostgreSQL（业务数据 + Mastra Memory/向量存储配置）
外部服务：MinerU 解析、大模型 Provider（如阿里云 Coding Plan）
```

### 3.2 源码目录（要点）

| 路径 | 职责 |
|------|------|
| `src/app/(auth)/*` | 登录、注册、找回密码等 |
| `src/app/(dashboard)/*` | 工作台：项目、文档、报告、统计分析 |
| `src/app/api/*` | REST 风格 API |
| `src/components/document/pdf-viewer.tsx` | 真 PDF 渲染、高亮、滚动定位、bbox |
| `src/components/review/issue-location-viewer.tsx` | 问题列表、筛选、与 PDF 联动 |
| `src/lib/db/schema.ts` | Drizzle 表定义 |
| `src/lib/auth/*` | NextAuth 配置 |
| `src/lib/ui/*` | 展示层格式化与中文标签映射 |
| `src/mastra/*` | Mastra 实例、各 Agent、存储 |

### 3.3 架构图（Mermaid）

下列图表用于 **评审、交接与改架构时的对照**；若流程或外部依赖有变，请同步改图。

> 提示：若本地预览不显示图，请使用支持 Mermaid 的预览插件，或将代码块复制到 [Mermaid Live Editor](https://mermaid.live)。

#### 系统上下文（谁与谁交互）

```mermaid
flowchart TB
  subgraph Clients["终端"]
    B[浏览器]
  end
  subgraph App["本仓库部署"]
    N[Next.js：页面 + /api Route Handlers]
  end
  subgraph Data["持久化"]
    PG[(PostgreSQL\n业务表 + Mastra Memory/向量)]
  end
  subgraph External["外部依赖"]
    MU[MinerU / 解析服务]
    LLM[大模型 Provider\n如阿里云 Coding Plan]
    FS[对象存储或本地 uploads\n按实现而定]
  end

  B -->|HTTPS + Cookie| N
  N --> PG
  N --> MU
  N --> LLM
  N --> FS
```

#### 核心领域关系（简化 ER）

详细字段见 `schema.ts`；此处只表达 **审查链路** 上的主外键关系。

```mermaid
erDiagram
  TenderProject ||--o{ Document : "project_id"
  Document ||--o| DocumentParsedResult : "parse 结果"
  DocumentParsedResult ||--o{ DocumentBlock : "blocks + bbox"
  TenderProject ||--o{ ReviewReport : "project_id"
  Document ||--o{ ReviewReport : "document_id"
  ReviewReport ||--o{ ReviewIssue : "report_id"
```

#### 报告生成时序（流式 + 落库）

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant FE as 前端
  participant API as POST /api/reports/id/generate
  participant DB as PostgreSQL
  participant SV as Mastra Supervisor
  participant LLM as LLM

  U->>FE: 开始审查
  FE->>API: POST
  API->>DB: reviewReports.status = in_progress
  API->>SV: stream(task, memory)
  loop fullStream
    SV->>LLM: 推理/工具
    LLM-->>SV: token/chunk
    SV-->>API: text-delta 等
    API-->>FE: text/plain 分块
  end
  API->>SV: await result
  alt 成功且解析出 JSON
    API->>DB: completed + summary/score/...
  else 失败或缺 Key
    API->>DB: 回滚 pending 或标记失败（以代码为准）
  end
```

#### 报告详情「问题定位工作台」数据流

```mermaid
flowchart LR
  subgraph UI["浏览器"]
    L[IssueLocationViewer\n列表/筛选/hover]
    P[PdfViewer\nreact-pdf + 叠层]
  end
  subgraph API["/api"]
    R["/api/reports/:id"]
    B["/api/documents/:id/blocks"]
    F["/api/documents/:id/file"]
  end
  DB[(PostgreSQL)]

  R --> DB
  B --> DB
  F --> DB
  L -->|issues 来自 report| R
  P -->|blocks + bbox| B
  P -->|PDF 字节| F
  L <-->|hover 同步 location\n一次性 focusedIssue 滚动| P
```

---

## 4. 核心领域模型（摘要）

详细字段以 `src/lib/db/schema.ts` 为准，此处仅列概念关系。

- **组织 / 用户**：多租户隔离（会话中带 `orgId`）。
- **项目 `tenderProjects`**：归属组织，含状态、招标配置 JSON 等。
- **文档 `documents`**：归属项目，解析状态、`taskProgress`、存储路径等。
- **解析结果 `documentParsedResults`**：全文、结构化内容、MinerU 原始数据。
- **区块 `documentBlocks`**：页码、`blockIndex`、内容、`bbox`（PDF 叠层与问题定位的基础）。
- **报告 `reviewReports`**：关联项目与文档，状态机 `pending → in_progress → completed`，摘要、`recommendation`、`aiScore` 等。
- **问题 `reviewIssues`**：归属报告，严重度、类别、位置（页码、block、bbox）、是否已解决等。

### 4.1 报告状态

- `pending`：待生成  
- `in_progress`：生成中  
- `completed`：已完成（可读问题清单与 PDF 工作台）

---

## 5. 关键业务流程

### 5.1 文档上传与解析

1. 文档写入 `documents`，可选触发 MinerU 任务。
2. 轮询或回调更新 `parseStatus`、`taskProgress`。
3. 完成后写入 `documentParsedResults` 与 `documentBlocks`（含坐标）。

### 5.2 审查报告生成

1. 客户端调用 `POST /api/reports/[reportId]/generate`。
2. 路由将报告置为 `in_progress`，通过 **Mastra Supervisor Agent** 流式输出。
3. 流结束后从文本中抽取 JSON（含 `recommendation`、`score`、`summary` 等），更新 `reviewReports` 为 `completed`。
4. **环境依赖**：使用 `alibaba-coding-plan-cn` 等模型时需配置 `ALIBABA_CODING_PLAN_API_KEY`；未配置时接口应返回明确错误（避免 `result` 为空导致崩溃）。

### 5.3 问题定位工作台（报告详情页）

**布局**：左侧问题列表 + 右侧 `PdfViewer`。

**数据流**：

- 问题位置：`reviewIssues.location`（`pageNumber`、`blockIndex`、可选 `bbox`）。
- 区块兜底：无 bbox 时用同页 `documentBlocks` 中匹配 `blockIndex` 的 `bbox`。
- **一次性定位**：`focusedIssueOnce` 触发 `PdfViewer` 滚动到 bbox，消费后清空，避免持续“抢滚动条”。
- **高亮层级**：当前选中（橙）> hover（主色）> 其他问题（黄）。
- **TextLayer 与 hover**：pdf.js 文本层 `z-index` 较高，叠层命中区需更高 `z-index`；框上可显示与列表一致的 **全局序号**（按 `report.issues` 顺序编号）。
- **列表筛选**：范围（默认「全部问题」/「当前页跟随」）、严重程度、处理状态；PDF 翻页时 `currentPage` 更新，在「当前页跟随」下列表仅显示该页问题。
- **长列表与 hover**：目标不在当前筛选结果内时，顶部提示条 +「在列表中定位」（用户主动滚动，避免 hover 抢滚动）。

### 5.4 统计分析

- `GET /api/analytics/overview`：组织范围内概览（项目、文档解析状态、报告、问题严重度等）。
- `GET /api/analytics/trends`：按日/周趋势（可选）。
- `GET /api/analytics/top`：Top N（问题类别、文档、项目）；文档/项目项返回 `id` + 名称，文档详情链到 `/projects/{projectId}/documents/{documentId}`。

日期参数：`from` 为当日 0 点，`to` 为当日 23:59:59.999（本地日界）。

---

## 6. API 概览

以下为常见端点（非全量枚举，以 `src/app/api` 为准）：

| 方法 | 路径 | 说明 |
|------|------|------|
| * | `/api/auth/[...nextauth]` | NextAuth |
| GET/POST | `/api/projects`、`/api/projects/[id]` | 项目 |
| GET/POST | `/api/documents`、`/api/documents/[id]`、`/parse`、`/file`、`/blocks` | 文档与解析 |
| GET/POST | `/api/reports`、`/api/reports/[id]`、`/generate`、`/issues` | 报告 |
| GET | `/api/analytics/overview`、`/top`、`/trends` | 统计 |
| GET | `/api/dev/login-default` | 仅 development：开发用默认登录信息（环境变量） |

**鉴权**：需登录的接口从 session 取用户与 `orgId`，查询范围限制在本组织项目内。

---

## 7. 前端体验设计要点

- **工作台布局**：侧栏导航 + 顶栏「当前位置」+ 主内容区 `#dashboard-scroll`（列表页滚动恢复）。
- **列表页**：粘性筛选条、筛选 chips、`TruncatedText` + `title` 展示全文。
- **登录**：支持「记住我」影响 JWT 时长；开发环境可从 `/api/dev/login-default` 预填（`DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD`）。
- **首页**：未登录跳转 `/login`，已登录跳转 `/projects`。

---

## 8. AI 子系统（Mastra）

- **入口**：`src/mastra/index.ts` 注册 `tender-review-supervisor` 及子 Agent（如 `content-review-agent`、`report-generation-agent` 等）。
- **模型**：子 Agent 可配置 `alibaba-coding-plan-cn/qwen3.6-plus` 等；需与部署环境 API Key 一致。
- **Memory**：PostgreSQL 存储 + 向量扩展（见 `src/mastra/storage`），Supervisor 流式调用时可传 `thread`（如 `reportId`）与 `resource`（如 `projectId`）。

---

## 9. 安全与非功能

- **多租户**：所有聚合与列表查询必须带组织/项目权限过滤。
- **文件访问**：PDF 文件路由应校验用户对该 `documentId` 的访问权限。
- **密钥**：大模型、数据库、NextAuth `SECRET` 等仅环境变量注入，不入库、不提交仓库。
- **局域网调试**：`next dev -H 0.0.0.0`；注意 `NEXTAUTH_URL` 与 Cookie 域名在 IP 访问下的一致性。

---

## 10. 配置与环境变量（常见）

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | PostgreSQL |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | 鉴权 |
| `ALIBABA_CODING_PLAN_API_KEY` | 阿里云 Coding Plan 模型（若使用） |
| `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD` | 仅开发：默认登录预填 |

（MinerU、存储路径等以项目 `.env.example` 或部署文档为准。）

---

## 11. 构建与运行

```bash
npm install
npm run db:migrate   # 或 db:push，视团队规范
npm run dev          # 开发
npm run build && npm run start   # 生产
```

Worker / 定时任务：见 `worker.ts`、`/api/cron/*`。

---

## 12. 已知限制与演进方向

- PDF 仅预览与标注叠层，**不**支持保存修改后的 PDF。
- 问题 **编辑/审计** 若产品需要，需新增 PATCH API 与 UI。
- 统计与 Top 榜依赖审查数据完整性；`issueCategory` 等维度若需深链到筛选列表，可扩展查询参数或专用列表页。
- Mastra 流式失败时的用户提示与报告状态回滚策略可在产品层进一步统一（例如 `failed` 状态）。

---

## 13. 文档维护

- 架构或表结构变更时，请同步更新本文件 **第 3.3（图）、4、5、6 节**。
- 新增重要 API 时，在 **第 6 节** 补充一行说明即可，避免与代码重复冗长描述。
- **架构图**：优先改 `3.3` 的 Mermaid；若需对外汇报，可从 Mermaid 导出 PNG/SVG 放入 `docs/images/`（可选，按需新增目录）。

### 还可补充的图（按需）

| 图类型 | 适用场景 |
|--------|----------|
| **部署图**（单机 / K8s / 反向代理 + 环境） | 运维、上生产前评审 |
| **解析管道**（上传 → MinerU → 回调/轮询 → blocks） | 排查解析失败、进度不准 |
| **权限模型**（org / project / role） | 若后续引入细粒度角色 |
| **C4 Container 更细一层**（Mastra、Worker、Cron 独立进程） | `worker.ts`、定时任务与 Web 分工变复杂时 |

当前以 **3.3 四张图** 为基线即可满足多数代码评审；更细的图建议在架构变复杂时再画，避免文档与代码双重维护成本过高。
