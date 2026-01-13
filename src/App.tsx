import { useState, useEffect } from "react";
import { useAgent } from "agents/react";
import { nanoid } from "nanoid";
import { 
  Bot, User, Paperclip, Globe, Image as ImageIcon,
  FileText, BrainCircuit, Cpu, Terminal, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import React from "react";

// Components
import { 
  Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton 
} from "@/components/ai-elements/conversation";
import { 
  Message, MessageContent, MessageResponse 
} from "@/components/ai-elements/message";
import { 
  PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputHeader, 
  PromptInputTools, PromptInputActionMenu, PromptInputActionMenuTrigger, 
  PromptInputActionMenuContent, PromptInputActionAddAttachments
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Types
type ToolStatus = "idle" | "searching" | "drawing" | "reading" | "thinking";
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: string[];
  isStreaming?: boolean;
};

// Status Indicator Component
const StatusIndicator = ({ status, text }: { status: ToolStatus, text: string }) => {
  const icons = {
    idle: <Bot className="size-4" />,
    searching: <Globe className="size-4 text-blue-400 animate-pulse" />,
    drawing: <ImageIcon className="size-4 text-purple-400 animate-pulse" />,
    reading: <FileText className="size-4 text-orange-400 animate-pulse" />,
    thinking: <Cpu className="size-4 text-green-400 animate-spin" />,
  };
  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
      {icons[status] || icons.thinking}
      <span>{text}</span>
    </div>
  );
};

export default function App() {
  const agent = useAgent({ agent: "super-agent", name: "default-session" });
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolStatus, setToolStatus] = useState<ToolStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

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
          const c = data.content.toLowerCase();
          if (c.includes("search")) setToolStatus("searching");
          else if (c.includes("draw")) setToolStatus("drawing");
          else if (c.includes("read")) setToolStatus("reading");
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
    setMessages(prev => [...prev, { id: nanoid(), role: "user", content: message.text, attachments: fileNames }]);

    if (message.files.length > 0) {
      setToolStatus("reading");
      setStatusText("Uploading...");
      try {
        await Promise.all(message.files.map(async (f) => {
          const res = await fetch(f.url);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append("file", new File([blob], f.filename));
          await fetch("/api/upload", { method: "POST", body: formData });
        }));
        setUploadedFiles(p => [...p, ...fileNames]);
        toast.success("Files uploaded");
      } catch (e) { toast.error("Upload failed"); }
    }

    agent.send(JSON.stringify({ prompt: message.text }));
    setToolStatus("thinking");
    setStatusText("Processing...");
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="hidden w-64 flex-col border-r bg-muted/10 md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <BrainCircuit className="size-5 text-orange-600" />
          <span className="font-bold text-sm">Super Agent</span>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="mb-4 space-y-1">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">Tools</h3>
            <CapabilityItem icon={<Globe />} label="Web Browsing" active={toolStatus === "searching"} />
            <CapabilityItem icon={<ImageIcon />} label="Image Gen" active={toolStatus === "drawing"} />
            <CapabilityItem icon={<FileText />} label="File Reader" active={toolStatus === "reading"} />
            <CapabilityItem icon={<Terminal />} label="Research" active={false} />
          </div>
          <Separator className="my-4" />
          <div>
             <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">Files</h3>
             {uploadedFiles.map((f, i) => (
               <div key={i} className="flex items-center gap-2 p-2 text-xs border rounded mb-1 bg-background">
                 <Paperclip className="size-3" /> <span className="truncate">{f}</span>
               </div>
             ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <span className="font-bold text-sm">Super Agent</span>
          <Sheet>
            <SheetTrigger><Button variant="ghost" size="icon"><ChevronRight /></Button></SheetTrigger>
            <SheetContent side="left"><SheetHeader><SheetTitle>Status</SheetTitle></SheetHeader></SheetContent>
          </Sheet>
        </header>

        <Conversation className="flex-1 bg-background/50">
          <ConversationContent className="max-w-3xl mx-auto py-8">
            {messages.length === 0 ? (
              <ConversationEmptyState icon={<BrainCircuit className="size-12 opacity-20" />} title="Ready to help" />
            ) : (
              messages.map(msg => (
                <Message key={msg.id} from={msg.role === "user" ? "user" : "assistant"} className="gap-4">
                   <div className={`flex size-8 items-center justify-center rounded-full border ${msg.role === 'user' ? 'bg-secondary' : 'bg-orange-500/10'}`}>
                     {msg.role === "user" ? <User className="size-4" /> : <Bot className="size-4 text-orange-600" />}
                   </div>
                   <div className="flex-1 min-w-0">
                     <MessageContent className="shadow-none border bg-transparent">
                       {msg.attachments?.map((f, i) => <Badge key={i} variant="secondary" className="mb-2 mr-2">{f}</Badge>)}
                       <MessageResponse>{msg.content}</MessageResponse>
                     </MessageContent>
                   </div>
                </Message>
              ))
            )}
            {toolStatus !== "idle" && <div className="flex justify-center pt-4"><StatusIndicator status={toolStatus} text={statusText} /></div>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="p-4 border-t bg-background/80 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <PromptInput maxFiles={5} onSubmit={handleSubmit} className="rounded-2xl border bg-background shadow-lg">
              <PromptInputTextarea placeholder="Ask anything..." className="min-h-[50px] border-none resize-none" />
              <PromptInputHeader className="px-3 pb-2">
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments label="Upload Files" />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>
                <PromptInputSubmit className="ml-auto bg-orange-600 text-white" />
              </PromptInputHeader>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityItem({ icon, label, active }: { icon: any, label: string, active: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-md px-2 py-2 text-xs font-medium transition-colors ${active ? "bg-orange-500/10 text-orange-600" : "text-muted-foreground"}`}>
      {React.cloneElement(icon, { className: "size-4" })}
      <span>{label}</span>
      {active && <div className="ml-auto size-1.5 rounded-full bg-orange-500 animate-pulse" />}
    </div>
  );
}
