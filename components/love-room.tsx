"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Camera,
  Copy,
  Gift,
  Heart,
  Image as ImageIcon,
  LocateFixed,
  MapPin,
  MonitorSmartphone,
  Palette,
  Send,
  Sparkles,
  UserRound,
  Video,
  X
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { db, hasFirebaseConfig } from "@/lib/firebase";
import { defaultRoom, gifts, loveQuotes, themes } from "@/lib/room-data";
import { readLocalMessages, readLocalRoom, writeLocalMessages, writeLocalRoom } from "@/lib/local-store";
import { useUiStore } from "@/lib/store";
import type { LoveMessage, Profile, SharedRoom, ThemeName } from "@/lib/types";

type Props = {
  roomId: string;
};

const quickNotes = ["I miss you", "Proud of you", "Drink water", "Rest a little", "Sending a hug"];

export function LoveRoom({ roomId }: Props) {
  const { sender, setSender } = useUiStore();
  const [room, setRoom] = useState<SharedRoom>({ ...defaultRoom, id: roomId });
  const [messages, setMessages] = useState<LoveMessage[]>([]);
  const [text, setText] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const receiver = sender === "biswajit" ? "dibya" : "biswajit";
  const currentProfile = room.profiles[sender];
  const theme = themes[room.theme];
  const roomUrl = typeof window === "undefined" ? "" : window.location.href;

  useEffect(() => {
    document.documentElement.style.setProperty("--theme-primary", theme.primary);
    document.documentElement.style.setProperty("--theme-secondary", theme.secondary);
    document.documentElement.style.setProperty("--theme-bg", theme.bg);
  }, [theme]);

  useEffect(() => {
    if (!hasFirebaseConfig || !db) {
      setRoom(readLocalRoom(roomId));
      setMessages(readLocalMessages(roomId));
      setIsReady(true);
      return;
    }

    const roomRef = doc(db, "rooms", roomId);
    getDoc(roomRef).then((snap) => {
      if (!snap.exists()) {
        setDoc(roomRef, { ...defaultRoom, id: roomId, updatedAt: serverTimestamp() });
      }
    });

    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (snap.exists()) setRoom(snap.data() as SharedRoom);
      setIsReady(true);
    });

    const messagesRef = collection(db, "rooms", roomId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(100));
    const unsubMessages = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            roomId,
            sender: data.sender,
            kind: data.kind,
            text: data.text,
            mediaUrl: data.mediaUrl,
            createdAt: data.createdAt?.toMillis?.() ?? Date.now()
          } as LoveMessage;
        })
      );
    });

    return () => {
      unsubRoom();
      unsubMessages();
    };
  }, [roomId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const roomIntro = useMemo(() => {
    return `${room.profiles.dibya.name} is a ${room.profiles.dibya.role.toLowerCase()}, loved by ${room.profiles.biswajit.name}.`;
  }, [room.profiles]);

  async function saveRoom(nextRoom: SharedRoom) {
    setRoom(nextRoom);
    if (hasFirebaseConfig && db) {
      await setDoc(doc(db, "rooms", roomId), { ...nextRoom, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      writeLocalRoom(nextRoom);
    }
  }

  async function sendMessage(input: Omit<LoveMessage, "id" | "roomId" | "sender" | "createdAt">) {
    const message: LoveMessage = {
      id: crypto.randomUUID(),
      roomId,
      sender: currentProfile.name,
      createdAt: Date.now(),
      ...input
    };

    if (hasFirebaseConfig && db) {
      await addDoc(collection(db, "rooms", roomId, "messages"), {
        sender: message.sender,
        kind: message.kind,
        text: message.text,
        mediaUrl: message.mediaUrl ?? "",
        createdAt: serverTimestamp()
      });
    } else {
      const next = [...messages, message].slice(-80);
      setMessages(next);
      writeLocalMessages(roomId, next);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    await sendMessage({ kind: "text", text: text.trim() });
    setText("");
  }

  async function updateProfile(person: "biswajit" | "dibya", field: keyof Profile, value: string) {
    const nextRoom = {
      ...room,
      profiles: {
        ...room.profiles,
        [person]: { ...room.profiles[person], [field]: value }
      }
    };
    await saveRoom(nextRoom);
  }

  async function changeTheme(nextTheme: ThemeName) {
    await saveRoom({ ...room, theme: nextTheme });
  }

  async function changeQuote() {
    const index = (loveQuotes.indexOf(room.quoteOfDay) + 1) % loveQuotes.length;
    await saveRoom({ ...room, quoteOfDay: loveQuotes[index] });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(roomUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    streamRef.current = stream;
    setCameraOpen(true);
    window.setTimeout(() => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    }, 0);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function captureSnap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const size = fitSize(video.videoWidth || 720, video.videoHeight || 960, 520);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const mediaUrl = canvas.toDataURL("image/jpeg", 0.62);
    await sendMessage({ kind: "snap", text: "A fresh camera snap, sent with love.", mediaUrl });
    stopCamera();
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const mediaUrl = await compressImageFile(file);
      await sendMessage({ kind: "photo", text: "Shared a memory photo.", mediaUrl });
      event.target.value = "";
    } finally {
      setUploading(false);
    }
  }

  async function shareLocation() {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        let address = "Address lookup unavailable";
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          address = data.display_name ?? address;
        } catch {
          address = "Only latitude and longitude shared";
        }
        await sendMessage({
          kind: "location",
          text: `Shared location with permission: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}. Accuracy ${Math.round(
            accuracy
          )}m. ${address}`
        });
      },
      async () => {
        await sendMessage({ kind: "location", text: "Location permission was not allowed." });
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function shareDevice() {
    const details = [
      `Browser: ${navigator.userAgent}`,
      `Language: ${navigator.language}`,
      `Screen: ${window.screen.width}x${window.screen.height}`,
      `Online: ${navigator.onLine ? "yes" : "no"}`
    ].join("\n");
    await sendMessage({ kind: "device", text: `Shared device details with permission:\n${details}` });
  }

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass rounded-lg px-6 py-5 text-sm font-semibold text-rosewood shadow-soft">Opening your private room...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[340px_1fr_320px]">
        <aside className="space-y-4">
          <div className="glass rounded-lg p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--theme-secondary)]">Private love room</p>
                <h1 className="mt-1 text-3xl font-black text-ink">Dibya & Biswajit</h1>
              </div>
              <Heart className="h-8 w-8 fill-[color:var(--theme-primary)] text-[color:var(--theme-primary)]" />
            </div>
            <p className="mt-3 text-sm leading-6 text-ink/70">{roomIntro}</p>
            <button
              onClick={copyLink}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-bold text-white"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Link copied" : "Copy invite link"}
            </button>
            <p className="mt-3 text-xs leading-5 text-ink/55">
              No login is used. Anyone with this link can join, so keep the link private.
            </p>
          </div>

          <ProfileCard title="Biswajit" profile={room.profiles.biswajit} onChange={(field, value) => updateProfile("biswajit", field, value)} />
          <ProfileCard title="Dibya" profile={room.profiles.dibya} onChange={(field, value) => updateProfile("dibya", field, value)} />
        </aside>

        <section className="glass flex min-h-[82vh] flex-col rounded-lg shadow-soft">
          <div className="border-b border-ink/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-[color:var(--theme-primary)]">
                  <Sparkles className="h-4 w-4" />
                  Quote of the day
                </p>
                <p className="mt-1 text-lg font-bold leading-7 text-ink">{room.quoteOfDay}</p>
              </div>
              <button onClick={changeQuote} className="rounded-md border border-ink/15 px-4 py-2 text-sm font-bold text-ink">
                New quote
              </button>
            </div>
          </div>

          <div ref={listRef} className="no-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[24rem] flex-col items-center justify-center text-center">
                <Gift className="h-12 w-12 text-[color:var(--theme-primary)]" />
                <h2 className="mt-3 text-2xl font-black text-ink">Start with a soft hello</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-ink/60">
                  Send a quote, flower, snap, or caring note. The room will feel alive as both of you use it.
                </p>
              </div>
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} mine={message.sender === currentProfile.name} />)
            )}
          </div>

          <div className="border-t border-ink/10 p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {quickNotes.map((note) => (
                <button
                  key={note}
                  onClick={() => setText(note)}
                  className="shrink-0 rounded-full border border-ink/10 bg-white/70 px-3 py-2 text-xs font-bold text-ink"
                >
                  {note}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={`Message ${room.profiles[receiver].name}`}
                className="min-w-0 flex-1 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-[color:var(--theme-primary)]"
              />
              <button className="flex h-12 w-12 items-center justify-center rounded-md bg-[color:var(--theme-primary)] text-white" aria-label="Send">
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
              <UserRound className="h-4 w-4" />
              Send as
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["biswajit", "dibya"] as const).map((person) => (
                <button
                  key={person}
                  onClick={() => setSender(person)}
                  className={`rounded-md px-3 py-3 text-sm font-bold ${
                    sender === person ? "bg-ink text-white" : "border border-ink/10 bg-white/70 text-ink"
                  }`}
                >
                  {room.profiles[person].name}
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
              <Gift className="h-4 w-4" />
              Love gifts
            </p>
            <div className="grid grid-cols-2 gap-2">
              {gifts.map((gift) => (
                <button
                  key={gift.label}
                  onClick={() => sendMessage({ kind: "gift", text: `${gift.icon} ${gift.text}` })}
                  className="rounded-md border border-ink/10 bg-white/75 p-3 text-left"
                >
                  <span className="text-2xl">{gift.icon}</span>
                  <span className="mt-1 block text-xs font-bold text-ink">{gift.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
              <Camera className="h-4 w-4" />
              Photos and consent shares
            </p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-3 text-sm font-bold text-ink">
                <ImageIcon className="h-4 w-4" />
                {uploading ? "Uploading..." : "Share photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
              <button onClick={startCamera} className="flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-3 text-sm font-bold text-white">
                <Video className="h-4 w-4" />
                Open camera
              </button>
              <button
                onClick={shareLocation}
                className="flex items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-3 text-sm font-bold text-ink"
              >
                <LocateFixed className="h-4 w-4" />
                Share my location
              </button>
              <button
                onClick={shareDevice}
                className="flex items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-3 text-sm font-bold text-ink"
              >
                <MonitorSmartphone className="h-4 w-4" />
                Share device details
              </button>
            </div>
          </div>

          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
              <Palette className="h-4 w-4" />
              Theme
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(themes) as ThemeName[]).map((name) => (
                <button
                  key={name}
                  onClick={() => changeTheme(name)}
                  className={`rounded-md px-3 py-2 text-sm font-bold ${room.theme === name ? "bg-ink text-white" : "bg-white text-ink"}`}
                >
                  {themes[name].label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {cameraOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-soft">
            <div className="flex items-center justify-between p-3">
              <p className="font-black text-ink">Camera snap</p>
              <button onClick={stopCamera} className="rounded-md p-2 text-ink" aria-label="Close camera">
                <X className="h-5 w-5" />
              </button>
            </div>
            <video ref={videoRef} autoPlay playsInline muted className="aspect-[3/4] w-full bg-black object-cover" />
            <div className="grid grid-cols-2 gap-2 p-3">
              <button onClick={stopCamera} className="rounded-md border border-ink/10 px-4 py-3 text-sm font-bold text-ink">
                Cancel
              </button>
              <button onClick={captureSnap} className="rounded-md bg-[color:var(--theme-primary)] px-4 py-3 text-sm font-bold text-white">
                Send snap
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function fitSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Could not load image"));
      image.onload = () => {
        const size = fitSize(image.width, image.height, 640);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.getContext("2d")?.drawImage(image, 0, 0, size.width, size.height);
        resolve(canvas.toDataURL("image/jpeg", 0.62));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ProfileCard({
  title,
  profile,
  onChange
}: {
  title: string;
  profile: Profile;
  onChange: (field: keyof Profile, value: string) => void;
}) {
  return (
    <div className="glass rounded-lg p-4 shadow-soft">
      <p className="mb-3 text-sm font-black text-ink">{title} profile</p>
      <div className="space-y-2">
        <input
          value={profile.name}
          onChange={(event) => onChange("name", event.target.value)}
          className="w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink"
          placeholder="Name"
        />
        <input
          value={profile.role}
          onChange={(event) => onChange("role", event.target.value)}
          className="w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
          placeholder="Role"
        />
        <textarea
          value={profile.bio}
          onChange={(event) => onChange("bio", event.target.value)}
          className="min-h-20 w-full resize-none rounded-md border border-ink/10 bg-white px-3 py-2 text-sm leading-5 text-ink"
          placeholder="Bio"
        />
        <input
          value={profile.photoUrl}
          onChange={(event) => onChange("photoUrl", event.target.value)}
          className="w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
          placeholder="Profile photo URL"
        />
      </div>
    </div>
  );
}

function MessageBubble({ message, mine }: { message: LoveMessage; mine: boolean }) {
  return (
    <article className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-lg px-4 py-3 shadow-sm ${mine ? "bg-[color:var(--theme-primary)] text-white" : "bg-white text-ink"}`}>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold opacity-80">
          {message.kind === "location" ? <MapPin className="h-3 w-3" /> : null}
          <span>{message.sender}</span>
          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {message.mediaUrl ? (
          <Image src={message.mediaUrl} alt="" width={720} height={960} unoptimized className="mb-2 max-h-80 w-full rounded-md object-cover" />
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
      </div>
    </article>
  );
}
