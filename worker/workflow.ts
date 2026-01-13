import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import { type Env } from "./tools";

type Params = {
  topic: string;
  agentId: string;
  connectionId: string;
};

export class ResearchWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { topic, agentId } = event.payload;

    // Step 1: Search Plan
    const urls = await step.do("plan-search", async () => {
      const query = `Detailed analysis of ${topic}`;
      // In a real app, use a Search API. Here we simulate or scrape Google results.
      return [`https://www.google.com/search?q=${encodeURIComponent(query)}`];
    });

    // Step 2: Deep Scrape (Puppeteer in Workflow)
    const rawData = await step.do("scrape-content", async () => {
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      await page.goto(urls[0]);
      const content = await page.$eval("body", el => el.innerText);
      await browser.close();
      return content.substring(0, 5000); // Take first 5k chars
    });

    // Step 3: Synthesize Report
    const report = await step.do("write-report", async () => {
      const response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: "You are a senior analyst. Write a markdown report." },
          { role: "user", content: `Topic: ${topic}\n\nRaw Data: ${rawData}\n\nProduce a structured report.` }
        ]
      });
      // @ts-ignore
      return response.response;
    });

    // Step 4: Save Report to Sandbox
    const filename = `Report - ${topic.replace(/[^a-z0-9]/gi, '_')}.md`;
    await this.env.FILES_BUCKET.put(filename, report);

    // Step 5: Notify Agent
    // We get the specific Agent stub and tell it to broadcast
    const id = this.env.SuperAgent.idFromString(agentId);
    const agentStub = this.env.SuperAgent.get(id);
    await agentStub.broadcastResult(`Research complete! Saved to ${filename}.\n\nPreview:\n${report.substring(0, 200)}...`);
    
    return report;
  }
}
