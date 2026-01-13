import { Agent, type Connection, type WSMessage } from "agents";
import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { getTools, type Env } from "./tools";

export class SuperAgent extends Agent<Env> {
  // Store conversation history
  messages: { role: "system" | "user" | "assistant"; content: string }[] = [];

  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ 
      role: "system", 
      content: "Super Agent Online ⚡️" 
    }));
  }

  async onMessage(connection: Connection, message: WSMessage) {
    const data = typeof message === "string" ? JSON.parse(message) : message;
    
    this.messages.push({ role: "user", content: data.prompt });

    // 1. RAG Retrieval
    const embeddings = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [data.prompt] });
    const vectors = (embeddings as any).data ? (embeddings as any).data[0] : (embeddings as any)[0];
    const matches = await this.env.VECTOR_DB.query(vectors, { topK: 3 });
    const context = matches.matches.map(m => m.metadata?.text).join("\n\n");

    const systemPrompt = `You are a helpful Super Agent.
    Context from files: ${context || "None"}
    Use tools for Searching, Drawing, or Researching.`;

    // 2. Stream Response
    const workersai = createWorkersAI({ binding: this.env.AI });

    try {
      const result = await streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any),
        tools: getTools(this.env, this, connection.id),
        maxSteps: 5,
        system: systemPrompt,
        // Manually map to CoreMessage to avoid import issues
        messages: this.messages.map(m => ({ role: m.role, content: m.content })),
      });

      let fullResponse = "";
      
      for await (const chunk of result.fullStream) {
        // Fix: Use 'chunk.text' for text-delta
        if (chunk.type === 'text-delta') {
          const text = chunk.text; 
          fullResponse += text;
          connection.send(JSON.stringify({ type: "text", content: text }));
        }
        
        if (chunk.type === 'tool-call') {
          connection.send(JSON.stringify({ type: "status", content: `Using tool: ${chunk.toolName}...` }));
        }
      }

      this.messages.push({ role: "assistant", content: fullResponse });
      connection.send(JSON.stringify({ type: "stop" }));

    } catch (e) {
      connection.send(JSON.stringify({ type: "error", content: (e as Error).message }));
    }
  }

  // Called by Workflow to broadcast results
  async broadcastResult(content: string) {
    // Agent SDK method to iterate connections
    for (const conn of this.getConnections()) {
      conn.send(JSON.stringify({ type: "text", content: `\n\n🔔 **Research Update:**\n${content}` }));
      conn.send(JSON.stringify({ type: "stop" }));
    }
  }
}
