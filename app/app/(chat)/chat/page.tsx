import { createClient } from "@/lib/supabase/server";
import { ChatFrame } from "@/app/components/ChatFrame";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null; // proxy redirects
  }

  // No session yet — empty state. The ChatFrame will create one
  // automatically when the user sends their first message.
  return (
    <div
      className="w-full mx-auto relative z-10"
      style={{ maxWidth: "100vw", height: "calc(100vh - 32px)" }}
    >
      <ChatFrame
        sessionId={null}
        initialMessages={[]}
        title="New chat"
      />
    </div>
  );
}
