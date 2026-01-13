import { Agent, type Connection, type WSMessage } from "agents";
import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { getTools, type Env } from "./tools";

export class SuperAgent extends Agent<Env> {
  messages: any[] = [];

  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ 
      role: "system", 
      content: "Super Agent Online ⚡️. I can Search, Draw, Read Files, and Research." 
    }));
  }

  async onMessage(connection: Connection, message: WSMessage) {
    const data = typeof message === "string" ? JSON.parse(message) : message;
    
    // Add User Message
    this.messages.push({ role: "user", content: data.prompt });

    // 1. RAG Retrieval
    const embeddings = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [data.prompt] });
    const vectors = (embeddings as any).data ? (embeddings as any).data[0] : (embeddings as any)[0];
    const matches = await this.env.VECTOR_DB.query(vectors, { topK: 3 });
    const context = matches.matches.map(m => m.metadata?.text).join("\n\n");

    const systemPrompt = `You are a Super Agent. 
    Context from uploaded files: ${context || "No relevant files found."}
    
    Always use tools when you need to perform actions (Search, Draw, Research).
    Return answers in Markdown.`;

    // 2. Run AI Loop
    const workersai = createWorkersAI({ binding: this.env.AI });

    try {
      // Map messages manually to ensure compatibility
      const coreMessages = this.messages.map(m => ({ role: m.role, content: m.content }));

      const result = await streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any), // Cast to any to avoid strict model string checks
        tools: getTools(this.env, this, connection.id),
        maxSteps: 5,
        system: systemPrompt,
        messages: coreMessages,
      });

      let fullResponse = "";
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          // Fix: The error indicated 'textDelta' was missing on the type, so we use 'text'
          const text = (chunk as any).text || (chunk as any).textDelta || "";
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

  // Capability to receive messages from Workflows
  async broadcastResult(content: string) {
    // Iterate over active connections to broadcast
    for (const conn of this.getConnections()) {
        conn.send(JSON.stringify({ type: "text", content: `\n\n🔔 **Workflow Update:**\n${content}` }));
        conn.send(JSON.stringify({ type: "stop" }));
    }
  }
}
