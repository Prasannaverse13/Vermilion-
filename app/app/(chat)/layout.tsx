/**
 * Layout for the chat workspace (Perplexity-style).
 * No global /app nav — the ChatSidebar inside ChatFrame owns navigation
 * in this view, so the chat frame can fill the viewport.
 */
export default function ChatWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
