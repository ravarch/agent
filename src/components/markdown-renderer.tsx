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
        // Code Block
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
        // Images
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
        // Tables (Typed as any to prevent strict prop collisions)
        table(props: any) {
            return (
                <div className="my-4 w-full overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm text-left" {...props} />
                </div>
            );
        },
        thead(props: any) {
            return <thead className="bg-muted text-muted-foreground uppercase text-xs" {...props} />;
        },
        th(props: any) {
            return <th className="px-4 py-3 font-medium" {...props} />;
        },
        td(props: any) {
            return <td className="px-4 py-2 border-t" {...props} />;
        },
        a(props: any) {
            return <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" {...props} />;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
