import { ExternalLink } from "lucide-react";

/** Guideline sources arrive as "Name (https://url)". Render the name as a link when a URL is present. */
export function parseSource(source: string): { label: string; url: string | null } {
  const match = source.match(/^(.*?)\s*\((https?:\/\/[^\s)]+)\)\s*$/);
  if (match) return { label: match[1].trim(), url: match[2] };
  const bare = source.match(/https?:\/\/\S+/);
  return { label: source, url: bare ? bare[0] : null };
}

export function SourceLink({ source, className }: { source: string; className?: string }) {
  const { label, url } = parseSource(source);
  if (!url) return <span className={className}>{label}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={
        className ??
        "inline-flex items-center gap-1 text-xs font-medium text-agent-doctor underline-offset-2 hover:underline"
      }
      aria-label={`Source: ${label}`}
    >
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  );
}
