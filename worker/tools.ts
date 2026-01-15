import { z } from "zod";
import puppeteer from "@cloudflare/puppeteer";
import { tool } from "ai";

export interface Env {
  // Enhanced AI type definition for the new toMarkdown feature
  AI: {
    run: (model: string, args: any) => Promise<any>;
    toMarkdown: (input: File | Blob | Blob[]) => Promise<{ data: string } | { data: string }[]>;
  };
  BROWSER: any; 
  FILES_BUCKET: R2Bucket;
  VECTOR_DB: any; 
  RESEARCH_WORKFLOW: Workflow;
  SuperAgent: DurableObjectNamespace; 
  AI_GATEWAY_ID: string;
}

export const getTools = (env: Env, agent: any, connectionId: string) => {
  return {
    // --- Tool: Quick Web Search (Low Latency) ---
    web_search: tool({
      description: "Perform a quick standard web search.",
      parameters: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        try {
          const browser = await puppeteer.launch(env.BROWSER);
          const page = await browser.newPage();
          // Minimal resource loading for speed
          await page.setRequestInterception(true);
          page.on('request', (req) => {
              if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
              else req.continue();
          });
          
          await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
          const text = await page.$eval("body", (el) => el.innerText);
          await browser.close();
          return `Results: ${text.substring(0, 1500)}...`;
        } catch (error) {
          return `Search Error: ${(error as Error).message}`;
        }
      },
    }),

    // --- Tool: Smart File Reader (Auto-OCR/Convert) ---
    read_file: tool({
      description: "Read a file from the sandbox. Supports PDF, Images (via OCR), and Text.",
      parameters: z.object({
        filename: z.string().describe("The exact filename"),
      }),
      execute: async ({ filename }) => {
        const object = await env.FILES_BUCKET.get(filename);
        if (!object) return `Error: File '${filename}' not found.`;
        
        const fileType = object.httpMetadata?.contentType || "";
        
        // If it's a binary format (PDF, Image), convert to Markdown on-the-fly
        if (filename.match(/\.(pdf|png|jpg|jpeg|webp)$/i) || fileType.includes("image") || fileType.includes("pdf")) {
            const blob = await object.blob();
            try {
                const result: any = await env.AI.toMarkdown(blob);
                const md = Array.isArray(result) ? result[0].data : result.data;
                return `### Content of ${filename} (Converted):\n${md.substring(0, 10000)}`;
            } catch (e) {
                return `Error converting binary file: ${(e as Error).message}`;
            }
        }

        // Standard Text Read
        const text = await object.text();
        return `### Content of ${filename}:\n${text.substring(0, 10000)}`;
      },
    }),

    // --- Tool: Deep Research Trigger ---
    start_deep_research: tool({
      description: "Initiate a comprehensive deep research task. Use this for complex topics requiring report generation.",
      parameters: z.object({
        topic: z.string().describe("The specific topic to research"),
      }),
      execute: async ({ topic }) => {
        const agentId = agent.state?.id?.toString() || agent.id?.toString(); 
        const run = await env.RESEARCH_WORKFLOW.create({
          params: { topic, agentId, connectionId }
        });
        return `Started Deep Research Task (ID: ${run.id}). I will notify you when the analysis is complete.`;
      },
    }),

    // --- Tool: Advanced Image Generation (Flux 2 + R2) ---
    generate_image: tool({
        description: "Generate high-fidelity images using Flux.2.",
        parameters: z.object({
          prompt: z.string().describe("The image description"),
        }),
        execute: async ({ prompt }) => {
          try {
              // 1. Optimize Prompt
              const enhanced: any = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                  messages: [{ role: "system", content: "Optimize this image prompt for Flux.2. Output only the prompt." }, { role: "user", content: prompt }]
              });
              const optimizedPrompt = enhanced.response || prompt;
  
              // 2. Generate
              const img: any = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
                  prompt: optimizedPrompt,
                  num_steps: 20
              });
  
              // 3. Save to R2
              const bin = atob(img.image);
              const buffer = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) buffer[i] = bin.charCodeAt(i);
              
              const filename = `img-${Date.now()}.png`;
              await env.FILES_BUCKET.put(filename, buffer.buffer, {
                  httpMetadata: { contentType: "image/png" }
              });
  
              return `Generated: *${optimizedPrompt}*\n![Image](/api/file/${filename})`;
          } catch (e) {
              return `Generation failed: ${(e as Error).message}`;
          }
        },
      }),
  };
};
