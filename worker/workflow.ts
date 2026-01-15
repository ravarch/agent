import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import { type Env } from "./tools";

interface SuperAgentType {
  broadcastResult(content: string): Promise<void>;
}

type Params = {
  topic: string;
  agentId: string;
  connectionId: string;
};

export class ResearchWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { topic, agentId } = event.payload;

    // Step 1: Strategic Planning
    // We ask a fast model to give us the absolute best URL to research this topic.
    const targetUrl = await step.do("plan-research", async () => {
      const prompt = `You are a research planner. Return ONE authoritative URL to find detailed information about: "${topic}". 
      Return ONLY the URL string. No markdown. No conversational filler.`;
      
      const result: any = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: prompt }]
      });
      
      let url = result.response.trim();
      // Heuristic validation: Fallback to Google Search if the LLM fails to generate a valid URL
      if (!url.startsWith("http")) {
        url = `https://www.google.com/search?q=${encodeURIComponent(topic)}`;
      }
      return url;
    });

    // Step 2: Visual Scrape & Semantic Conversion
    // We don't just scrape text; we convert the visual page structure to Markdown.
    const researchMaterial = await step.do("scrape-convert", async () => {
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      
      // Stealth Mode: Set User Agent to appear as a standard desktop user
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });
      
      console.log(`Researching: ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      // Capture the full DOM, not just text
      const html = await page.content();
      await browser.close();

      // Convert HTML Blob -> Markdown
      // This preserves tables, headers, and structural hierarchy
      const blob = new Blob([html], { type: "text/html" });
      const conversion: any = await this.env.AI.toMarkdown(blob);
      
      const md = Array.isArray(conversion) ? conversion[0].data : conversion.data;
      
      // Truncate to fit within Context Window (approx 15k tokens safe buffer)
      return md.substring(0, 40000); 
    });

    // Step 3: Synthesis
    // Use a large reasoning model to synthesize the findings into a report.
    const report = await step.do("synthesize-report", async () => {
      const response: any = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { 
            role: "system", 
            content: "You are a Principal Analyst. Write a structured executive summary in Markdown based ONLY on the provided source material. Cite key facts." 
          },
          { 
            role: "user", 
            content: `TOPIC: ${topic}\n\nSOURCE CONTENT:\n${researchMaterial}\n\nREPORT:` 
          }
        ]
      });
      return response.response;
    });

    // Step 4: Archival & Notification
    await step.do("save-and-notify", async () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Report-${timestamp}.md`;
        
        // Save the artifact
        await this.env.FILES_BUCKET.put(filename, report, {
            httpMetadata: { contentType: "text/markdown" }
        });

        // Notify the Agent (which pushes to the UI)
        const id = this.env.SuperAgent.idFromString(agentId);
        const agentStub = this.env.SuperAgent.get(id) as unknown as SuperAgentType;
        
        await agentStub.broadcastResult(`
### 🧠 Deep Research Completed
**Topic:** ${topic}
**Source:** [${targetUrl}](${targetUrl})

**Executive Summary:**
${report.substring(0, 300)}...

[Download Full Report](/api/file/${filename})
        `);
    });

    return { status: "complete", url: targetUrl };
  }
}
