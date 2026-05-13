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
- 网络可能不通，搜索失败（totalResults=0）时请勿编造标准，改用 semantic-search 检索招标文件中的原始表述`,

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
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(8000) }
      );

      if (!response.ok) {
        return { results: [], query, totalResults: 0 };
      }

      const data = await response.json();
      const results: { title: string; snippet: string; url: string }[] = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        });
      }

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

      return { results, query, totalResults: results.length };
    } catch {
      return { results: [], query, totalResults: 0 };
    }
  },
});
