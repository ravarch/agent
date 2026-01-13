import { useState, useEffect } from "react";
import { useAgent } from "agents/react";
import { nanoid } from "nanoid";
import { 
  Loader2, 
  Bot, 
  User, 
  Globe, 
  BrainCircuit,
} from "lucide-react";

// AI UI Elements
import { 
  Conversation, 
  ConversationContent, 
  ConversationEmptyState,
  ConversationScrollButton
} from "@/components/ai-elements/conversation";
import { 
  Message, 
  MessageContent, 
  MessageResponse,
} from "@/components/ai-elements/message";
import { 
  PromptInput, 
  PromptInputTextarea, 
  PromptInputSubmit, 
  PromptInputHeader, 
  PromptInputActionAddAttachments,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent
} from "@/components/ai-elements/prompt-input";
import { toast } from "sonner"; // Assuming sonner is installed from package.json

// Types
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "status" | "info" | "error";
  isStreaming?: boolean;
};

function App() {
  // 1. Connection Management
  const agent = useAgent({
    agent: "super-agent",
    name: "default-session", // Single session for demo
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);

  // 2. Handle Incoming Messages from Agent
  useEffect(() => {
    if (!agent) return;

    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Handle different message types from the backend
        switch (data.type) {
          case "text":
            setIsStreaming(true);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              // Append to last assistant message if streaming
              if (last && last.role === "assistant" && last.isStreaming) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + data.content }
                ];
              }
              // Start new message
              return [...prev, { 
                id: nanoid(), 
                role: "assistant", 
                content: data.content, 
                type: "text",
                isStreaming: true 
              }];
            });
            setStatus(""); // Clear status when text starts
            break;

          case "status":
            // "Browsing the web...", "Thinking..."
            setStatus(data.content);
            break;

          case "info":
            // "Workflow ID: 123 started"
            toast.info(data.content, { icon: <BrainCircuit className="size-4" /> });
            break;

          case "stop":
            setIsStreaming(false);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last) return [...prev.slice(0, -1), { ...last, isStreaming: false }];
              return prev;
            });
            setStatus("");
            break;
            
          case "error":
            toast.error(data.content);
            setStatus("");
            break;
        }
      } catch (e) {
        console.error("Failed to parse message", e);
      }
    };

    agent.addEventListener("message", onMessage);
    return () => agent.removeEventListener("message", onMessage);
  }, [agent]);

  // 3. Handle Submission & File Uploads
  const handleSubmit = async (message: { text: string; files: any[] }) => {
    if (!agent) return;

    const userMessageId = nanoid();
    let promptText = message.text;

    // Optimistic UI Update
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: promptText }
    ]);

    // Handle File Uploads first
    if (message.files.length > 0) {
      const uploadPromises = message.files.map(async (filePart) => {
        // Convert Blob URL back to Blob/File for upload
        const response = await fetch(filePart.url);
        const blob = await response.blob();
        const file = new File([blob], filePart.filename || "upload", { type: filePart.mediaType });
        
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          return file.name;
        }
        throw new Error("Upload failed");
      });

      try {
        setStatus("Uploading files...");
        const uploadedNames = await Promise.all(uploadPromises);
        promptText += `\n\n[Attached files for analysis: ${uploadedNames.join(", ")}]`;
        toast.success(`Uploaded ${uploadedNames.length} file(s) to Sandbox`);
      } catch (e) {
        toast.error("Failed to upload files");
        setStatus("");
        return;
      }
    }

    // Send to Agent
    agent.send(JSON.stringify({ prompt: promptText }));
    setStatus("Thinking...");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <Bot className="size-5 text-orange-500" />
        <h1 className="font-semibold text-sm">Super Agent</h1>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`size-2 rounded-full ${agent ? "bg-green-500" : "bg-red-500"}`} />
          {agent ? "Connected" : "Disconnected"}
        </div>
      </header>

      {/* Main Chat Area */}
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<BrainCircuit className="size-10 text-muted-foreground/50" />}
              title="I am your Super Agent"
              description="I can browse the web, analyze files in your sandbox, and perform deep research."
            />
          ) : (
            messages.map((msg) => (
              <Message key={msg.id} from={msg.role === "user" ? "user" : "assistant"}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted">
                    {msg.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                  </div>
                  <MessageContent>
                    {msg.type === "text" ? (
                      <MessageResponse>{msg.content}</MessageResponse>
                    ) : (
                      <div className="italic text-muted-foreground">{msg.content}</div>
                    )}
                  </MessageContent>
                </div>
              </Message>
            ))
          )}

          {/* Status Indicator (Thinking / Browsing) */}
          {status && (
            <div className="flex items-center gap-2 px-12 text-xs text-muted-foreground animate-pulse">
              {status.includes("Browsing") ? <Globe className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
              {status}
            </div>
          )}
        </ConversationContent>
        
        {/* Scroll Button */}
        <ConversationScrollButton />
      </Conversation>

      {/* Input Area */}
      <div className="border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-3xl">
          <PromptInput
            maxFiles={3}
            maxFileSize={10 * 1024 * 1024} // 10MB
            accept="application/pdf,text/plain,image/*"
            onSubmit={handleSubmit}
            className="rounded-xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring"
          >
            <PromptInputTextarea placeholder="Ask me anything, or upload a file for analysis..." />
            
            <PromptInputHeader>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments label="Upload to Sandbox" />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
            </PromptInputHeader>

            <PromptInputHeader className="ml-auto">
              <PromptInputSubmit 
                status={isStreaming ? "streaming" : "ready"} 
                disabled={!agent}
              />
            </PromptInputHeader>
          </PromptInput>
          
          <div className="mt-2 text-center text-[10px] text-muted-foreground">
            Powered by Cloudflare Workers AI • Llama 3.3 • Puppeteer • Workflows
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
