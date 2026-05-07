// MinerU API 类型定义（基于实际 API 规范）
// 参考: https://github.com/opendatalab/MinerU

// MinerU 解析请求参数
export interface MineruParseRequest {
  // 文件路径（本地存储路径）
  filePath: string;
  // 文件 MIME 类型
  mimeType: string;
  // 文件名
  fileName?: string;
  // 解析选项
  options?: MineruParseOptions;
}

// MinerU 解析选项
export interface MineruParseOptions {
  // 解析方法: auto, ocr, txt
  parseMethod?: "auto" | "ocr" | "txt";
  // 是否提取表格
  extractTables?: boolean;
  // 是否提取图片
  extractImages?: boolean;
  // 是否返回图片（MinerU API 参数）
  returnImages?: boolean;
  // 是否保留布局
  preserveLayout?: boolean;
  // 返回格式: json, markdown, html
  returnFormat?: "json" | "markdown" | "html";
  // 是否启用公式识别
  extractEquations?: boolean;
}

// MinerU API 响应（原始格式，从 API 返回）
export interface MineruApiResponse {
  // 状态
  status: "success" | "error" | "pending" | "processing" | "failed";
  // 文件名
  fileName?: string;
  // 总页数
  totalPages?: number;
  // 解析耗时（秒）
  parseTime?: number;
  // 解析引擎
  engine?: string;
  // 解析结果区块（原始格式）
  blocks?: MineruApiBlock[];
  // 错误信息
  error?: string;
  // 任务 ID（异步模式）
  taskId?: string;
  // 全文内容（Markdown 格式）
  markdown?: string;
  // 元数据
  metadata?: MineruMetadata;
}

// MinerU 异步任务响应
export interface MineruTaskResponse {
  status: "pending" | "processing" | "completed" | "failed";
  taskId: string;
  progress?: number;
  error?: string;
}

// MinerU 解析结果（处理后，用于内部使用）
export interface MineruParseResult {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalPages: number;
  fullText: string;
  markdown?: string;
  structured: MineruStructuredContent;
  blocks: ConvertedBlock[];
  tables: MineruTable[];
  images: MineruImage[];
  equations: MineruEquation[];
  // MinerU 返回的原始图片数据（base64）
  imagesData?: Record<string, string>;
  raw: MineruApiResponse;
}

// MinerU 结构化内容
export interface MineruStructuredContent {
  title?: string;
  abstract?: string;
  sections?: MineruSection[];
}

// MinerU 章节
export interface MineruSection {
  id: string;
  title: string;
  content: string;
  pageNumber: number;
  level: number;
}

// MinerU API 原始区块格式（从 API 返回的格式）
export interface MineruApiBlock {
  // 区块类型
  type: MineruBlockType;
  // 文本内容
  text?: string;
  // 页码
  page: number;
  // 边界框 [x0, y0, x1, y1]
  bbox?: [number, number, number, number];
  // 标题级别（仅用于 title 类型）
  level?: number;
  // 表格内容（仅用于 table 类型）
  tableBody?: string[][];
  // LaTeX 公式（仅用于 equation 类型）
  latex?: string;
  // 图片路径（仅用于 image 类型）
  imagePath?: string;
  // 列表项（仅用于 list 类型）
  items?: string[];
}

// 转换后的区块格式（用于数据库存储和内部使用）
export interface ConvertedBlock {
  id: string;
  pageNumber: number;
  index: number;
  type: MineruBlockType;
  content: string;
  bbox: BoundingBox | null;
  level?: number;
  tableData?: string[][];
  latex?: string;
  imagePath?: string;
}

// 兼容旧代码的别名
export type MineruBlock = ConvertedBlock;

// MinerU 区块类型
export type MineruBlockType =
  | "title"
  | "text"
  | "paragraph"
  | "table"
  | "image"
  | "figure"
  | "equation"
  | "list"
  | "header"
  | "footer"
  | "footnote"
  | "code";

// 边界框
export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// MinerU 表格
export interface MineruTable {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  rows: MineruTableRow[];
}

// MinerU 表格行
export interface MineruTableRow {
  cells: MineruTableCell[];
}

// MinerU 表格单元格
export interface MineruTableCell {
  content: string;
  bbox: BoundingBox;
}

// MinerU 图片
export interface MineruImage {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  imagePath: string;
}

// MinerU 公式
export interface MineruEquation {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  latex: string;
  text: string;
}

// MinerU 元数据
export interface MineruMetadata {
  parseTime?: number;
  engine?: string;
  version?: string;
}