import { routeAgentRequest } from "agents";
import { SuperAgent } from "./agent";
import { ResearchWorkflow } from "./workflow";

// Export the Durable Object Class
export { SuperAgent, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Route /agent/* requests to our SuperAgent
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
