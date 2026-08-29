import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatFrame } from "@/app/components/ChatFrame";

type ChatRow = {
  id: string;
  role: "user" | "assistant" | "proposal";
  content: string;
  meta: null | {
    symbol?: string;
    action?: "buy" | "sell" | "short" | "cover";
    qty?: number;
    confidence?: number;
    reasoning?: string;
    sources?: { tag: string; text: string }[];
    lastPrice?: number;
    order_id?: string;
    fill_price?: number;
  };
  created_at: string;
};

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Verify the session belongs to this user
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) redirect("/app/chat");

  const { data } = await supabase
    .from("chat_messages")
    .select("id, role, content, meta, created_at")
    .eq("session_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const messages: ChatRow[] = (data ?? []) as ChatRow[];

  return (
    <div
      className="w-full mx-auto relative z-10"
      style={{ maxWidth: "100vw", height: "calc(100vh - 32px)" }}
    >
      <ChatFrame
        sessionId={id}
        initialMessages={messages}
        title={session.title}
      />
    </div>
  );
}
