import { routeAgentRequest } from "agents";
import { SuperAgent } from "./agent";
import { ResearchWorkflow } from "./workflow";
import { type Env } from "./tools";

export { SuperAgent, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // File Upload API
    if (url.pathname === "/api/upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      
      if (!file) return new Response("No file", { status: 400 });

      // Save to R2
      await env.FILES_BUCKET.put(file.name, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      // Index in Vectorize
      if (file.type.includes("text") || file.name.endsWith(".md")) {
        try {
          const text = await file.text();
          const chunks = text.match(/[\s\S]{1,500}/g) || [];

          const vectors = [];
          for (let i = 0; i < Math.min(chunks.length, 20); i++) {
             const chunk = chunks[i];
             const embedding: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [chunk] });
             const values = embedding.data ? embedding.data[0] : embedding[0];
             vectors.push({
               id: `${file.name}-${i}`,
               values: values,
               metadata: { filename: file.name, text: chunk }
             });
          }
          // Cast to any to call upsert safely
          await (env.VECTOR_DB as any).upsert(vectors);
        } catch (e) {
          console.error("Vectorize Error:", e);
        }
      }

      return Response.json({ success: true, filename: file.name });
    }

    // Route to Agent
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
