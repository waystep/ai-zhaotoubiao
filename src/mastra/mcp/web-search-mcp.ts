import { MCPClient } from '@mastra/mcp'

export const webSearchMcp = new MCPClient({
  id: 'web-search-mcp',
  servers: {
    WebSearch: {
      url: new URL('https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp'),
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${process.env.DASHSCOPE_API_KEY}`)
        return fetch(url,{...init,headers})
      }
    },
  },
})