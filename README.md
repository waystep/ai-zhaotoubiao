# 智能招投标预审平台

智能招投标预审平台：AI 驱动的招标文件智能审查与分析应用，支持文档解析、合规性审查、智能评分与报告生成。

## 功能特性

- **文档管理**: 上传、解析、管理招标文件和投标文件
- **智能解析**: MinerU 高精度文档解析，支持表格、图片、公式提取
- **审查项提取**: AI 自动从招标文件提取强制性审查条款
- **智能审查**: Mastra 多智能体协作完成投标文件全面审查
- **问题定位**: 精确定位到文档页码、区块、坐标的问题标注
- **报告生成**: 自动生成结构化审查报告，含评分和建议

## 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | Next.js 15 (App Router) + React 19 |
| **UI 组件** | shadcn/ui + Radix + Tailwind CSS |
| **数据库** | PostgreSQL + Drizzle ORM |
| **认证** | NextAuth.js v5 (JWT) |
| **AI 框架** | Mastra (多智能体架构) |
| **文档解析** | MinerU API |
| **AI 模型** | 阿里云 DashScope (Qwen/GLM) |

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 15+
- MinerU 服务 (本地部署或云服务)

### 安装步骤

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

# MinerU
MINERU_API_URL=http://127.0.0.1:8000
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

### 启动 MinerU 服务

```bash
# Docker 方式
docker run -d --name mineru -p 8000:8000 opendatalab/mineru:latest

# 或 pip 安装
pip install magic-pdf
magic-pdf --start-server --port 8000
```

## 项目结构

```
ai-shencha/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # 认证路由组
│   │   ├── (dashboard)/       # 主应用路由组
│   │   └── api/               # API 路由
│   ├── components/            # React 组件
│   │   ├── ui/               # shadcn/ui 基础组件
│   │   ├── chat/             # AI 对话组件
│   │   ├── document/         # 文档预览组件
│   │   └── providers/        # Context Providers
│   ├── lib/                   # 核心库
│   │   ├── auth/             # NextAuth 配置
│   │   ├── db/               # Drizzle Schema
│   │   ├── ai/               # MinerU 客户端
│   │   └── tasks/            # 定时任务
│   ├── mastra/               # Mastra 智能体系统
│   │   ├── agents/           # 7 个智能体
│   │   ├── tools/            # 15 个工具
│   │   └── config/           # 模型和提示词配置
│   └── types/                 # TypeScript 类型定义
├── docs/                      # 技术文档
│   ├── architecture/         # 架构文档
│   ├── modules/              # 模块文档
│   ├── api/                  # API 文档
│   ├── database/             # 数据库文档
│   ├── deployment/           # 部署文档
│   ├── config/               # 配置文档
│   ├── operations/           # 运维手册
│   ├── development/          # 开发规范
│   └── workflows/            # 流程说明
├── uploads/                   # 文件存储目录
└── drizzle/                   # 数据库迁移文件
```

## 开发命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
npm run worker       # 启动后台 Worker

npm run db:generate  # 生成数据库迁移
npm run db:migrate   # 执行迁移
npm run db:push      # 直接推送 Schema
npm run db:studio    # 打开 Drizzle Studio

npm run mastra:dev   # 启动 Mastra Studio
```

## 技术文档

完整技术文档位于 `docs/` 目录：

| 文档 | 位置 | 说明 |
|------|------|------|
| 系统架构 | `docs/architecture/系统架构文档.md` | 整体架构设计 |
| 数据库设计 | `docs/database/数据库设计.md` | Schema 和关系说明 |
| 配置说明 | `docs/config/配置说明.md` | 环境变量和配置 |
| AI审查系统 | `docs/modules/AI审查系统.md` | Mastra 智能体架构 |
| 部署方式 | `docs/deployment/部署方式.md` | 各部署方案说明 |
| 运维手册 | `docs/operations/运维手册.md` | 监控和故障处理 |
| 开发规范 | `docs/development/开发规范.md` | Git、代码、API 规范 |
| API 概览 | `docs/api/API概览.md` | API 路由结构 |
| 流程说明 | `docs/workflows/*.md` | 各业务流程详解 |

## AI 智能体架构

采用 Mastra 多智能体协作模式：

```
Supervisor Agent (总协调者)
├── Extraction Agent (文档提取专家)
├── Content Review Agent (内容审查专家)
├── Image Review Agent (图像审查专家)
├── Response Agent (响应评估专家)
└── Report Generation Agent (报告生成专家)
```

审查流程：
1. 提取招标文件审查项和响应项
2. 逐项验证投标文件合规性
3. 检查图表印章等图像内容
4. 汇总结果生成结构化报告

## 认证支持

- **邮箱密码**: Credentials 登录 + 密码重置
- **GitHub OAuth**: GitHub 账号登录
- **Google OAuth**: Google 账号登录
- **记住我**: 可选延长 Session 有效期

## 数据隔离

基于组织的数据隔离策略：
- 用户属于组织
- 项目绑定组织
- 所有数据按 orgId 隔离

## 许可证

MIT
