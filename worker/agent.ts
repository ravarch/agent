import { Agent, type Connection, type WSMessage } from "agents";
import puppeteer from "@cloudflare/puppeteer";

export class SuperAgent extends Agent<Env> {
  // Define our "System Prompt" with capabilities
  readonly systemPrompt = `You are a Super Agent with Gemini-level capabilities.
  You can:
  1. Browse the web for real-time info.
  2. access user files in your R2 sandbox.
  3. Start deep research workflows for complex queries.
  
  Always check your tools before answering.`;

  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ role: "system", content: "Super Agent Online ⚡️" }));
  }

  async onMessage(connection: Connection, message: WSMessage) {
    // 1. Parse Input
    const data = typeof message === "string" ? JSON.parse(message) : message;
    const userPrompt = data.prompt;

    // 2. Check for "Deep Work" request (Heuristic or intent detection)
    if (userPrompt.toLowerCase().includes("deep research") || userPrompt.toLowerCase().includes("analyze file")) {
      await this.triggerWorkflow(connection, userPrompt);
      return;
    }

    // 3. Check for Web Browsing
    if (userPrompt.toLowerCase().includes("search") || userPrompt.toLowerCase().includes("latest")) {
      await this.browseWeb(connection, userPrompt);
      return;
    }

    // 4. Default: Standard Chat with RAG
    await this.chat(connection, userPrompt);
  }

  // --- CAPABILITY: Standard Chat + RAG ---
  async chat(connection: Connection, prompt: string) {
    // Retrieve context from Vectorize
    const embeddings = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [prompt] });
    const matches = await this.env.VECTOR_DB.query(embeddings.data[0], { topK: 3 });
    const context = matches.matches.map(m => m.metadata?.text).join("\n");

    const stream = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "system", content: `Context: ${context}` },
        { role: "user", content: prompt }
      ],
      stream: true,
      // Use AI Gateway for caching/monitoring
      gateway: {
        id: this.env.AI_GATEWAY_ID,
        skipCache: false
      }
    });

    this.streamResponse(connection, stream);
  }

  // --- CAPABILITY: Web Browsing ---
  async browseWeb(connection: Connection, query: string) {
    connection.send(JSON.stringify({ type: "status", content: "Browsing the web..." }));

    try {
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      
      // Perform a search (mocked via direct navigation or search engine)
      // For this example, we visit a specific relevant page or generic search
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      
      // Extract results
      const content = await page.$eval("body", (el) => el.innerText.substring(0, 2000));
      await browser.close();

      // Synthesize answer
      const stream = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
            { role: "system", content: "Summarize the search results for the user." },
            { role: "user", content: `Query: ${query}\n\nSearch Results: ${content}` }
        ],
        stream: true
      });
      this.streamResponse(connection, stream);

    } catch (e) {
      connection.send(JSON.stringify({ type: "error", content: "Failed to browse web." }));
    }
  }

  // --- CAPABILITY: Workflow Trigger ---
  async triggerWorkflow(connection: Connection, prompt: string) {
    connection.send(JSON.stringify({ type: "status", content: "Starting Deep Research Workflow..." }));

    // Trigger the workflow
    const run = await this.env.RESEARCH_WORKFLOW.create({
      params: { 
        prompt, 
        connectionId: connection.id, // Pass connection ID to notify user later
        agentId: this.id 
      }
    });

    connection.send(JSON.stringify({ type: "info", content: `Workflow ID: ${run.id} started.` }));
  }

  async streamResponse(connection: Connection, stream: any) {
    for await (const chunk of stream) {
        if (chunk.response) {
            connection.send(JSON.stringify({ type: "text", content: chunk.response }));
        }
    }
    connection.send(JSON.stringify({ type: "stop" }));
  }
}
