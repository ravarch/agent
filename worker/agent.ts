import { Agent, type Connection, type WSMessage } from "agents";
import { streamText, convertToCoreMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { getTools, type Env } from "./tools";

export class SuperAgent extends Agent<Env> {
  // Store chat history in the Durable Object's memory (SQL or In-Memory)
  // For simplicity, we use an in-memory array, but in prod use SQLite
  messages: any[] = [];

  async onConnect(connection: Connection) {
    // Send initial greeting
    connection.send(JSON.stringify({ 
      role: "system", 
      content: "Super Agent Online ⚡️. I can Search, Draw, Read Files, and Research." 
    }));
  }

  async onMessage(connection: Connection, message: WSMessage) {
    const data = typeof message === "string" ? JSON.parse(message) : message;
    
    // Add User Message to History
    this.messages.push({ role: "user", content: data.prompt });

    // 1. RAG Retrieval Step (Context Injection)
    // We check if the prompt matches any uploaded files
    const embeddings = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [data.prompt] });
    // @ts-ignore
    const vectors = embeddings.data ? embeddings.data[0] : embeddings[0];
    const matches = await this.env.VECTOR_DB.query(vectors, { topK: 3 });
    const context = matches.matches.map(m => m.metadata?.text).join("\n\n");

    const systemPrompt = `You are a Super Agent. 
    Context from uploaded files: ${context || "No relevant files found."}
    
    Always use tools when you need to perform actions (Search, Draw, Research).
    Return answers in Markdown.`;

    // 2. Run the AI Loop with Tools
    const workersai = createWorkersAI({ binding: this.env.AI });

    try {
      const result = await streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
        tools: getTools(this.env, this, connection.id),
        maxSteps: 5, // Allow up to 5 tool round-trips (Search -> Read -> Search -> Answer)
        system: systemPrompt,
        messages: convertToCoreMessages(this.messages), // Pass history
      });

      // Stream the response back to the client
      let fullResponse = "";
      for await (const chunk of result.fullStream) {
        // We can forward text deltas directly
        if (chunk.type === 'text-delta') {
          fullResponse += chunk.textDelta;
          connection.send(JSON.stringify({ type: "text", content: chunk.textDelta }));
        }
        // Optional: Notify client about tool usage
        if (chunk.type === 'tool-call') {
          connection.send(JSON.stringify({ type: "status", content: `Using tool: ${chunk.toolName}...` }));
        }
      }

      // Save Assistant Response to History
      this.messages.push({ role: "assistant", content: fullResponse });
      connection.send(JSON.stringify({ type: "stop" }));

    } catch (e) {
      connection.send(JSON.stringify({ type: "error", content: (e as Error).message }));
    }
  }

  // Capability to receive messages from Workflows
  async broadcastResult(content: string) {
    // Broadcast to all open connections (or filter by connectionId if stored)
    this.server.getWebSocketAutoResponse()
    // For manual broadcasting:
    for (const conn of this.getConnections()) {
        conn.send(JSON.stringify({ type: "text", content: `\n\n🔔 **Workflow Update:**\n${content}` }));
        conn.send(JSON.stringify({ type: "stop" }));
    }
  }
}
