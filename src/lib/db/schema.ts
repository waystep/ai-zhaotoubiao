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
]);

// 问题严重程度
export const issueSeverityEnum = pgEnum("issue_severity", [
  "critical",      // 严重问题（必整改）
  "major",         // 重要问题
  "minor",         // 轻微问题
  "suggestion",    // 建议
]);

// 解析状态
export const parseStatusEnum = pgEnum("parse_status", [
  "pending",       // 待解析
  "processing",    // 解析中
  "completed",     // 已完成
  "failed",        // 解析失败
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
  blockType: varchar("block_type", { length: 50 }),   // 区块类型 (text, table, title, paragraph)
  // 区块内容
  content: text("content").notNull(),                 // 文本内容
  // MinerU 坐标信息
  bbox: jsonb("bbox").default({                       // 边界框坐标
    x0: 0, y0: 0, x1: 0, y1: 0
  }),
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
  blockId: uuid("block_id").references(() => documentBlocks.id), // 关联区块
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