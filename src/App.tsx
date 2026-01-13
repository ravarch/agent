import React from "react";
import { useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { nanoid } from "nanoid";
import { 
  Bot, 
  User, 
  Paperclip, 
  Globe, 
  Image as ImageIcon,
  FileText,
  BrainCircuit,
  Cpu,
  Terminal,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";

// AI UI Components
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
  MessageAttachments,
  MessageAttachment
} from "@/components/ai-elements/message";
import { 
  PromptInput, 
  PromptInputTextarea, 
  PromptInputSubmit, 
  PromptInputHeader, 
  PromptInputTools, 
  PromptInputActionMenu, 
  PromptInputActionMenuTrigger, 
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// --- Types ---
type ToolStatus = "idle" | "searching" | "drawing" | "reading" | "thinking";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: string; // For tool updates like "Browsing web..."
  attachments?: string[]; // Filenames
  isStreaming?: boolean;
};

// --- Helper: Tool Icon Mapping ---
const StatusIndicator = ({ status, text }: { status: ToolStatus, text: string }) => {
  const icons = {
    idle: <Bot className="size-4" />,
    searching: <Globe className="size-4 text-blue-400 animate-pulse" />,
    drawing: <ImageIcon className="size-4 text-purple-400 animate-pulse" />,
    reading: <FileText className="size-4 text-orange-400 animate-pulse" />,
    thinking: <Cpu className="size-4 text-green-400 animate-spin" />,
  };

  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-all">
      {icons[status] || icons.thinking}
      <span>{text}</span>
    </div>
  );
};

export default function App() {
  // 1. Agent Connection
  const agent = useAgent({
    agent: "super-agent",
    name: "default-session", 
  });

  // 2. State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolStatus, setToolStatus] = useState<ToolStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  // 3. Message Handler
  useEffect(() => {
    if (!agent) return;

    const onMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "text":
          setToolStatus("idle");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: last.content + data.content }];
            }
            return [...prev, { id: nanoid(), role: "assistant", content: data.content, isStreaming: true }];
          });
          break;

        case "status":
          // Parse tool usage from backend message
          const content = data.content.toLowerCase();
          if (content.includes("search")) setToolStatus("searching");
          else if (content.includes("image") || content.includes("draw")) setToolStatus("drawing");
          else if (content.includes("read") || content.includes("analyz")) setToolStatus("reading");
          else setToolStatus("thinking");
          setStatusText(data.content);
          break;

        case "stop":
          setToolStatus("idle");
          setStatusText("");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last ? [...prev.slice(0, -1), { ...last, isStreaming: false }] : prev;
          });
          break;

        case "error":
          setToolStatus("idle");
          toast.error(data.content);
          break;
      }
    };

    agent.addEventListener("message", onMessage);
    return () => agent.removeEventListener("message", onMessage);
  }, [agent]);

  // 4. Submit Handler
  const handleSubmit = async (message: { text: string; files: any[] }) => {
    if (!agent) return;

    const fileNames = message.files.map(f => f.filename || "unknown");
    
    // Add User Message Optimistically
    setMessages(prev => [
      ...prev, 
      { 
        id: nanoid(), 
        role: "user", 
        content: message.text, 
        attachments: fileNames 
      }
    ]);

    // Handle Uploads
    if (message.files.length > 0) {
      setToolStatus("reading");
      setStatusText("Uploading files to Sandbox...");
      
      try {
        await Promise.all(message.files.map(async (filePart) => {
          const res = await fetch(filePart.url);
          const blob = await res.blob();
          const file = new File([blob], filePart.filename || "upload", { type: filePart.mediaType });
          const formData = new FormData();
          formData.append("file", file);
          await fetch("/api/upload", { method: "POST", body: formData });
        }));
        
        setUploadedFiles(prev => [...prev, ...fileNames]);
        toast.success("Files uploaded successfully");
      } catch (e) {
        toast.error("Upload failed");
      }
    }

    // Send to Agent
    agent.send(JSON.stringify({ prompt: message.text }));
    setToolStatus("thinking");
    setStatusText("Processing request...");
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      
      {/* --- Sidebar (Sandbox) --- */}
      <div className="hidden w-64 flex-col border-r bg-muted/10 md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <BrainCircuit className="size-5 text-orange-600" />
          <span className="font-bold text-sm tracking-tight">Super Agent</span>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Capabilities</h3>
              <div className="grid gap-1">
                <CapabilityItem icon={<Globe />} label="Web Browsing" active={toolStatus === "searching"} />
                <CapabilityItem icon={<ImageIcon />} label="Image Gen" active={toolStatus === "drawing"} />
                <CapabilityItem icon={<FileText />} label="File Analysis" active={toolStatus === "reading"} />
                <CapabilityItem icon={<Terminal />} label="Deep Research" active={false} />
              </div>
            </div>

            <Separator className="my-4" />

            <div>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sandbox Files</h3>
              {uploadedFiles.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No files uploaded yet.</div>
              ) : (
                <ul className="grid gap-2">
                  {uploadedFiles.map((file, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border bg-background p-2 text-xs">
                      <Paperclip className="size-3 text-muted-foreground" />
                      <span className="truncate">{file}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </div>
        
        <div className="border-t p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
             <div className={`size-2 rounded-full ${agent ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500"}`} />
             {agent ? "System Online" : "Reconnecting..."}
          </div>
        </div>
      </div>

      {/* --- Main Chat Area --- */}
      <div className="flex flex-1 flex-col min-w-0">
        
        {/* Mobile Header */}
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-orange-600" />
            <span className="font-bold text-sm">Super Agent</span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><ChevronRight className="size-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader><SheetTitle>Agent Status</SheetTitle></SheetHeader>
              {/* Mobile Sidebar Content would go here */}
            </SheetContent>
          </Sheet>
        </header>

        {/* Conversation */}
        <Conversation className="flex-1 bg-background/50">
          <ConversationContent className="max-w-3xl mx-auto py-8">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={<BrainCircuit className="size-12 text-muted-foreground/20" />}
                title="How can I help you today?"
                description="I can browse the web, generate images, read your files, and perform deep research."
              />
            ) : (
              messages.map((msg) => (
                <Message key={msg.id} from={msg.role === "user" ? "user" : "assistant"} className="gap-4">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${msg.role === "user" ? "bg-secondary" : "bg-orange-500/10"}`}>
                    {msg.role === "user" ? <User className="size-4" /> : <Bot className="size-4 text-orange-600" />}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <MessageContent className="shadow-none border bg-transparent">
                      {/* Render User Attachments */}
                      {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex gap-2 mb-2 flex-wrap">
                          {msg.attachments.map((f, i) => (
                            <Badge key={i} variant="secondary" className="gap-1 font-mono text-[10px]">
                              <Paperclip className="size-3" /> {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <MessageResponse>{msg.content}</MessageResponse>
                    </MessageContent>
                  </div>
                </Message>
              ))
            )}

            {/* Active Status Indicator (Sticky at bottom of chat) */}
            {toolStatus !== "idle" && (
              <div className="flex justify-center pt-4 animate-in fade-in slide-in-from-bottom-2">
                <StatusIndicator status={toolStatus} text={statusText} />
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/80 backdrop-blur-md">
          <div className="mx-auto max-w-3xl">
            <PromptInput
              maxFiles={5}
              maxFileSize={20 * 1024 * 1024}
              accept="application/pdf,text/plain,image/*,.md,.csv"
              onSubmit={handleSubmit}
              className="rounded-2xl border bg-background shadow-lg transition-all focus-within:ring-2 focus-within:ring-orange-500/20"
            >
              <PromptInputTextarea 
                placeholder="Ask a question, request an image, or upload a file..." 
                className="min-h-[50px] resize-none border-none focus-visible:ring-0" 
              />
              
              <PromptInputHeader className="px-3 pb-2">
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger className="text-muted-foreground hover:text-foreground" />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments label="Upload Files to Sandbox" />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>
                
                <PromptInputSubmit 
                  className="ml-auto rounded-xl bg-orange-600 hover:bg-orange-700 text-white" 
                  size="icon-sm"
                  status={toolStatus === "idle" ? "ready" : "streaming"}
                />
              </PromptInputHeader>
            </PromptInput>
            <div className="mt-2 text-center text-[10px] text-muted-foreground opacity-60">
              Powered by Cloudflare Workers AI • Llama 3.3 • Flux-1 • Puppeteer
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Subcomponent: Sidebar Capability Item ---
function CapabilityItem({ icon, label, active }: { icon: any, label: string, active: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-md px-2 py-2 text-xs font-medium transition-colors ${active ? "bg-orange-500/10 text-orange-600" : "text-muted-foreground"}`}>
      {React.cloneElement(icon, { className: "size-4" })}
      <span>{label}</span>
      {active && <div className="ml-auto size-1.5 rounded-full bg-orange-500 animate-pulse" />}
    </div>
  );
}


