"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { sendTransactionLocation, sendTransactionMessage } from "@/app/rekber-actions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { REKBER_STAGES, stageFromStatus } from "@/lib/rekber-stages";
import SubmitButton from "@/components/SubmitButton";

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  messageType?: "text" | "location";
  locationLat?: number | null;
  locationLng?: number | null;
  locationAccuracyM?: number | null;
  locationSharedAt?: string | null;
};

type PendingLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
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
  const [locationState, locationAction] = useActionState<SendState, FormData>(
    sendTransactionLocation,
    null
  );
  const [pendingLocation, setPendingLocation] =
    useState<PendingLocation | null>(null);
  const [acquiring, setAcquiring] = useState(false);
  const [geoError, setGeoError] = useState("");
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
            message_type?: string | null;
            location_lat?: number | string | null;
            location_lng?: number | string | null;
            location_accuracy_m?: number | string | null;
            location_shared_at?: string | null;
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
                messageType:
                  row.message_type === "location" ? "location" : "text",
                locationLat:
                  row.location_lat == null
                    ? null
                    : Number(row.location_lat),
                locationLng:
                  row.location_lng == null
                    ? null
                    : Number(row.location_lng),
                locationAccuracyM:
                  row.location_accuracy_m == null
                    ? null
                    : Number(row.location_accuracy_m),
                locationSharedAt: row.location_shared_at ?? null,
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

  // Setelah lokasi terkirim: tutup konfirmasi dan tarik data segar.
  useEffect(() => {
    if (locationState?.ok) {
      setPendingLocation(null);
      setGeoError("");
      router.refresh();
    }
  }, [locationState, router]);

  // Lokasi satu titik (bukan pelacakan live): satu kali baca posisi
  // perangkat, lalu minta konfirmasi sebelum dikirim ke chat.
  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoError(
        "Perangkat atau browser ini tidak mendukung berbagi lokasi."
      );
      return;
    }
    setAcquiring(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAcquiring(false);
        setPendingLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        });
      },
      (error) => {
        setAcquiring(false);
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi browser bila ingin berbagi lokasi."
            : "Lokasi tidak dapat diambil. Coba lagi."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const iSharedLocation = messages.some(
    (m) => m.senderId === currentUserId && m.messageType === "location"
  );

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

      {chatAvailable && !iSharedLocation && (
        <p className="chat-location-reminder">
          Anda belum membagikan lokasi di transaksi ini. Buyer dan seller
          wajib membagikan lokasi di chat — gunakan tombol “Bagikan
          lokasi” di bawah. Admin penangan dan super-admin dapat
          melihat lokasi yang dibagikan.
        </p>
      )}

      {messages.length > 0 && (
        <ol className="chat-list">
          {messages.map((message) => {
            const mine = message.senderId === currentUserId;
            const isLocation =
              message.messageType === "location" &&
              message.locationLat != null &&
              message.locationLng != null;
            const lat = message.locationLat ?? 0;
            const lng = message.locationLng ?? 0;
            return (
              <li key={message.id} className={mine ? "chat-mine" : "chat-theirs"}>
                <small>
                  {message.senderName} ·{" "}
                  {new Date(message.createdAt).toLocaleString("id-ID")}
                </small>
                {isLocation ? (
                  <div className="chat-location">
                    <iframe
                      title="Pratinjau lokasi yang dibagikan"
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${(lng - 0.005).toFixed(6)}%2C${(lat - 0.005).toFixed(6)}%2C${(lng + 0.005).toFixed(6)}%2C${(lat + 0.005).toFixed(6)}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`}
                    />
                    <small>
                      Lokasi dibagikan{" "}
                      {message.locationSharedAt
                        ? new Date(message.locationSharedAt).toLocaleString("id-ID")
                        : new Date(message.createdAt).toLocaleString("id-ID")}
                      {message.locationAccuracyM != null &&
                        ` · akurasi ±${Math.round(message.locationAccuracyM)} m`}
                    </small>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(6)}/${lng.toFixed(6)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Buka di peta
                    </a>
                    <small>
                      Lokasi satu titik — bukan pelacakan live. Tidak ada
                      tombol unduh data lokasi.
                    </small>
                  </div>
                ) : (
                  <p>{message.body}</p>
                )}
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

      {chatAvailable && (
        <div className="chat-share">
          {!pendingLocation && (
            <button
              type="button"
              className="btn secondary"
              onClick={requestLocation}
              disabled={acquiring}
            >
              {acquiring ? "Mengambil lokasi…" : "Bagikan lokasi"}
            </button>
          )}
          {geoError && (
            <p className="chat-error" role="alert">
              {geoError}
            </p>
          )}
          {pendingLocation && (
            <form action={locationAction} className="chat-share-confirm">
              <input type="hidden" name="transaction_id" value={transactionId} />
              <input
                type="hidden"
                name="latitude"
                value={pendingLocation.lat}
              />
              <input
                type="hidden"
                name="longitude"
                value={pendingLocation.lng}
              />
              <input
                type="hidden"
                name="accuracy"
                value={pendingLocation.accuracy ?? ""}
              />
              <p>
                Bagikan titik ini ke chat? Koordinat{" "}
                {pendingLocation.lat.toFixed(6)},{" "}
                {pendingLocation.lng.toFixed(6)}
                {pendingLocation.accuracy != null &&
                  ` (akurasi ±${Math.round(pendingLocation.accuracy)} m)`}
                . Lokasi terlihat buyer, seller, dan admin penangan;
                tidak ada pelacakan live.
              </p>
              {locationState && !locationState.ok && (
                <p className="chat-error" role="alert">
                  {locationState.error === "location_unavailable"
                    ? "Fitur lokasi belum aktif — migrasi database belum dijalankan."
                    : locationState.error === "not_allowed"
                      ? "Anda tidak termasuk peserta chat transaksi ini."
                      : "Lokasi gagal dikirim. Coba lagi."}
                </p>
              )}
              <div className="rekber-actions">
                <SubmitButton pendingLabel="Membagikan…">
                  Bagikan titik ini
                </SubmitButton>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setPendingLocation(null)}
                >
                  Batal
                </button>
              </div>
            </form>
          )}
          <p className="chat-report-link">
            <a href="#eskalasi">
              Laporkan transaksi ini ke tim penindakan
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
