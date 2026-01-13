import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

type Params = {
  prompt: string;
  connectionId: string;
  agentId: string;
};

export class ResearchWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { prompt } = event.payload;

    // Step 1: Analyze user intent and break down tasks
    const plan = await step.do("plan-research", async () => {
      const response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [{ role: "user", content: `Create a 3-step research plan for: ${prompt}` }]
      });
      // @ts-expect-error - AI output type mismatch workaround
      return (response as any).response; 
    });

    // Step 2: Check R2 Sandbox for relevant files
    const fileAnalysis = await step.do("check-files", async () => {
      const list = await this.env.FILES_BUCKET.list();
      if (list.objects.length === 0) return "No files found.";
      
      // Read the first file as an example of "Sandbox" analysis
      const file = await this.env.FILES_BUCKET.get(list.objects[0].key);
      const text = await file?.text();
      return `Analyzed file ${list.objects[0].key}: ${text?.substring(0, 500)}...`;
    });

    // Step 3: Final Synthesis
    const result = await step.do("synthesize", async () => {
        const response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
            messages: [
                { role: "system", content: "Synthesize the research plan and file analysis." },
                { role: "user", content: `Plan: ${plan}\n\nFile Analysis: ${fileAnalysis}` }
            ]
        });
        // @ts-expect-error - AI output type mismatch workaround
        return (response as any).response;
    });

    // Note: In a real app, you would use the Agent ID to send this back to the specific WebSocket connection.
    console.log("Workflow finished:", result);
    return result;
  }
}
