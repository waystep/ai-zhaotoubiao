import { z } from "zod";

// 项目状态
export type ProjectStatus =
  | "draft"
  | "published"
  | "bidding"
  | "reviewing"
  | "completed"
  | "archived";

// 招标项目
export interface TenderProject {
  id: string;
  orgId: string;
  createdBy: string;
  name: string;
  projectNo: string;
  description?: string;
  tenderType?: string;
  budget?: number;
  deadline?: Date;
  status: ProjectStatus;
  requirements?: ProjectRequirements;
  scoringRules?: ScoringRules;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 项目要求配置
export interface ProjectRequirements {
  qualification: string[];    // 资质要求
  experience: string[];       // 经验要求
  technical: string[];        // 技术要求
  compliance: string[];       // 合规要求
}

// 评分规则配置
export interface ScoringRules {
  weights: {
    price: number;           // 价格权重
    technical: number;       // 技术权重
    service: number;         // 服务权重
    compliance: number;      // 合规权重
  };
  criteria: ScoringCriteria[];
}

// 评分标准
export interface ScoringCriteria {
  id: string;
  name: string;
  description?: string;
  maxScore: number;
  weight: number;
  evaluationMethod: "manual" | "automatic";
}

// 创建项目 Schema（与 POST /api/projects 一致：编号可省略，由服务端生成）
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "项目名称不能为空"),
  projectNo: z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      if (typeof v === "string" && v.trim() === "") return undefined;
      return v;
    },
    z.string().trim().min(1, "项目编号不能为空").optional(),
  ),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  ),
  tenderType: z.string().optional(),
  budget: z.number().positive().optional(),
  deadline: z.string().optional(),
  requirements: z.object({
    qualification: z.array(z.string()).default([]),
    experience: z.array(z.string()).default([]),
    technical: z.array(z.string()).default([]),
    compliance: z.array(z.string()).default([]),
  }).optional(),
  scoringRules: z.object({
    weights: z.object({
      price: z.number().default(30),
      technical: z.number().default(40),
      service: z.number().default(20),
      compliance: z.number().default(10),
    }).optional(),
    criteria: z.array(z.any()).default([]).optional(),
  }).optional(),
});

// 更新项目 Schema
export const updateProjectSchema = createProjectSchema.partial();