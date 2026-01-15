import { z } from "zod";
import puppeteer from "@cloudflare/puppeteer";
import { tool } from "ai";

export interface Env {
  AI: any;
  BROWSER: any; 
  FILES_BUCKET: R2Bucket;
  VECTOR_DB: any;
  RESEARCH_WORKFLOW: Workflow;
  SuperAgent: DurableObjectNamespace; 
  AI_GATEWAY_ID: string;
}

export const getTools = (env: Env, agent: any, connectionId: string) => {
  return {
    // Tool 1: Web Search
    web_search: tool({
      description: "Search the web for real-time information.",
      parameters: z.object({
        query: z.string().describe("The search query"),
      }),
      // FIX: Explicitly type the argument to satisfy TS overload
      execute: async ({ query }: { query: string }) => {
        try {
          const browser = await puppeteer.launch(env.BROWSER);
          const page = await browser.newPage();
          await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
          
          const text = await page.$eval("body", (el) => el.innerText);
          await browser.close();
          return `Search Results: ${text.substring(0, 2000)}...`;
        } catch (error) {
          return `Search failed: ${(error as Error).message}`;
        }
      },
    }),

    // Tool 2: Image Generation
    generate_image: tool({
      description: "Generate an image based on a prompt.",
      parameters: z.object({
        prompt: z.string().describe("Visual description of the image"),
      }),
      // FIX: Explicitly type the argument
      execute: async ({ prompt }: { prompt: string }) => {
        const inputs = { prompt, steps: 4 };
        const response: any = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", inputs);
        return `![Generated Image](data:image/jpeg;base64,${response.image})`;
      },
    }),

    // Tool 3: File Reader
    read_file: tool({
      description: "Read the full content of a specific file from the sandbox.",
      parameters: z.object({
        filename: z.string().describe("The exact name of the file to read"),
      }),
      // FIX: Explicitly type the argument
      execute: async ({ filename }: { filename: string }) => {
        const object = await env.FILES_BUCKET.get(filename);
        if (!object) return `File '${filename}' not found.`;
        const text = await object.text();
        return `File Content: ${text.substring(0, 8000)}`;
      },
    }),

    // Tool 4: Workflow Trigger
    start_deep_research: tool({
      description: "Start a long-running deep research workflow.",
      parameters: z.object({
        topic: z.string().describe("The research topic"),
      }),
      // FIX: Explicitly type the argument
      execute: async ({ topic }: { topic: string }) => {
        const agentId = agent.state?.id?.toString() || agent.id?.toString(); 

        const run = await env.RESEARCH_WORKFLOW.create({
          params: { 
            topic, 
            agentId, 
            connectionId 
          }
        });
        return `Started Research Workflow (ID: ${run.id}). I will notify you when done.`;
      },
    }),
  };
};
