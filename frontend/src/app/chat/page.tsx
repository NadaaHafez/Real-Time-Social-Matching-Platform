"use client";

import type { ChatMessage, CurrentChat, CurrentChatResponse, SessionEndedEvent } from "@social-matching/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { Button, ErrorText, inputClass, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api } from "@/lib/api";

/** "Typing…" disappears if the partner goes quiet without saying so. */
const TYPING_TIMEOUT_MS = 4_000;
/** We tell the partner we stopped after this long without a keystroke. */
const TYPING_IDLE_MS = 2_000;

export default function ChatPage() {
  const ready = useGuard("app");
  const { profile, socket } = useSession();
  const router = useRouter();

  const [chat, setChat] = useState<CurrentChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [ended, setEnded] = useState<SessionEndedEvent["reason"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  const typingSent = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;

    api.get<CurrentChatResponse>("/chat/current").then(({ chat }) => {
      if (!chat) return router.replace("/home");
      setChat(chat);
    });
  }, [ready, router]);

  // The ice breaker is offered, never sent on its own: the user still presses send.
  useEffect(() => {
    if (profile?.iceBreaker) setDraft(profile.iceBreaker);
  }, [profile?.iceBreaker]);

  useEffect(() => {
    if (!socket || !chat) return;

    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    socket.on("chat:message", (message) => {
      if (message.sessionId !== chat.sessionId) return;
      setMessages((list) => [...list, message]);
      if (message.author === "partner") setPartnerTyping(false);
    });

    socket.on("chat:typing", (event) => {
      if (event.sessionId !== chat.sessionId) return;
      setPartnerTyping(event.typing);
      clearTimeout(typingTimer);
      if (event.typing) typingTimer = setTimeout(() => setPartnerTyping(false), TYPING_TIMEOUT_MS);
    });

    socket.on("session:ended", (event) => {
      if (event.sessionId === chat.sessionId) setEnded(event.reason);
    });

    return () => {
      clearTimeout(typingTimer);
      socket.off("chat:message");
      socket.off("chat:typing");
      socket.off("session:ended");
    };
  }, [socket, chat]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  function sendTyping(typing: boolean) {
    if (!socket || !chat || typingSent.current === typing) return;
    typingSent.current = typing;
    socket.emit("chat:typing", { sessionId: chat.sessionId, typing });
  }

  function onDraftChange(value: string) {
    setDraft(value);
    sendTyping(value.length > 0);

    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => sendTyping(false), TYPING_IDLE_MS);
  }

  async function send() {
    if (!socket || !chat || !draft.trim()) return;
    setError(null);

    // The message comes back as a `chat:message` event, like the partner's do.
    const result = await socket.emitWithAck("chat:message", { sessionId: chat.sessionId, body: draft });
    if (!result.ok) return setError(result.message);

    setDraft("");
    sendTyping(false);
  }

  async function leave() {
    if (!socket || !chat) return;
    await socket.emitWithAck("session:leave", { sessionId: chat.sessionId });
  }

  if (!ready || !chat) return <Loading />;

  const { partner } = chat;

  return (
    <Screen>
      <header className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{partner.displayName}</p>
          <p className="text-sm text-zinc-500">
            {partner.age} · {partner.gender} · {partner.country}
          </p>
        </div>
        {!ended && (
          <Button variant="danger" className="px-3 py-2 text-sm" onClick={leave}>
            Leave
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && !ended && (
          <p className="m-auto text-sm text-zinc-500">Say hi to {partner.displayName}.</p>
        )}
        {messages.map((message) => (
          <p
            key={message.id}
            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
              message.author === "me" ? "self-end bg-brand text-white" : "self-start bg-zinc-800"
            }`}
          >
            {message.body}
          </p>
        ))}
        {partnerTyping && !ended && <p className="text-sm text-zinc-500">{partner.displayName} is typing…</p>}
        <div ref={bottom} />
      </div>

      {ended ? (
        <div className="flex flex-col gap-3 text-center">
          <p className="text-zinc-400">{ended === "partner_left" ? `${partner.displayName} left the chat.` : "You left the chat."}</p>
          <Button onClick={() => router.replace("/home")}>Roll again</Button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            className={`${inputClass} flex-1`}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Message"
            maxLength={1000}
          />
          <Button disabled={!draft.trim()}>Send</Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
