// 联网搜索工具 — 用于检索编制标准等外部信息
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const webSearchTool = createTool({
  id: "web-search",
  description: `联网搜索工具。当招标文件中没有明确引用编制标准时，使用此工具搜索相关行业标准和规范。

使用场景：
- 搜索建设工程相关的国家标准（GB）、行业标准、地方标准
- 搜索特定类型工程（如公路、房建、市政）的施工规范
- 获取标准的最新版本号和主要内容摘要

注意事项：
- 搜索结果仅供参考，需要人工核实
- 搜索词应包含"标准"、"规范"、"GB"等关键词
- 优先搜索 .gov.cn 域名下的官方标准`,

  inputSchema: z.object({
    query: z.string().describe("搜索查询（如：'公路工程施工质量验收标准 GB'）"),
    count: z.number().int().min(1).max(10).default(5).describe("返回结果数量"),
  }),

  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        snippet: z.string(),
        url: z.string(),
      })
    ),
    query: z.string(),
    totalResults: z.number(),
  }),

  execute: async ({ query, count }) => {
    try {
      // 使用 DuckDuckGo Instant Answer API（免费无需密钥）
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: { title: string; snippet: string; url: string }[] = [];

      // Abstract
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        });
      }

      // Related topics
      for (const topic of data.RelatedTopics || []) {
        if (results.length >= (count ?? 5)) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text?.split(" - ")[0] || topic.Text.slice(0, 60),
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
      }

      if (results.length === 0) {
        results.push({
          title: query,
          snippet: `请在 https://www.google.com/search?q=${encodeURIComponent(query)} 手动搜索`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        });
      }

      return { results, query, totalResults: results.length };
    } catch (error) {
      console.error("[WebSearch] 搜索失败:", error);
      return {
        results: [
          {
            title: "搜索失败",
            snippet: `联网搜索暂时不可用，请手动查询相关标准。错误: ${error instanceof Error ? error.message : "未知"}`,
            url: "",
          },
        ],
        query,
        totalResults: 0,
      };
    }
  },
});
