import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import { type Env } from "./tools";

// Interface for the Agent to satisfy strict typing on the Stub
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

    // Step 1: Plan
    const urls = await step.do("plan-search", async () => {
      return [`https://www.google.com/search?q=${encodeURIComponent(topic + " detailed analysis")}`];
    });

    // Step 2: Scrape
    const rawData = await step.do("scrape-content", async () => {
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      await page.goto(urls[0]);
      const content = await page.$eval("body", el => el.innerText);
      await browser.close();
      return content.substring(0, 5000); 
    });

    // Step 3: Report
    const report = await step.do("write-report", async () => {
      const response: any = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: "Write a professional markdown report." },
          { role: "user", content: `Topic: ${topic}\nData: ${rawData}\n\nReport:` }
        ]
      });
      return response.response;
    });

    // Step 4: Save & Notify
    const filename = `Research-${Date.now()}.md`;
    await this.env.FILES_BUCKET.put(filename, report);

    const id = this.env.SuperAgent.idFromString(agentId);
    // Cast stub to our interface
    const agentStub = this.env.SuperAgent.get(id) as unknown as SuperAgentType;
    
    await agentStub.broadcastResult(`Research Finished! Saved as ${filename}.\n\n${report.substring(0, 150)}...`);
    
    return report;
  }
}
