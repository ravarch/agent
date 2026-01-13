import { routeAgentRequest } from "agents";
import { SuperAgent } from "./agent";
import { ResearchWorkflow } from "./workflow";

// Export the Durable Object Class
export { SuperAgent, ResearchWorkflow };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- API: File Upload to Sandbox (R2) ---
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
          return new Response("No file uploaded", { status: 400 });
        }

        // Save to the Agent's Sandbox Bucket
        await env.FILES_BUCKET.put(file.name, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        return Response.json({ 
          success: true, 
          filename: file.name, 
          size: file.size 
        });
      } catch (err) {
        return new Response("Upload failed", { status: 500 });
      }
    }

    // --- Agent Routing ---
    // Routes requests like /agents/super-agent/... to the Durable Object
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
