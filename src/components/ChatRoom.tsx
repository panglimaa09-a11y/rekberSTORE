"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { sendTransactionMessage } from "@/app/rekber-actions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { REKBER_STAGES, stageFromStatus } from "@/lib/rekber-stages";
import SubmitButton from "@/components/SubmitButton";

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type SendState = { ok: boolean; error?: string } | null;

function mergeMessages(
  prev: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of [...prev, ...incoming]) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

const shortId = (value: string) => value.slice(0, 8) + "…";

/**
 * Ruang chat satu transaksi: buyer + seller + admin penangan.
 * Pesan masuk lewat Realtime (postgres_changes) dengan fallback
 * refresh berkala + query segar saat halaman dibuka. Langganan
 * dibersihkan saat unmount. Tanpa upload file, tanpa data sensitif.
 */
export default function ChatRoom({
  transactionId,
  currentUserId,
  initialMessages,
  initialStage,
  adminAssigned,
  adminName,
  chatAvailable,
}: {
  transactionId: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
  initialStage: number;
  adminAssigned: boolean;
  adminName: string | null;
  chatAvailable: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [stage, setStage] = useState(initialStage);
  const [realtimeOn, setRealtimeOn] = useState(false);
  const [sendState, formAction] = useActionState<SendState, FormData>(
    sendTransactionMessage,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const nameCache = useRef(
    new Map(initialMessages.map((m) => [m.senderId, m.senderName]))
  );

  // Data segar dari server (setelah router.refresh) digabung ke state
  // lokal berdasarkan id — pesan tidak hilang dan tidak ganda.
  useEffect(() => {
    setMessages((prev) => mergeMessages(prev, initialMessages));
    setStage(initialStage);
  }, [initialMessages, initialStage]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const channel = supabase
      .channel(`rekber-tx-${transactionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transaction_messages",
          filter: `transaction_id=eq.${transactionId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          const cachedName = nameCache.current.get(row.sender_id);
          const fallbackName =
            row.sender_id === currentUserId
              ? "Anda"
              : `ID ${shortId(row.sender_id)}`;
          let resolvedName: string = cachedName ?? fallbackName;
          if (!cachedName) {
            try {
              const { data } = await supabase.rpc(
                "get_rekber_display_names",
                { p_user_ids: [row.sender_id] }
              );
              const found = Array.isArray(data) ? data[0] : null;
              if (found?.display_name) {
                resolvedName = found.display_name;
                nameCache.current.set(row.sender_id, resolvedName);
              }
            } catch {
              // Nama fallback sudah terisi; jangan gagalkan pesan.
            }
          }
          const senderName: string = resolvedName;
          setMessages((prev) =>
            mergeMessages(prev, [
              {
                id: row.id,
                senderId: row.sender_id,
                senderName,
                body: row.body,
                createdAt: row.created_at,
              },
            ])
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transaction_stage_events",
          filter: `transaction_id=eq.${transactionId}`,
        },
        () => {
          router.refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `id=eq.${transactionId}`,
        },
        (payload) => {
          const row = payload.new as {
            rekber_stage?: number | null;
            status?: string;
          };
          setStage(
            typeof row.rekber_stage === "number"
              ? row.rekber_stage
              : stageFromStatus(row.status ?? "")
          );
          router.refresh();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeOn(true);
      });

    // Fallback bila Realtime tidak tersedia: muat ulang data berkala.
    const timer = setInterval(() => router.refresh(), 30000);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [transactionId, currentUserId, router]);

  // Setelah pesan terkirim: kosongkan kolom dan tarik data segar.
  useEffect(() => {
    if (sendState?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [sendState, router]);

  const stageTitle =
    stage === 0
      ? "Pengajuan — menunggu persetujuan seller"
      : `Tahap ${stage} dari 8 — ${REKBER_STAGES[stage - 1]?.title ?? ""}`;

  return (
    <section className="panel">
      <div className="rekber-panel-heading">
        <div>
          <h2>Chat transaksi</h2>
          <p>
            {adminAssigned
              ? `Admin penangan: ${adminName || "ditunjuk"}.`
              : "Belum ada admin penangan — chat berjalan buyer ↔ seller."}
          </p>
        </div>
        <span className="rekber-status">
          {realtimeOn ? "Live" : "Pembaruan berkala"}
        </span>
      </div>

      <div className="chat-stage-banner" aria-live="polite">
        <b>{stageTitle}</b>
        {stage > 0 && (
          <small>{REKBER_STAGES[stage - 1]?.note}</small>
        )}
      </div>

      {!chatAvailable && (
        <div className="notice">
          <div>
            <b>Chat belum aktif</b>
            <p>
              Riwayat pesan belum dapat dibaca. Periksa migrasi database
              dan kebijakan Row Level Security pada tabel
              transaction_messages.
            </p>
          </div>
        </div>
      )}

      {chatAvailable && messages.length === 0 && (
        <div className="empty">
          <h3>Belum ada pesan</h3>
          <p>Mulai percakapan dengan pihak terkait transaksi ini.</p>
        </div>
      )}

      {messages.length > 0 && (
        <ol className="chat-list">
          {messages.map((message) => {
            const mine = message.senderId === currentUserId;
            return (
              <li key={message.id} className={mine ? "chat-mine" : "chat-theirs"}>
                <small>
                  {message.senderName} ·{" "}
                  {new Date(message.createdAt).toLocaleString("id-ID")}
                </small>
                <p>{message.body}</p>
              </li>
            );
          })}
        </ol>
      )}

      {chatAvailable && (
        <form
          ref={formRef}
          action={formAction}
          className="chat-form"
        >
          <input type="hidden" name="transaction_id" value={transactionId} />
          <label>
            Pesan
            <textarea
              name="body"
              required
              minLength={1}
              maxLength={5000}
              rows={3}
              placeholder="Tulis pesan untuk buyer, seller, dan admin penangan…"
            />
          </label>
          <small className="chat-hint">
            Teks saja, maks. 5000 karakter. Jangan kirim password, kode OTP,
            atau data identitas. Data/item transaksi disampaikan lewat chat
            ini.
          </small>
          {sendState && !sendState.ok && (
            <p className="chat-error" role="alert">
              {sendState.error === "chat_unavailable"
                ? "Chat belum aktif — migrasi database belum dijalankan."
                : sendState.error === "not_allowed"
                  ? "Anda tidak termasuk peserta chat transaksi ini."
                  : "Pesan gagal dikirim. Coba lagi."}
            </p>
          )}
          <SubmitButton className="btn" pendingLabel="Mengirim…">
            Kirim pesan
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
