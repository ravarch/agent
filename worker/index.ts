import { routeAgentRequest } from "agents";
import { SuperAgent } from "./agent";
import { ResearchWorkflow } from "./workflow";
import { type Env } from "./tools";

export { SuperAgent, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // -----------------------------------------------------------------
    // API 1: Universal File Upload (PDF, IMG, TXT -> Markdown -> Vector)
    // -----------------------------------------------------------------
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        
        if (!file) return new Response("No file uploaded", { status: 400 });

        // 1. Storage: Persist the raw asset immediately to R2
        // We use the raw stream to minimize memory usage on the Worker
        await env.FILES_BUCKET.put(file.name, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        // 2. Transmutation: Convert ANY file type to Markdown using Workers AI
        // This handles OCR for images, extraction for PDFs, and parsing for HTML.
        let markdownContent = "";
        
        // Skip conversion for simple text files to save latency, unless you want normalization
        if (file.type.startsWith("text/") && !file.type.includes("html")) {
          markdownContent = await file.text();
        } else {
          // The Magic: env.AI.toMarkdown accepts a File/Blob directly
          const response = await env.AI.toMarkdown(file);
          // Handle potential array response structure
          markdownContent = Array.isArray(response) ? response[0].data : response.data;
        }

        // 3. Cognitive Indexing: Vectorize the Markdown
        if (markdownContent && markdownContent.length > 0) {
          // Chunking Strategy: 800 chars with 100 char overlap for better context retention
          const chunkSize = 800;
          const overlap = 100;
          const chunks: string[] = [];
          
          for (let i = 0; i < markdownContent.length; i += (chunkSize - overlap)) {
            chunks.push(markdownContent.substring(i, i + chunkSize));
          }

          const vectors = [];
          // Limit processing to prevent Worker CPU Timeout (50 chunks ~ 40k chars)
          // In a real system, offload this loop to a Cloudflare Queue
          const maxChunks = Math.min(chunks.length, 50);

          for (let i = 0; i < maxChunks; i++) {
             const chunk = chunks[i];
             const embedding: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [chunk] });
             const values = embedding.data ? embedding.data[0] : embedding[0];
             
             vectors.push({
               id: `${file.name}-chunk-${i}`,
               values: values,
               metadata: { 
                 filename: file.name, 
                 text: chunk, 
                 type: file.type,
                 processedAt: new Date().toISOString()
               }
             });
          }
          
          // Batch upsert for efficiency
          if (vectors.length > 0) {
            await (env.VECTOR_DB as any).upsert(vectors);
          }
        }

        return Response.json({ 
          success: true, 
          filename: file.name, 
          detectedType: file.type,
          chunksIndexed: vectors.length 
        });

      } catch (err) {
        return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
      }
    }

    // -----------------------------------------------------------------
    // API 2: Secure Asset Delivery
    // -----------------------------------------------------------------
    if (url.pathname.startsWith("/api/file/") && request.method === "GET") {
      const filename = url.pathname.replace("/api/file/", "");
      const object = await env.FILES_BUCKET.get(filename);

      if (!object) return new Response("File not found", { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      // Smart Caching: Cache immutable assets for 1 day at the edge
      headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=60");

      return new Response(object.body, { headers });
    }

    // -----------------------------------------------------------------
    // API 3: Agent Protocol
    // -----------------------------------------------------------------
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
