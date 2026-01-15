import { useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { nanoid } from "nanoid";
import { 
  Bot, User, Paperclip, Globe, Image as ImageIcon,
  FileText, BrainCircuit, Cpu, Terminal, ChevronRight, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import React from "react";

// Components
import { 
  Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton 
} from "@/components/ai-elements/conversation";
import { 
  Message, MessageContent 
} from "@/components/ai-elements/message";
import { 
  PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputHeader, 
  PromptInputTools, PromptInputActionMenu, PromptInputActionMenuTrigger, 
  PromptInputActionMenuContent, PromptInputActionAddAttachments
} from "@/components/ai-elements/prompt-input";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Types
type ToolStatus = "idle" | "searching" | "drawing" | "reading" | "thinking" | "researching";
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: string[];
  isStreaming?: boolean;
};

// --- Status Indicator Component ---
const StatusIndicator = ({ status, text }: { status: ToolStatus, text: string }) => {
  const icons = {
    idle: <Bot className="size-4" />,
    searching: <Globe className="size-4 text-blue-400 animate-pulse" />,
    drawing: <ImageIcon className="size-4 text-purple-400 animate-pulse" />,
    reading: <FileText className="size-4 text-orange-400 animate-pulse" />,
    thinking: <Cpu className="size-4 text-green-400 animate-spin" />,
    researching: <BrainCircuit className="size-4 text-pink-500 animate-pulse" />,
  };
  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
      {icons[status] || icons.thinking}
      <span className="font-medium">{text}</span>
    </div>
  );
};

export default function App() {
  // Connect to the Cloudflare Agent
  const agent = useAgent({ agent: "super-agent", name: "default-session" });
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolStatus, setToolStatus] = useState<ToolStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [deepResearchMode, setDeepResearchMode] = useState(false);
  
  // Auto-scroll ref
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agent) return;

    const onMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case "text":
          setToolStatus("idle");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            // If the last message was an assistant streaming, append to it
            if (last && last.role === "assistant" && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: last.content + data.content }];
            }
            // Otherwise start a new message bubble
            return [...prev, { id: nanoid(), role: "assistant", content: data.content, isStreaming: true }];
          });
          break;

        case "status":
          // Parse tool usage for UI feedback
          const c = data.content.toLowerCase();
          if (c.includes("search")) setToolStatus("searching");
          else if (c.includes("draw") || c.includes("flux")) setToolStatus("drawing");
          else if (c.includes("read") || c.includes("analyz")) setToolStatus("reading");
          else if (c.includes("deep") || c.includes("research")) setToolStatus("researching");
          else setToolStatus("thinking");
          
          setStatusText(data.content);
          break;

        case "stop":
          setToolStatus("idle");
          setMessages(prev => {
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

  const handleSubmit = async (message: { text: string; files: any[] }) => {
    if (!agent) return;

    const fileNames = message.files.map(f => f.filename || "unknown");
    let fullPrompt = message.text;

    // Add UI Optimistic Update
    setMessages(prev => [...prev, { id: nanoid(), role: "user", content: fullPrompt, attachments: fileNames }]);

    // 1. Handle File Uploads
    if (message.files.length > 0) {
      setToolStatus("reading");
      setStatusText(`Uploading ${message.files.length} files...`);
      
      try {
        await Promise.all(message.files.map(async (f) => {
          const res = await fetch(f.url);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append("file", new File([blob], f.filename, { type: f.type }));
          
          const uploadReq = await fetch("/api/upload", { method: "POST", body: formData });
          if (!uploadReq.ok) throw new Error("Upload failed");
        }));
        
        setUploadedFiles(p => [...p, ...fileNames]);
        toast.success("Files indexed successfully");
      } catch (e) { 
        toast.error("Upload failed");
        setToolStatus("idle");
        return;
      }
    }

    // 2. Modify Prompt for Deep Research Mode
    if (deepResearchMode) {
        fullPrompt = `[DEEP RESEARCH MODE] Please perform a deep, comprehensive research task on this topic: ${fullPrompt}. Use the start_deep_research tool.`;
    }

    // 3. Send to Agent
    agent.send(JSON.stringify({ prompt: fullPrompt }));
    setToolStatus("thinking");
    setStatusText("Processing...");
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans antialiased">
      
      {/* Sidebar (Desktop) */}
      <div className="hidden w-64 flex-col border-r bg-muted/10 md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <BrainCircuit className="size-5 text-orange-600" />
          <span className="font-bold text-sm tracking-tight">Super Agent v2</span>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <div className="mb-6 space-y-1">
            <h3 className="mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Capabilities</h3>
            <CapabilityItem icon={<Globe />} label="Web Browsing" active={toolStatus === "searching"} />
            <CapabilityItem icon={<ImageIcon />} label="Flux Generation" active={toolStatus === "drawing"} />
            <CapabilityItem icon={<FileText />} label="Doc Analysis" active={toolStatus === "reading"} />
            <CapabilityItem icon={<Terminal />} label="Deep Research" active={toolStatus === "researching"} />
          </div>

          <Separator className="my-4 opacity-50" />
          
          <div>
             <h3 className="mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Context Files</h3>
             {uploadedFiles.length === 0 && <span className="text-xs text-muted-foreground italic pl-2">No files uploaded</span>}
             {uploadedFiles.map((f, i) => (
               <div key={i} className="flex items-center gap-2 p-2 text-xs border rounded mb-1 bg-background/50 hover:bg-background transition-colors">
                 <Paperclip className="size-3 text-orange-500" /> 
                 <span className="truncate max-w-[150px]">{f}</span>
               </div>
             ))}
          </div>
        </ScrollArea>

        {/* Footer Settings */}
        <div className="p-4 border-t bg-background/50">
            <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="deep-mode" className="text-xs font-medium flex items-center gap-2">
                    <Sparkles className="size-3 text-purple-500" /> Deep Research
                </Label>
                <Switch id="deep-mode" checked={deepResearchMode} onCheckedChange={setDeepResearchMode} />
            </div>
        </div>
      </div>

      {/* Main Interface */}
      <div className="flex flex-1 flex-col min-w-0 bg-background">
        
        {/* Mobile Header */}
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <span className="font-bold text-sm">Super Agent</span>
          <Sheet>
            <SheetTrigger><Button variant="ghost" size="icon"><ChevronRight /></Button></SheetTrigger>
            <SheetContent side="left"><SheetHeader><SheetTitle>Agent Status</SheetTitle></SheetHeader></SheetContent>
          </Sheet>
        </header>

        {/* Chat Area */}
        <Conversation className="flex-1">
          <ConversationContent className="max-w-4xl mx-auto py-8 px-4">
            {messages.length === 0 ? (
              <ConversationEmptyState 
                icon={<BrainCircuit className="size-16 text-muted-foreground/20" />} 
                title="How can I help you?"
                description="I can research topics, generate images, or analyze your files."
              />
            ) : (
              messages.map(msg => (
                <Message key={msg.id} from={msg.role === "user" ? "user" : "assistant"} className="group gap-4">
                   <div className={`flex size-8 shrink-0 items-center justify-center rounded-full border shadow-sm ${msg.role === 'user' ? 'bg-secondary' : 'bg-orange-500/10'}`}>
                     {msg.role === "user" ? <User className="size-4" /> : <Bot className="size-4 text-orange-600" />}
                   </div>
                   
                   <div className="flex-1 min-w-0">
                     <MessageContent className="shadow-none border-0 bg-transparent p-0">
                       {/* Attachments Badge */}
                       {msg.attachments && msg.attachments.length > 0 && (
                           <div className="flex gap-2 mb-2">
                               {msg.attachments.map((f, i) => (
                                   <Badge key={i} variant="outline" className="gap-1 pl-1 bg-background">
                                       <Paperclip className="size-3" /> {f}
                                   </Badge>
                               ))}
                           </div>
                       )}
                       
                       {/* Markdown Content */}
                       <div className="text-sm leading-relaxed text-foreground/90">
                           {/* Use the new renderer for everything */}
                           <MarkdownRenderer content={msg.content} />
                       </div>
                     </MessageContent>
                   </div>
                </Message>
              ))
            )}
            
            {/* Status Floating Pill */}
            {toolStatus !== "idle" && (
                <div className="sticky bottom-4 mx-auto w-fit animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <StatusIndicator status={toolStatus} text={statusText} />
                </div>
            )}
            <div ref={scrollRef} />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto max-w-4xl">
            <PromptInput maxFiles={5} onSubmit={handleSubmit} className="rounded-2xl border shadow-lg bg-background">
              <PromptInputTextarea 
                placeholder={deepResearchMode ? "Enter a research topic..." : "Ask anything or describe an image..."} 
                className="min-h-[60px] border-none resize-none text-base py-4" 
              />
              <PromptInputHeader className="px-3 pb-3 pt-0">
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments label="Upload Documents or Images" />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>
                <div className="ml-auto flex items-center gap-2">
                    {deepResearchMode && <Badge variant="secondary" className="h-6 text-[10px] text-purple-600">Deep Research On</Badge>}
                    <PromptInputSubmit className="bg-orange-600 hover:bg-orange-700 text-white shadow-md transition-all hover:scale-105" />
                </div>
              </PromptInputHeader>
            </PromptInput>
            <div className="mt-2 text-center">
                <p className="text-[10px] text-muted-foreground">
                    Powered by Cloudflare Workers AI • Llama 3.3 • Flux.2 • Browser Rendering
                </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityItem({ icon, label, active }: { icon: any, label: string, active: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-all duration-300 ${active ? "bg-orange-500/10 text-orange-700 translate-x-1" : "text-muted-foreground hover:bg-muted/50"}`}>
      {React.cloneElement(icon, { className: `size-4 ${active ? "animate-pulse" : ""}` })}
      <span>{label}</span>
      {active && <div className="ml-auto size-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />}
    </div>
  );
}
