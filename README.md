# 智能招投标预审平台

> AI 驱动的招标文件智能审查与分析应用 —— 支持文档高精度解析、合规性审查、智能评分与 PDF 报告生成。

## ✨ 功能特性

### 核心功能

- **文档管理** — 上传、解析、管理招标文件和投标文件，支持 PDF / DOCX / 图片等多种格式
- **智能解析** — MinerU 高精度文档解析，支持表格、图片、公式提取，同时支持本地部署与云端解析
- **审查项提取** — AI 自动从招标文件提取强制性审查条款
- **智能审查** — Mastra 多智能体协作完成投标文件全面审查（内容 + 图像 + 合规）
- **问题定位** — 精确定位到文档页码、区块、坐标的问题标注
- **报告生成** — 自动生成结构化审查报告，含评分、建议，支持 **PDF 导出**

### 平台能力

- **项目管理** — 完整的项目生命周期管理（草稿 → 发布 → 评标 → 审查 → 完成 → 归档）
- **数据分析** — 审查趋势、项目概览等可视化数据分析面板
- **AI 对话** — 基于审查结果的智能问答，可针对报告进行追问
- **多组织隔离** — 基于组织的数据隔离策略，保障数据安全
- **Docker 部署** — 一键 Docker Compose 编排部署（App + Worker + DB + MinerU）

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | Next.js 15 (App Router) + React 19 + TypeScript |
| **UI 组件** | shadcn/ui + Radix UI + Tailwind CSS + Lucide Icons |
| **数据库** | PostgreSQL 15 + Drizzle ORM |
| **认证** | NextAuth.js v5 (JWT) |
| **AI 框架** | Mastra (多智能体协作架构) |
| **文档解析** | MinerU API (本地部署 / 云端服务) |
| **AI 模型** | 阿里云 DashScope (Qwen-3-Max / Qwen-3.6-Plus) |
| **PDF 生成** | PDFKit |
| **交互增强** | CopilotKit + React Flow + Rive 动画 |
| **容器化** | Docker + Docker Compose |

## 🚀 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 15+
- MinerU 服务（本地部署或云端 API）

### 方式一：Docker Compose 一键部署（推荐）

```bash
# 1. 配置环境变量
cp .env.example .env.production
# 编辑 .env.production 填入必要的 API Key 等配置

# 2. 一键启动所有服务（App + Worker + PostgreSQL + MinerU）
docker compose up -d

# 3. 访问应用
# http://localhost:3000
```

Docker Compose 会自动编排以下服务：

| 服务 | 说明 |
|------|------|
| `app` | Next.js 应用主服务 |
| `worker` | 后台任务 Worker（文档解析、定时检查等） |
| `db` | PostgreSQL 数据库 |
| `mineru` | MinerU 文档解析服务 |
| `migrate` | 数据库迁移（一次性任务，完成后自动退出） |

### 方式二：本地开发

1. 克隆项目并安装依赖：

```bash
git clone <repository-url>
cd ai-shencha
npm install
```

2. 配置环境变量：

```bash
cp .env.example .env
```

编辑 `.env` 配置必需变量：

```bash
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/smart_tender_review

# 认证
AUTH_SECRET=your-secret-key
AUTH_URL=http://localhost:3000

# AI 模型
ALIBABA_API_KEY=sk-xxx

# MinerU（二选一：本地部署或云端服务）
MINERU_API_URL=http://127.0.0.1:8000
# MINERU_CLOUD_API_URL=https://api.mineru.com   # 云端解析
# MINERU_CLOUD_API_KEY=your-cloud-api-key
```

3. 初始化数据库：

```bash
npm run db:push
```

4. 启动开发服务器：

```bash
npm run dev
```

访问 http://localhost:3000

### 启动 MinerU 本地服务

```bash
# Docker 方式（推荐）
docker run -d --name mineru -p 8000:8000 opendatalab/mineru:latest

# 或 pip 安装
pip install magic-pdf
magic-pdf --start-server --port 8000
```

## 📁 项目结构

```
ai-shencha/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # 认证路由组
│   │   │   ├── login/             # 登录
│   │   │   ├── register/          # 注册
│   │   │   ├── forgot-password/   # 忘记密码
│   │   │   └── reset-password/    # 重置密码
│   │   ├── (dashboard)/           # 主应用路由组
│   │   │   ├── page.tsx           # 首页仪表盘
│   │   │   ├── projects/          # 项目管理
│   │   │   │   ├── [projectId]/   # 项目工作台
│   │   │   │   │   ├── documents/       # 文档管理 + 上传
│   │   │   │   │   ├── extraction-items/# 审查项管理
│   │   │   │   │   ├── reports/         # 审查报告 + PDF 导出
│   │   │   │   │   └── settings/        # 项目设置
│   │   │   │   └── new/           # 新建项目
│   │   │   ├── analytics/         # 数据分析面板
│   │   │   ├── chat/              # AI 对话
│   │   │   ├── documents/         # 全局文档管理
│   │   │   └── settings/          # 全局设置
│   │   └── api/                   # API 路由
│   │       ├── auth/              # 认证 API
│   │       ├── projects/          # 项目 API
│   │       ├── documents/         # 文档 API（解析/提取/嵌入等）
│   │       ├── reports/           # 报告 API（生成/导出）
│   │       ├── extraction-items/  # 审查项 API
│   │       ├── mastra/            # Mastra 智能体 API
│   │       ├── ai/                # AI 审查 API
│   │       ├── chat/              # 对话 API
│   │       ├── mineru*/           # MinerU 相关 API
│   │       ├── analytics/         # 数据分析 API
│   │       ├── upload/            # 文件上传 API
│   │       └── cron/              # 定时任务 API
│   ├── components/                # React 组件
│   │   ├── ui/                    # shadcn/ui 基础组件
│   │   ├── chat/                  # AI 对话组件
│   │   ├── document/              # 文档预览组件
│   │   ├── review/                # 审查分析组件
│   │   └── providers/             # Context Providers
│   ├── lib/                       # 核心库
│   │   ├── auth/                  # NextAuth 配置
│   │   ├── db/                    # Drizzle Schema + 客户端
│   │   ├── ai/                    # MinerU 客户端 + 嵌入 + 审查
│   │   ├── storage/               # 文件存储
│   │   ├── email/                 # 邮件服务
│   │   ├── forms/                 # 表单验证 Schema
│   │   ├── tasks/                 # 后台定时任务
│   │   ├── services/              # 业务服务层
│   │   ├── nav/                   # 导航配置
│   │   └── ui/                    # UI 工具函数
│   ├── mastra/                    # Mastra 智能体系统
│   │   ├── agents/                # 5 个专业智能体
│   │   ├── tools/                 # 16 个工具
│   │   └── config/                # 模型和提示词配置
│   └── types/                     # TypeScript 类型定义
├── docs/                          # 技术文档
│   ├── architecture/              # 架构文档
│   ├── modules/                   # 模块文档
│   ├── api/                       # API 文档
│   ├── database/                  # 数据库文档
│   ├── deployment/                # 部署文档
│   ├── config/                    # 配置文档
│   ├── operations/                # 运维手册
│   ├── development/               # 开发规范
│   ├── workflows/                 # 流程说明
│   └── minerU/                    # MinerU 集成文档
├── uploads/                       # 文件存储目录
├── drizzle/                       # 数据库迁移文件
├── docker-compose.yml             # Docker 编排配置
├── Dockerfile                     # 容器构建文件
└── worker.ts                      # 后台 Worker 入口
```

## 📋 开发命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run start            # 启动生产服务器
npm run worker           # 启动后台 Worker
npm run lint             # 代码检查

# 数据库
npm run db:generate      # 生成数据库迁移
npm run db:migrate       # 执行迁移
npm run db:push          # 直接推送 Schema
npm run db:studio        # 打开 Drizzle Studio
npm run db:seed          # 初始化种子数据

# Mastra
npm run mastra:dev       # 启动 Mastra Studio
npm run mastra:build     # 构建 Mastra
```

## 🤖 AI 智能体架构

采用 Mastra 多智能体协作模式，5 个专业智能体分工协作：

```
Supervisor Agent (总协调者)
├── Extraction Agent (文档提取专家)       — 从招标文件提取审查项和响应项
├── Content Review Agent (内容审查专家)   — 逐项验证投标文件合规性
├── Image Review Agent (图像审查专家)     — 检查图表印章等图像内容
└── Report Generation Agent (报告生成专家) — 汇总结果生成结构化审查报告
```

配合 **16 个专业工具** 实现完整的审查工作流：

| 类别 | 工具 |
|------|------|
| **文档分析** | `document-analysis-tool` · `document-reader-tool` · `get-document-info-tool` |
| **审查项管理** | `extraction-item-storage-tool` · `get-review-items-tool` · `get-standard-documents-parse-status-tool` |
| **报告生成** | `get-report-tool` · `get-report-info-tool` · `report-status-update-tool` · `resolve-review-report-tool` |
| **问题与评分** | `issue-storage-tool` · `review-results-storage-tool` · `report-summary-storage-tool` |
| **智能搜索** | `semantic-search-tool` · `web-search-tool` |
| **图像分析** | `get-image-risks-tool` |

### 审查流程

```
1. 文档上传 → MinerU 解析 → 结构化块提取
2. AI 提取审查项 → 标注强制性和评分权重
3. 多智能体协作审查 → 内容 + 图像双重验证
4. 自动评分 → 按严重程度分级（严重 / 主要 / 次要 / 建议）
5. 生成报告 → 支持在线查看和 PDF 导出
```

## 🔐 认证支持

- **邮箱密码** — Credentials 登录 + 密码重置（邮件链接）
- **GitHub OAuth** — GitHub 账号一键登录
- **Google OAuth** — Google 账号一键登录
- **记住我** — 可选延长 Session 有效期

## 🏢 数据隔离

基于组织的数据隔离策略：

- 用户属于组织
- 项目绑定组织
- 所有数据按 `orgId` 隔离
- 跨组织数据不可见

## 📚 技术文档

完整技术文档位于 `docs/` 目录：

| 文档 | 位置 | 说明 |
|------|------|------|
| 系统架构 | `docs/architecture/系统架构文档.md` | 整体架构设计 |
| 数据库设计 | `docs/database/数据库设计.md` | Schema 和关系说明 |
| 配置说明 | `docs/config/配置说明.md` | 环境变量和配置 |
| AI 审查系统 | `docs/modules/AI审查系统.md` | Mastra 智能体架构 |
| 智能审查流程 | `docs/minerU/智能审查流程设计文档.md` | 审查流程设计 |
| 部署方式 | `docs/deployment/部署方式.md` | 各部署方案说明 |
| 运维手册 | `docs/operations/运维手册.md` | 监控和故障处理 |
| 开发规范 | `docs/development/开发规范.md` | Git、代码、API 规范 |
| API 概览 | `docs/api/API概览.md` | API 路由结构 |
| 报告生成流程 | `docs/workflows/报告生成流程.md` | 报告生成工作流 |
| 文档解析流程 | `docs/workflows/文档解析流程.md` | MinerU 解析工作流 |
| 用户认证流程 | `docs/workflows/用户认证流程.md` | 认证与授权流程 |
| 项目方案说明书 | `docs/项目方案说明书.md` | 产品方案说明 |
| 设计文档 RFC | `docs/2026-CICC-设计文档-RFC.md` | 设计评审文档 |
| 平台优化建议 | `docs/PLATFORM_OPTIMIZATION_RECOMMENDATIONS.md` | 优化方向与建议 |

## 📄 许可证

MIT
