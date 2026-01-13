import { Agent, routeAgentRequest } from "agents";
import type { Connection, WSMessage } from "agents";

// Define the Agent class
export class ChatAgent extends Agent<Env> {
  // Handle incoming WebSocket connections
  async onConnect(connection: Connection) {
    // Optional: Send a welcome message
    // connection.send(JSON.stringify({ type: "text", text: "Connected to AI Agent" }));
  }

  // Handle incoming chat messages
  async onMessage(connection: Connection, message: WSMessage) {
    // Parse the incoming message (assuming stringified JSON from frontend)
    let text = "";
    try {
      const parsed = typeof message === "string" ? JSON.parse(message) : message;
      text = parsed.text || parsed.prompt || parsed.content || "";
    } catch (e) {
      console.error("Failed to parse message", e);
      return;
    }

    if (!text) return;

    try {
      // Stream response from Workers AI
      const stream = await this.env.AI.run(
        "@cf/meta/llama-3-8b-instruct", // You can swap this for any supported model
        {
          messages: [{ role: "user", content: text }],
          stream: true,
        }
      );

      // Iterate over the stream and send chunks to the client
      // The frontend likely expects a specific format. 
      // Common pattern: { type: "text", text: "chunk..." } or { type: "chunk", content: "..." }
      for await (const chunk of stream) {
        const content = chunk.response;
        if (content) {
          connection.send(JSON.stringify({ type: "text", text: content }));
        }
      }

      // Signal completion
      connection.send(JSON.stringify({ type: "finish" }));

    } catch (error) {
      connection.send(JSON.stringify({ type: "error", error: "Failed to generate response" }));
      console.error(error);
    }
  }
}

// Export the Worker entry point
export default {
  fetch(request, env, ctx) {
    // 1. Route requests to the Agent if the URL matches standard Agent patterns
    // e.g. /agents/chat-agent/...
    // If you want a specific "room" ID, you might parse it here.
    
    // For a starter kit, we often just route everything relevant to the agent 
    // or handle specific API paths.
    
    return (
      routeAgentRequest(request, env) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
