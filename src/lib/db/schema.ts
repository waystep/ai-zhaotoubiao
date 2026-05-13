import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  decimal,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ==================== 枚举定义 ====================

// 组织类型
export const orgTypeEnum = pgEnum("org_type", [
  "tender_org",   // 招标机构
  "supplier",     // 供应商/投标方
  "review_org",   // 评审机构
]);

// 用户角色
export const userRoleEnum = pgEnum("user_role", [
  "tender_manager",   // 招标方管理员
  "tender_staff",     // 招标方工作人员
  "supplier_admin",   // 供应商管理员
  "supplier_staff",   // 供应商工作人员
  "review_expert",    // 评审专家
  "system_admin",     // 系统管理员
]);

// 项目状态
export const projectStatusEnum = pgEnum("project_status", [
  "draft",        // 草稿
  "published",    // 已发布招标公告
  "bidding",      // 投标进行中
  "reviewing",    // 审查进行中
  "completed",    // 已完成
  "archived",     // 已归档
]);

// 文档类型
export const docTypeEnum = pgEnum("doc_type", [
  "tender_doc",     // 招标文件
  "legal_doc",      // 法律文件
  "bid_doc",        // 投标文件
  "review_report",  // 审查报告
]);

// 审查状态
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",       // 待审查
  "in_progress",   // 审查中
  "completed",     // 已完成
  "failed",        // 审查失败
]);

// 问题严重程度
export const issueSeverityEnum = pgEnum("issue_severity", [
  "critical",      // 严重问题（必整改）
  "major",         // 重要问题
  "minor",         // 轻微问题
  "suggestion",    // 建议
]);

export const reviewItemResultStatusEnum = pgEnum("review_item_result_status", [
  "pass",
  "fail",
  "needs_manual_review",
]);

export const responseItemResultStatusEnum = pgEnum("response_item_result_status", [
  "answered",
  "partially_answered",
  "unanswered",
  "not_applicable",
]);

// 解析状态
export const parseStatusEnum = pgEnum("parse_status", [
  "pending",       // 待解析
  "processing",    // 解析中
  "completed",     // 已完成
  "failed",        // 解析失败
]);

// 图片风险分析状态
export const imageRiskStatusEnum = pgEnum("image_risk_status", [
  "pending",       // 待分析
  "processing",    // 分析中
  "completed",     // 已完成
  "failed",        // 分析失败
]);

// 提取状态
export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",       // 待提取
  "processing",    // 提取中
  "completed",     // 已完成
  "failed",        // 提取失败
]);

// 投标状态
export const bidStatusEnum = pgEnum("bid_status", [
  "draft",         // 草稿
  "submitted",     // 已提交
  "under_review",  // 审查中
  "accepted",      // 已接受
  "rejected",      // 已拒绝
  "withdrawn",     // 已撤回
]);

// ==================== 用户与认证 ====================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  name: varchar("name", { length: 255 }),
  avatar: text("avatar"),
  passwordHash: text("password_hash"),
  // 新增字段
  phone: varchar("phone", { length: 50 }),
  role: userRoleEnum("role").default("supplier_staff"),
  expertInfo: jsonb("expert_info").default({}),  // 专家信息（资质、专业领域等）
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** 邮箱重置密码一次性令牌（仅适用于本地 credentials 账号） */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== 组织架构 ====================

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  // 新增字段
  orgType: orgTypeEnum("org_type").notNull().default("supplier"),
  licenseNo: varchar("license_no", { length: 100 }),        // 营业执照号
  contactPerson: varchar("contact_person", { length: 100 }), // 联系人
  contactPhone: varchar("contact_phone", { length: 50 }),   // 联系电话
  address: text("address"),                                  // 地址
  qualification: jsonb("qualification").default({}),        // 资质信息
  logo: text("logo"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== 招标项目 ====================

export const tenderProjects = pgTable("tender_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  projectNo: varchar("project_no", { length: 100 }).notNull(),  // 项目编号
  description: text("description"),
  tenderType: varchar("tender_type", { length: 50 }),          // 招标类型
  budget: decimal("budget", { precision: 15, scale: 2 }),      // 预算金额
  deadline: timestamp("deadline"),                              // 截标时间
  status: projectStatusEnum("status").default("draft"),
  // 招标要求配置
  requirements: jsonb("requirements").default({
    qualification: [],    // 资质要求
    experience: [],       // 经验要求
    technical: [],        // 技术要求
    compliance: [],       // 合规要求
  }),
  // 评分规则配置
  scoringRules: jsonb("scoring_rules").default({
    weights: {
      price: 30,          // 价格权重
      technical: 40,      // 技术权重
      service: 20,        // 服务权重
      compliance: 10,     // 合规权重
    },
    criteria: [],
  }),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==================== 文档管理 ====================

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => tenderProjects.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  docType: docTypeEnum("doc_type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  storagePath: text("storage_path").notNull(),      // 存储路径
  // MinerU 解析状态
  parseStatus: parseStatusEnum("parse_status").default("pending"),
  parseError: text("parse_error"),
  parsedAt: timestamp("parsed_at"),
  // 异步任务追踪
  mineruTaskId: varchar("mineru_task_id", { length: 100 }),
  taskProgress: integer("task_progress").default(0),
  taskSubmittedAt: timestamp("task_submitted_at"),
  // 提取状态
  extractionStatus: extractionStatusEnum("extraction_status").default("pending"),
  extractionError: text("extraction_error"),
  extractedAt: timestamp("extracted_at"),
  extractionTaskId: varchar("extraction_task_id", { length: 100 }),
  extractionProgress: integer("extraction_progress").default(0),
  reviewItemsCount: integer("review_items_count").default(0),   // @deprecated 使用 extractionItemsCount
  responseItemsCount: integer("response_items_count").default(0), // @deprecated 使用 extractionItemsCount
  extractionItemsCount: integer("extraction_items_count").default(0),
  autoExtract: boolean("auto_extract").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 文档解析结果表 - 支持 MinerU 返回的页码、区块信息
export const documentParsedResults = pgTable("document_parsed_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  // 整体解析结果
  totalPages: integer("total_pages").notNull(),
  fullText: text("full_text"),                        // 全文内容
  structuredContent: jsonb("structured_content").default({}), // 结构化内容
  // MinerU 原始返回数据
  mineruRawData: jsonb("mineru_raw_data").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 文档区块表 - 精确定位问题位置
export const documentBlocks = pgTable("document_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  parsedResultId: uuid("parsed_result_id")
    .notNull()
    .references(() => documentParsedResults.id, { onDelete: "cascade" }),
  // 位置信息
  pageNumber: integer("page_number").notNull(),       // 页码
  blockIndex: integer("block_index").notNull(),       // 区块序号
  blockType: varchar("block_type", { length: 50 }),   // 区块类型 (text, table, title, paragraph, image)
  // 区块内容
  content: text("content").notNull(),                 // 文本内容
  // MinerU 坐标信息
  bbox: jsonb("bbox").default({                       // 边界框坐标
    x0: 0, y0: 0, x1: 0, y1: 0
  }),
  // 图片路径（仅 image 类型区块）
  imagePath: varchar("image_path", { length: 255 }),  // 图片相对路径
  // 关联信息
  parentBlockId: uuid("parent_block_id"),             // 父区块ID（如表格中的单元格）
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== 审查报告 ====================

export const reviewReports = pgTable("review_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => tenderProjects.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  status: reviewStatusEnum("status").default("pending"),
  // AI 审查结果
  aiScore: decimal("ai_score", { precision: 5, scale: 2 }),    // AI评分
  aiAnalysis: jsonb("ai_analysis").default({}),                // AI分析详情
  // 人工审查结果
  manualScore: decimal("manual_score", { precision: 5, scale: 2 }),
  manualAnalysis: jsonb("manual_analysis").default({}),
  // 最终结果
  finalScore: decimal("final_score", { precision: 5, scale: 2 }),
  recommendation: varchar("recommendation", { length: 50 }),   // 建议结论 (pass, fail, revise)
  summary: text("summary"),                                    // 审查摘要
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 审查问题表 - 定位到具体位置
export const reviewIssues = pgTable("review_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reviewReports.id, { onDelete: "cascade" }),
  blockId: uuid("block_id").references(() => documentBlocks.id, { onDelete: "set null" }), // 删除block时设为null，保留问题记录
  checkpointId: varchar("checkpoint_id", { length: 100 }), // 关联检查点ID
  agentSource: varchar("agent_source", { length: 100 }), // 发现问题的智能体来源
  // 问题信息
  category: varchar("category", { length: 100 }).notNull(),       // 问题类别
  severity: issueSeverityEnum("severity").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  // 位置标注（支持多种定位方式）
  location: jsonb("location").notNull().default({
    pageNumber: 0,
    blockIndex: 0,
    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
    textSnippet: "",    // 问题文本片段
    highlightText: "",  // 高亮文本
  }),
  // 修复建议
  suggestion: text("suggestion"),
  // 审核状态
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 图片风险分析表 - 存储图片风险检测结果
export const imageRiskAnalysis = pgTable("image_risk_analysis", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  blockId: uuid("block_id")
    .references(() => documentBlocks.id, { onDelete: "set null" }),
  // 图片信息
  imagePath: varchar("image_path", { length: 255 }).notNull(),
  pageNumber: integer("page_number").notNull(),
  // 分析状态
  status: imageRiskStatusEnum("status").default("pending"),
  error: text("error"),
  // 分析结果
  hasRisk: boolean("has_risk"),
  riskType: varchar("risk_type", { length: 100 }),
  riskText: varchar("risk_text", { length: 255 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  reason: text("reason"),
  suggestion: text("suggestion"),
  // 原始响应
  rawResponse: jsonb("raw_response").default({}),
  // 审核状态
  isVerified: boolean("is_verified").default(false),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reviewItemResults = pgTable("review_item_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reviewReports.id, { onDelete: "cascade" }),
  reviewItemId: uuid("review_item_id")
    .notNull()
    .references(() => reviewItems.id, { onDelete: "cascade" }),
  status: reviewItemResultStatusEnum("status").notNull(),
  reason: text("reason").notNull(),
  evidenceBlockIds: jsonb("evidence_block_ids").default([]),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const responseItemResults = pgTable("response_item_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reviewReports.id, { onDelete: "cascade" }),
  responseItemId: uuid("response_item_id")
    .notNull()
    .references(() => responseItems.id, { onDelete: "cascade" }),
  status: responseItemResultStatusEnum("status").notNull(),
  reason: text("reason").notNull(),
  evidenceBlockIds: jsonb("evidence_block_ids").default([]),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==================== 审查项与响应项 ====================

// 审查项表 - 存储从招标文件和法律文件中提取的强制性要求条款
export const reviewItems = pgTable("review_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => tenderProjects.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  sourceBlockId: uuid("source_block_id")
    .references(() => documentBlocks.id, { onDelete: "set null" }),

  // 审查项基本信息（itemType使用文本类型，支持灵活扩展）
  itemType: varchar("item_type", { length: 100 }).notNull(),  // 审查项类型（如：资质要求、技术要求等）
  itemNo: varchar("item_no", { length: 100 }),                // 条款编号（如：第三章第5条）
  title: varchar("title", { length: 500 }).notNull(),         // 审查项标题
  description: text("description").notNull(),                 // 详细描述

  // 原文定位信息
  location: jsonb("location").notNull().default({
    pageNumber: 0,
    blockIndex: 0,
    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
    textSnippet: "",
    highlightText: "",
  }),

  // 审查要求详情
  requirements: jsonb("requirements").default({
    mandatory: true,               // 是否强制性要求
    threshold: null,               // 门槛值（如：资质等级、金额）
    criteria: [],                  // 具体标准列表
    proofRequired: [],             // 需提供的证明材料
  }),

  // 不满足的后果和法律依据
  consequence: varchar("consequence", { length: 100 }),        // 不满足后果（废标/违规/违法/扣分等）
  legalReference: text("legal_reference"),                     // 法律法规依据

  // 提取元数据
  extractionStatus: extractionStatusEnum("extraction_status").default("completed"),
  extractedBy: varchar("extracted_by", { length: 100 }),       // 提取智能体来源
  extractionConfidence: decimal("extraction_confidence", { precision: 5, scale: 2 }), // 提取置信度
  extractionMetadata: jsonb("extraction_metadata").default({}), // 提取过程元数据

  // 验证状态
  isVerified: boolean("is_verified").default(false),           // 是否人工验证
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 响应项表 - 存储从招标文件中提取的要求投标人明确说明的内容
export const responseItems = pgTable("response_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => tenderProjects.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  sourceBlockId: uuid("source_block_id")
    .references(() => documentBlocks.id, { onDelete: "set null" }),

  // 响应项基本信息（responseType使用文本类型，支持灵活扩展）
  responseType: varchar("response_type", { length: 100 }).notNull(), // 响应类型（如：技术方案、人员配置等）
  itemNo: varchar("item_no", { length: 100 }),                       // 条款编号
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),

  // 原文定位信息
  location: jsonb("location").notNull().default({
    pageNumber: 0,
    blockIndex: 0,
    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
    textSnippet: "",
    highlightText: "",
  }),

  // 响应内容详情
  responseRequirements: jsonb("response_requirements").default({
    requiredFormat: null,          // 要求格式（文字说明/表格/图纸/证明材料）
    requiredContent: [],           // 要求内容列表
    minLength: null,               // 最小字数要求
    attachments: [],               // 需要的附件列表
  }),

  // 评分信息（如果影响评分）
  scoringInfo: jsonb("scoring_info").default({
    weight: null,                  // 权重分值
    scoringCriteria: null,         // 评分标准
  }),

  // 提取元数据
  extractionStatus: extractionStatusEnum("extraction_status").default("completed"),
  extractedBy: varchar("extracted_by", { length: 100 }),
  extractionConfidence: decimal("extraction_confidence", { precision: 5, scale: 2 }),
  extractionMetadata: jsonb("extraction_metadata").default({}),

  // 验证状态
  isVerified: boolean("is_verified").default(false),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 统一提取项表（审查项 / 检查点）
export const extractionItems = pgTable("extraction_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => tenderProjects.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  sourceBlockId: uuid("source_block_id")
    .references(() => documentBlocks.id, { onDelete: "set null" }),

  // 标段：技术标 / 商务标
  section: varchar("section", { length: 20 }),

  // 审查项标题（类型名，如：完整性、关键信息一致性、质量目标等）
  title: varchar("title", { length: 200 }).notNull(),

  // 检查点：具体的审查判定标准
  checkpoint: text("checkpoint").notNull(),

  // 后果/置信度权重（0-1）
  consequence: decimal("consequence", { precision: 5, scale: 2 }),

  // 原文定位
  location: jsonb("location").notNull().default({
    pageNumber: 0,
    blockIndex: 0,
    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
    textSnippet: "",
    highlightText: "",
  }),

  // 提取元数据
  extractedBy: varchar("extracted_by", { length: 100 }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 向量类型 — 优先使用 pgvector，不可用时降级为 jsonb
// pgvector 未安装时需手动改为 jsonb("embedding") 后重建迁移
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    // pgvector 可用时使用 vector(768)，否则降级为 jsonb
    return process.env.VECTOR_AVAILABLE === "true" ? "vector(768)" : "jsonb";
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    if (typeof value === "string") {
      // pgvector 返回的向量格式: [0.1,0.2,...]
      try { return JSON.parse(value); } catch { return []; }
    }
    return (value as unknown as number[]) || [];
  },
});

// 文档页面嵌入表 - 用于RAG语义搜索
export const documentPageEmbeddings = pgTable("document_page_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  parsedResultId: uuid("parsed_result_id")
    .notNull()
    .references(() => documentParsedResults.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  // 该页内的chunk序号（0-based），同一页每个chunk对应一组相邻block
  chunkIndex: integer("chunk_index").notNull().default(0),
  // chunk 文本（3-8个相邻block的内容）
  pageText: text("page_text").notNull(),
  // 关联的block ID列表，用于回溯定位
  blockIds: jsonb("block_ids").notNull().default([]),
  // 嵌入向量（JSON数组）
  embedding: vector("embedding").notNull(),
  embeddingModel: varchar("embedding_model", { length: 100 }).default("text-embedding-3-small"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== 投标记录 ====================

export const bidSubmissions = pgTable("bid_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => tenderProjects.id, { onDelete: "cascade" }),
  supplierOrgId: uuid("supplier_org_id")
    .notNull()
    .references(() => organizations.id),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => users.id),
  // 投标信息
  bidPrice: decimal("bid_price", { precision: 15, scale: 2 }),
  bidDescription: text("bid_description"),
  status: bidStatusEnum("status").default("draft"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==================== 权限系统 ====================

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: varchar("resource", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: userRoleEnum("role").notNull(),
  permissionId: uuid("permission_id")
    .notNull()
    .references(() => permissions.id),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }),
  resourceId: uuid("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== 关系定义 ====================

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(organizationMembers),
  projects: many(tenderProjects),
  documents: many(documents),
  reports: many(reviewReports),
  bids: many(bidSubmissions),
}));

export const organizationsRelations = relations(
  organizations,
  ({ many }) => ({
    members: many(organizationMembers),
    departments: many(departments),
    projects: many(tenderProjects),
    bids: many(bidSubmissions),
  })
);

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.orgId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
  })
);

export const departmentsRelations = relations(departments, ({ one }) => ({
  organization: one(organizations, {
    fields: [departments.orgId],
    references: [organizations.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const tenderProjectsRelations = relations(tenderProjects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tenderProjects.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [tenderProjects.createdBy],
    references: [users.id],
  }),
  documents: many(documents),
  reviewReports: many(reviewReports),
  bidSubmissions: many(bidSubmissions),
  reviewItems: many(reviewItems),
  responseItems: many(responseItems),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  project: one(tenderProjects, {
    fields: [documents.projectId],
    references: [tenderProjects.id],
  }),
  uploader: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
  parsedResult: one(documentParsedResults),
  reviewReports: many(reviewReports),
  reviewItems: many(reviewItems),
  responseItems: many(responseItems),
  extractionItems: many(extractionItems),
  imageRiskAnalysis: many(imageRiskAnalysis),
}));

export const documentParsedResultsRelations = relations(
  documentParsedResults,
  ({ one, many }) => ({
    document: one(documents, {
      fields: [documentParsedResults.documentId],
      references: [documents.id],
    }),
    blocks: many(documentBlocks),
  })
);

export const documentBlocksRelations = relations(documentBlocks, ({ one, many }) => ({
  parsedResult: one(documentParsedResults, {
    fields: [documentBlocks.parsedResultId],
    references: [documentParsedResults.id],
  }),
  issues: many(reviewIssues),
}));

export const reviewReportsRelations = relations(reviewReports, ({ one, many }) => ({
  project: one(tenderProjects, {
    fields: [reviewReports.projectId],
    references: [tenderProjects.id],
  }),
  document: one(documents, {
    fields: [reviewReports.documentId],
    references: [documents.id],
  }),
  reviewer: one(users, {
    fields: [reviewReports.reviewedBy],
    references: [users.id],
  }),
  issues: many(reviewIssues),
  reviewItemResults: many(reviewItemResults),
  responseItemResults: many(responseItemResults),
}));

export const reviewIssuesRelations = relations(reviewIssues, ({ one }) => ({
  report: one(reviewReports, {
    fields: [reviewIssues.reportId],
    references: [reviewReports.id],
  }),
  block: one(documentBlocks, {
    fields: [reviewIssues.blockId],
    references: [documentBlocks.id],
  }),
}));

export const imageRiskAnalysisRelations = relations(imageRiskAnalysis, ({ one }) => ({
  document: one(documents, {
    fields: [imageRiskAnalysis.documentId],
    references: [documents.id],
  }),
  block: one(documentBlocks, {
    fields: [imageRiskAnalysis.blockId],
    references: [documentBlocks.id],
  }),
  verifier: one(users, {
    fields: [imageRiskAnalysis.verifiedBy],
    references: [users.id],
  }),
}));

export const extractionItemsRelations = relations(extractionItems, ({ one }) => ({
  document: one(documents, {
    fields: [extractionItems.documentId],
    references: [documents.id],
  }),
  project: one(tenderProjects, {
    fields: [extractionItems.projectId],
    references: [tenderProjects.id],
  }),
  sourceBlock: one(documentBlocks, {
    fields: [extractionItems.sourceBlockId],
    references: [documentBlocks.id],
  }),
}));

export const reviewItemResultsRelations = relations(reviewItemResults, ({ one }) => ({
  report: one(reviewReports, {
    fields: [reviewItemResults.reportId],
    references: [reviewReports.id],
  }),
  reviewItem: one(reviewItems, {
    fields: [reviewItemResults.reviewItemId],
    references: [reviewItems.id],
  }),
}));

export const responseItemResultsRelations = relations(responseItemResults, ({ one }) => ({
  report: one(reviewReports, {
    fields: [responseItemResults.reportId],
    references: [reviewReports.id],
  }),
  responseItem: one(responseItems, {
    fields: [responseItemResults.responseItemId],
    references: [responseItems.id],
  }),
}));

export const reviewItemsRelations = relations(reviewItems, ({ one, many }) => ({
  project: one(tenderProjects, {
    fields: [reviewItems.projectId],
    references: [tenderProjects.id],
  }),
  document: one(documents, {
    fields: [reviewItems.documentId],
    references: [documents.id],
  }),
  sourceBlock: one(documentBlocks, {
    fields: [reviewItems.sourceBlockId],
    references: [documentBlocks.id],
  }),
  verifier: one(users, {
    fields: [reviewItems.verifiedBy],
    references: [users.id],
  }),
  results: many(reviewItemResults),
}));

export const responseItemsRelations = relations(responseItems, ({ one, many }) => ({
  project: one(tenderProjects, {
    fields: [responseItems.projectId],
    references: [tenderProjects.id],
  }),
  document: one(documents, {
    fields: [responseItems.documentId],
    references: [documents.id],
  }),
  sourceBlock: one(documentBlocks, {
    fields: [responseItems.sourceBlockId],
    references: [documentBlocks.id],
  }),
  verifier: one(users, {
    fields: [responseItems.verifiedBy],
    references: [users.id],
  }),
  results: many(responseItemResults),
}));

export const bidSubmissionsRelations = relations(bidSubmissions, ({ one }) => ({
  project: one(tenderProjects, {
    fields: [bidSubmissions.projectId],
    references: [tenderProjects.id],
  }),
  supplierOrg: one(organizations, {
    fields: [bidSubmissions.supplierOrgId],
    references: [organizations.id],
  }),
  submitter: one(users, {
    fields: [bidSubmissions.submittedBy],
    references: [users.id],
  }),
}));
