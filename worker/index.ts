import { routeAgentRequest } from "agents";
import { SuperAgent } from "./agent";
import { ResearchWorkflow } from "./workflow";

export { SuperAgent, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 1. File Upload API (Ingestion)
    if (url.pathname === "/api/upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      
      if (!file) return new Response("No file", { status: 400 });

      // A. Save to Object Storage (R2)
      await env.FILES_BUCKET.put(file.name, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      // B. Generate Embeddings for RAG (Vectorize)
      // Only for text files for now
      if (file.type.includes("text") || file.name.endsWith(".md")) {
        const text = await file.text();
        const chunks = text.match(/[\s\S]{1,500}/g) || []; // Simple chunking

        const vectors = [];
        for (let i = 0; i < Math.min(chunks.length, 20); i++) {
           const chunk = chunks[i];
           const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [chunk] });
           // @ts-ignore
           const values = embedding.data ? embedding.data[0] : embedding[0];
           vectors.push({
             id: `${file.name}-${i}`,
             values: values,
             metadata: { filename: file.name, text: chunk }
           });
        }
        
        await env.VECTOR_DB.upsert(vectors);
      }

      return Response.json({ success: true, filename: file.name });
    }

    // 2. Route Agent Requests
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
