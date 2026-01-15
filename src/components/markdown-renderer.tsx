import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      className="prose prose-sm dark:prose-invert max-w-none break-words"
      remarkPlugins={[remarkGfm]}
      components={{
        // Code Block Renderer
        code(props: any) {
          const { children, className, node, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          return match ? (
            <SyntaxHighlighter
              {...rest}
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              className="rounded-md border my-4"
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code {...rest} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-orange-600">
              {children}
            </code>
          );
        },
        // Image Renderer
        img(props: any) {
          return (
            <div className="relative my-4 overflow-hidden rounded-lg border bg-muted/50">
                <img 
                    src={props.src} 
                    alt={props.alt} 
                    className="w-full h-auto object-cover max-h-[500px] hover:scale-[1.02] transition-transform duration-500"
                    loading="lazy"
                />
            </div>
          );
        },
        // Table Renderer
        table({ children }: { children: React.ReactNode }) {
            return (
                <div className="my-4 w-full overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm text-left">{children}</table>
                </div>
            );
        },
        thead({ children }: { children: React.ReactNode }) {
            return <thead className="bg-muted text-muted-foreground uppercase text-xs">{children}</thead>;
        },
        th({ children }: { children: React.ReactNode }) {
            return <th className="px-4 py-3 font-medium">{children}</th>;
        },
        td({ children }: { children: React.ReactNode }) {
            return <td className="px-4 py-2 border-t">{children}</td>;
        },
        a({ href, children }: { href?: string; children: React.ReactNode }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{children}</a>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
