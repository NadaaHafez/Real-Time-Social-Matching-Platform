"use client";

import { sendMessageEventSchema, type ChatMessage, type SessionEndedEvent } from "@social-matching/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { Button, ErrorText, Input, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { countryFlag, countryName } from "@/lib/format";
import { keys, useCurrentChat } from "@/lib/queries";

/** "Typing…" disappears if the partner goes quiet without saying so. */
const TYPING_TIMEOUT_MS = 4_000;
/** We tell the partner we stopped after this long without a keystroke. */
const TYPING_IDLE_MS = 2_000;

export default function ChatPage() {
  const ready = useGuard("app");
  const { profile, socket } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentChat = useCurrentChat(ready);
  const chat = currentChat.data?.chat ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [ended, setEnded] = useState<SessionEndedEvent["reason"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  const typingSent = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No open chat (ended elsewhere, or none at all): back to rolling.
  useEffect(() => {
    if (currentChat.data && !currentChat.data.chat && !ended) router.replace("/home");
  }, [currentChat.data, ended, router]);

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
      if (event.sessionId !== chat.sessionId) return;
      setEnded(event.reason);
      void queryClient.invalidateQueries({ queryKey: keys.balance });
    });

    return () => {
      clearTimeout(typingTimer);
      socket.off("chat:message");
      socket.off("chat:typing");
      socket.off("session:ended");
    };
  }, [socket, chat, queryClient]);

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
    setError(null);
    sendTyping(value.length > 0);

    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => sendTyping(false), TYPING_IDLE_MS);
  }

  async function send() {
    if (!socket || !chat) return;

    // The same schema the server validates this event with.
    const event = sendMessageEventSchema.safeParse({ sessionId: chat.sessionId, body: draft });
    if (!event.success) return setError(event.error.errors[0].message);

    // The message comes back as a `chat:message` event, like the partner's.
    const result = await socket.emitWithAck("chat:message", event.data);
    if (!result.ok) return setError(result.message);

    setDraft("");
    sendTyping(false);
  }

  function rollAgain() {
    queryClient.removeQueries({ queryKey: keys.currentChat });
    router.replace("/home");
  }

  if (!ready || !chat) return <Loading />;

  const { partner } = chat;

  return (
    <Screen>
      <header className="flex items-center gap-3 rounded-3xl border border-white/5 bg-surface p-3">
        <span className="grid size-12 place-items-center rounded-full bg-white/5 text-2xl">{countryFlag(partner.country)}</span>
        <div className="flex-1">
          <p className="font-semibold">{partner.displayName}</p>
          <p className="text-sm text-zinc-500">
            {partner.age} · {partner.gender} · {countryName(partner.country)}
          </p>
        </div>
        {!ended && (
          <Button
            variant="danger"
            className="px-3 py-2 text-sm"
            onClick={() => void socket?.emitWithAck("session:leave", { sessionId: chat.sessionId })}
          >
            Leave
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && !ended && (
          <p className="m-auto text-sm text-zinc-500">Say hi to {partner.displayName} 👋</p>
        )}

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.p
              key={message.id}
              layout
              initial={{ opacity: 0, x: message.author === "me" ? 24 : -24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`max-w-[80%] break-words rounded-3xl px-4 py-2.5 ${
                message.author === "me"
                  ? "self-end rounded-br-md bg-gradient-to-br from-brand to-brand-deep text-white"
                  : "self-start rounded-bl-md bg-white/10"
              }`}
            >
              {message.body}
            </motion.p>
          ))}
        </AnimatePresence>

        <AnimatePresence>{partnerTyping && !ended && <TypingDots />}</AnimatePresence>
        <div ref={bottom} />
      </div>

      {ended ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 text-center">
          <p className="text-zinc-400">
            {ended === "partner_left" ? `${partner.displayName} left the chat.` : "You left the chat."}
          </p>
          <Button onClick={rollAgain}>Roll again</Button>
        </motion.div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Input className="flex-1" value={draft} onChange={(e) => onDraftChange(e.target.value)} placeholder="Message" />
          <Button type="submit" disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

function TypingDots() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex w-fit gap-1 self-start rounded-3xl rounded-bl-md bg-white/10 px-4 py-3"
    >
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="size-2 rounded-full bg-zinc-400"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.15 }}
        />
      ))}
    </motion.div>
  );
}
