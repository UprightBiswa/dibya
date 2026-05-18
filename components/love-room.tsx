"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import {
  Camera,
  Edit3,
  Gift,
  Heart,
  Image as ImageIcon,
  LocateFixed,
  MapPin,
  MonitorSmartphone,
  Palette,
  Send,
  Sparkles,
  Trash2,
  Users,
  Video,
  X
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import { defaultRoom, gifts, loveQuotes, themes } from "@/lib/room-data";
import { readLocalMessages, readLocalRoom, writeLocalMessages, writeLocalRoom } from "@/lib/local-store";
import { useAppStore } from "@/lib/app-store";
import type { LoveMessage, Participant, SharedRoom, ThemeName } from "@/lib/types";

type Props = {
  roomId: string;
  onBack?: () => void;
};

const quickNotes = ["Thinking of you", "Proud of you", "Drink water", "Rest a little", "Sending a hug"];

export function LoveRoom({ roomId, onBack }: Props) {
  const [room, setRoom] = useState<SharedRoom>({ ...defaultRoom, id: roomId });
  const [messages, setMessages] = useState<LoveMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestBio, setGuestBio] = useState("");
  const [guestPhotoUrl, setGuestPhotoUrl] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedUser, setSelectedUser] = useState<Participant | null>(null);
  const [chatRooms, setChatRooms] = useState<SharedRoom[]>([]);
  const [text, setText] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef("");
  const { setSelectedTheme, playTone } = useAppStore();

  const isOwner = Boolean(user && room.ownerUid && user.uid === room.ownerUid);
  const isPeer = Boolean(user && room.peerUid && user.uid === room.peerUid);
  const isLegacyRoom = !room.ownerUid;
  const isMember = isLegacyRoom || isOwner || isPeer;
  const currentProfile = isOwner || isLegacyRoom ? room.profiles.owner : isPeer ? room.profiles.peer : { ...room.profiles.peer, name: guestName || room.profiles.peer.name };
  const otherProfile = isOwner || isLegacyRoom ? room.profiles.peer : room.profiles.owner;
  const receiver = isOwner || isLegacyRoom ? "peer" : "owner";
  const theme = themes[room.theme];
  const actorId = user?.uid || clientIdRef.current;
  const myScore = room.gameScore?.[actorId] ?? 0;
  const otherId = isOwner ? room.peerUid : room.ownerUid;
  const otherScore = otherId ? room.gameScore?.[otherId] ?? 0 : 0;

  useEffect(() => {
    document.documentElement.style.setProperty("--theme-primary", theme.primary);
    document.documentElement.style.setProperty("--theme-secondary", theme.secondary);
    document.documentElement.style.setProperty("--theme-bg", theme.bg);
    setSelectedTheme(room.theme);
  }, [room.theme, setSelectedTheme, theme]);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(`guest-name:${roomId}`);
    const savedBio = localStorage.getItem(`guest-bio:${roomId}`);
    const savedPhoto = localStorage.getItem(`guest-photo:${roomId}`);
    setGuestName(saved || "");
    setGuestBio(savedBio || "");
    setGuestPhotoUrl(savedPhoto || "");
    clientIdRef.current = getClientId();
  }, [roomId]);

  useEffect(() => {
    if (!hasFirebaseConfig || !db) {
      setRoom(readLocalRoom(roomId));
      setMessages(readLocalMessages(roomId));
      setIsReady(true);
      return;
    }

    if (!authReady) return;
    if (!user) {
      setIsReady(true);
      return;
    }

    const roomRef = doc(db, "rooms", roomId);
    getDoc(roomRef).catch((error) => setAuthError(error instanceof Error ? error.message : "Could not open this room."));

    const unsubRoom = onSnapshot(
      roomRef,
      (snap) => {
        if (snap.exists()) setRoom(snap.data() as SharedRoom);
        setIsReady(true);
      },
      (error) => {
        setAuthError(error.message);
        setIsReady(true);
      }
    );

    const messagesRef = collection(db, "rooms", roomId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(30));
    const unsubMessages = onSnapshot(
      q,
      (snap) => {
        setOlderCursor(snap.docs.length === 30 ? snap.docs.at(-1) ?? null : null);
        const latest = snap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              roomId,
              sender: data.sender,
              senderId: data.senderId,
              ownerUid: data.ownerUid,
              edited: data.edited,
              kind: data.kind,
              text: data.text,
              mediaUrl: data.mediaUrl,
              createdAt: data.createdAt?.toMillis?.() ?? Date.now()
            } as LoveMessage;
          })
          .reverse();
        setMessages((current) => mergeMessages(current.filter((item) => !latest.some((next) => next.id === item.id)), latest));
      },
      (error) => setAuthError(error.message)
    );

    const unsubParticipants = onSnapshot(
      collection(db, "rooms", roomId, "participants"),
      (snap) => {
        setParticipants(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Participant));
      },
      (error) => setAuthError(error.message)
    );

    return () => {
      unsubRoom();
      unsubMessages();
      unsubParticipants();
    };
  }, [authReady, roomId, user]);

  useEffect(() => {
    if (!db || !user) {
      setChatRooms([]);
      return;
    }
    return onSnapshot(query(collection(db, "rooms"), where("participantUids", "array-contains", user.uid)), (snap) => {
      setChatRooms(
        snap.docs
          .map((item) => ({ id: item.id, ...item.data() }) as SharedRoom)
          .filter((item) => !item.deleted)
          .sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? 0) - (a.lastMessageAt ?? a.createdAt ?? 0))
      );
    });
  }, [user]);

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => undefined);
  }, [cameraOpen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!db || !user || !isMember || !isReady) return;
    setDoc(
      doc(db, "rooms", roomId, "participants", user.uid),
      {
        id: user.uid,
        uid: user.uid,
        name: currentProfile.name || user.displayName || "Member",
        username: currentProfile.role?.replace("@", "") || "",
        role: currentProfile.role || "Member",
        bio: currentProfile.bio || "",
        photoUrl: currentProfile.photoUrl || user.photoURL || "",
        joinedAt: Date.now(),
        lastActiveAt: Date.now()
      },
      { merge: true }
    );
  }, [currentProfile, isMember, isReady, roomId, user]);

  useEffect(() => {
    if (selectedUser || participants.length === 0) return;
    const firstChoice = participants.find((item) => item.id === otherId) || participants.find((item) => item.id !== actorId) || participants[0];
    setSelectedUser(firstChoice);
  }, [actorId, otherId, participants, selectedUser]);

  async function saveRoom(nextRoom: SharedRoom) {
    setRoom(nextRoom);
    if (hasFirebaseConfig && db) {
      await setDoc(doc(db, "rooms", roomId), { ...nextRoom, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      writeLocalRoom(nextRoom);
    }
  }

  async function sendMessage(input: Omit<LoveMessage, "id" | "roomId" | "sender" | "createdAt">) {
    if (!currentProfile.name.trim()) return;
    const message: LoveMessage = {
      id: crypto.randomUUID(),
      roomId,
      sender: currentProfile.name,
      senderId: actorId,
      ownerUid: user?.uid ?? "",
      createdAt: Date.now(),
      ...input
    };

    if (hasFirebaseConfig && db) {
      await addDoc(collection(db, "rooms", roomId, "messages"), {
        sender: message.sender,
        senderId: actorId,
        ownerUid: user?.uid ?? "",
        kind: message.kind,
        text: message.text,
        mediaUrl: message.mediaUrl ?? "",
        createdAt: serverTimestamp()
      });
      await setDoc(
        doc(db, "rooms", roomId),
        {
          lastMessage: input.kind === "photo" || input.kind === "snap" ? "Shared a photo" : input.text.slice(0, 90),
          lastMessageAt: Date.now(),
          updatedAt: Date.now()
        },
        { merge: true }
      );
      playTone(input.kind === "text" ? "send" : "success");
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

  async function editMessage(message: LoveMessage, nextText: string) {
    if (!db || !nextText.trim()) return;
    await setDoc(
      doc(db, "rooms", roomId, "messages", message.id),
      { text: nextText.trim(), edited: true, updatedAt: serverTimestamp(), senderId: message.senderId ?? "", ownerUid: message.ownerUid ?? "" },
      { merge: true }
    );
  }

  async function deleteMessage(message: LoveMessage) {
    if (!db) return;
    await deleteDoc(doc(db, "rooms", roomId, "messages", message.id));
  }

  async function changeTheme(nextTheme: ThemeName) {
    await saveRoom({ ...room, theme: nextTheme });
    playTone("tap");
  }

  async function changeQuote() {
    const index = (loveQuotes.indexOf(room.quoteOfDay) + 1) % loveQuotes.length;
    await saveRoom({ ...room, quoteOfDay: loveQuotes[index] });
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    streamRef.current = stream;
    setCameraOpen(true);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function captureSnap() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    const size = fitSize(video.videoWidth || 720, video.videoHeight || 960, 380);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const mediaUrl = canvas.toDataURL("image/jpeg", 0.55);
    await sendMessage({ kind: "snap", text: "A fresh camera snap.", mediaUrl });
    stopCamera();
  }

  async function loadOlderMessages() {
    if (!db || !olderCursor) return;
    setLoadingOlder(true);
    try {
      const older = await getDocs(query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "desc"), startAfter(olderCursor), limit(30)));
      setOlderCursor(older.docs.length === 30 ? older.docs.at(-1) ?? null : null);
      const items = older.docs
        .map((item) => {
          const data = item.data();
          return {
            id: item.id,
            roomId,
            sender: data.sender,
            senderId: data.senderId,
            ownerUid: data.ownerUid,
            edited: data.edited,
            kind: data.kind,
            text: data.text,
            mediaUrl: data.mediaUrl,
            createdAt: data.createdAt?.toMillis?.() ?? Date.now()
          } as LoveMessage;
        })
        .reverse();
      setMessages((current) => mergeMessages(items, current));
    } finally {
      setLoadingOlder(false);
    }
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
        await saveParticipant({ locationText: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}. ${address}`, locationUpdatedAt: Date.now() });
        playTone("success");
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
    await saveParticipant({ deviceText: details, deviceUpdatedAt: Date.now() });
    playTone("success");
  }

  async function saveParticipant(extra: Partial<Participant> = {}) {
    if (!db || !actorId) return;
    await setDoc(
      doc(db, "rooms", roomId, "participants", actorId),
      {
        id: actorId,
        uid: user?.uid || "",
        name: user ? currentProfile.name : guestName || currentProfile.name || "Guest",
        role: user ? currentProfile.role : "Guest",
        bio: user ? currentProfile.bio : guestBio,
        photoUrl: user ? currentProfile.photoUrl : guestPhotoUrl,
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
        ...extra
      },
      { merge: true }
    );
  }

  async function login() {
    if (!auth) return;
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google login failed.");
    }
  }

  async function tapGame() {
    const nextScore = myScore + 1;
    await saveRoom({ ...room, gameScore: { ...(room.gameScore || {}), [actorId]: nextScore } });
    await sendMessage({ kind: "game", text: `${currentProfile.name} tapped the room game. Score ${nextScore}.` });
  }

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass rounded-lg px-6 py-5 text-sm font-semibold text-rosewood shadow-soft">Opening your private room...</div>
      </main>
    );
  }

  if (hasFirebaseConfig && authReady && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-lg p-5 text-center shadow-soft">
          <Heart className="mx-auto h-10 w-10 fill-[color:var(--theme-primary)] text-[color:var(--theme-primary)]" />
          <h1 className="mt-3 text-2xl font-black text-ink">Login to open this chat</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">HeartLink rooms are for two logged-in users after a request is accepted.</p>
          <button onClick={login} className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white">
            Continue with Google
          </button>
          {authError ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{authError}</p> : null}
        </div>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-lg p-5 text-center shadow-soft">
          <Heart className="mx-auto h-10 w-10 fill-[color:var(--theme-primary)] text-[color:var(--theme-primary)]" />
          <h1 className="mt-3 text-2xl font-black text-ink">You do not have access to this chat</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">Only the two connected users can open this room. Ask the other person to send or accept a request.</p>
          <p className="mt-3 rounded-md bg-white/75 p-3 text-xs font-bold text-ink/55">{authError}</p>
          {onBack ? (
            <button onClick={onBack} className="mt-4 w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white">
              Back to dashboard
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 lg:px-6">
      <section className="mx-auto grid max-w-7xl gap-3 lg:h-[calc(100vh-1.5rem)] lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside className="glass flex min-h-[18rem] flex-col rounded-lg p-3 shadow-soft lg:h-full">
          <div className="flex items-center justify-between gap-3 p-2">
            <div>
              <p className="text-sm font-black text-ink">Chats</p>
              <p className="text-xs text-ink/55">Your connected rooms</p>
            </div>
            {onBack ? (
              <button onClick={onBack} className="rounded-md border border-ink/10 bg-white px-3 py-2 text-xs font-bold text-ink">
                Home
              </button>
            ) : null}
          </div>
          {user ? (
              <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
                {chatRooms.map((item) => {
                  const profile = item.peerUid === user.uid ? item.profiles.owner : item.profiles.peer;
                  return (
                    <Link key={item.id} href={`/?room=${item.id}`} className={`flex items-center gap-3 rounded-md p-3 ${item.id === roomId ? "bg-ink text-white" : "bg-white/75 text-ink"}`}>
                      <Avatar name={profile.name} photoUrl={profile.photoUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{profile.name}</p>
                        <p className={`truncate text-xs ${item.id === roomId ? "text-white/60" : "text-ink/55"}`}>{item.lastMessage || "Open chat"}</p>
                      </div>
                    </Link>
                  );
                })}
                {chatRooms.length === 0 ? <p className="rounded-md bg-white/70 p-3 text-xs leading-5 text-ink/55">No connected chats yet.</p> : null}
              </div>
          ) : null}
        </aside>

        <section className="glass flex min-h-[76vh] min-w-0 flex-col overflow-hidden rounded-lg shadow-soft lg:h-full">
          <div className="shrink-0 border-b border-ink/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={otherProfile.name} photoUrl={otherProfile.photoUrl} />
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-ink">{otherProfile.name}</p>
                  <p className="truncate text-xs text-ink/55">{otherProfile.role || "Connected user"}</p>
                </div>
              </div>
              <button onClick={changeQuote} className="rounded-md border border-ink/15 bg-white px-3 py-2 text-xs font-bold text-ink">
                Prompt
              </button>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm font-bold leading-6 text-[color:var(--theme-primary)]">
              <Sparkles className="h-4 w-4 shrink-0" />
              {room.quoteOfDay}
            </p>
          </div>

          <div ref={listRef} className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {olderCursor ? (
              <div className="flex justify-center">
                <button onClick={loadOlderMessages} className="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-bold text-ink">
                  {loadingOlder ? "Loading..." : "Load older"}
                </button>
              </div>
            ) : null}
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[24rem] flex-col items-center justify-center text-center">
                <Gift className="h-12 w-12 text-[color:var(--theme-primary)]" />
                <h2 className="mt-3 text-2xl font-black text-ink">Start with a soft hello</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-ink/60">
                  Send a note, reaction, photo, snap, or caring check-in. The room will feel alive as both of you use it.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  mine={message.senderId === actorId}
                  canEdit={message.senderId === actorId}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                />
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-ink/10 p-3 sm:p-4">
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

        <aside className="space-y-3 overflow-y-auto">
          {/* WhatsApp-style user list */}
          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
              <Users className="h-4 w-4" />
              Room users
            </p>
            <div className="space-y-2">
              {participants.map((person) => (
                <button
                  key={person.id}
                  onClick={() => setSelectedUser(person)}
                  className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left ${selectedUser?.id === person.id ? "bg-ink/10" : "bg-white/75"}`}
                >
                  <Avatar name={person.name} photoUrl={person.photoUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">{person.name}</p>
                    <p className="truncate text-xs text-ink/55">{person.role || "Member"}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected user profile view */}
          {selectedUser && (
            <div className="glass rounded-lg p-4 shadow-soft">
              <div className="flex items-center gap-3 mb-2">
                <Avatar name={selectedUser.name} photoUrl={selectedUser.photoUrl} />
                <div>
                  <p className="text-lg font-black text-ink">{selectedUser.name}</p>
                  <p className="text-xs text-ink/55">{selectedUser.role || "Member"}</p>
                </div>
              </div>
              {selectedUser.bio && <p className="mb-2 text-xs text-ink/70">{selectedUser.bio}</p>}
              {selectedUser.locationText && <p className="mb-1 text-xs text-ink/70">Location: {selectedUser.locationText}</p>}
              {selectedUser.deviceText && <p className="mb-1 text-xs text-ink/70 break-words">Device: {selectedUser.deviceText}</p>}
              <button onClick={() => setSelectedUser(null)} className="mt-2 rounded-md border border-ink/10 px-3 py-2 text-xs font-bold text-ink">Close</button>
            </div>
          )}

          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
              <Gift className="h-4 w-4" />
              Gifts
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
              Photos and shares
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
              <button onClick={shareLocation} className="flex items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-3 text-sm font-bold text-ink">
                <LocateFixed className="h-4 w-4" />
                Share my location
              </button>
              <button onClick={shareDevice} className="flex items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-3 text-sm font-bold text-ink">
                <MonitorSmartphone className="h-4 w-4" />
                Share device details
              </button>
            </div>
          </div>

          <div className="glass rounded-lg p-4 shadow-soft">
            <p className="mb-3 text-sm font-black text-ink">Mini game</p>
            <div className="mb-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-white/75 p-2">
                <p className="text-lg font-black text-ink">{myScore}</p>
                <p className="text-[11px] font-bold text-ink/50">You</p>
              </div>
              <div className="rounded-md bg-white/75 p-2">
                <p className="text-lg font-black text-ink">{otherScore}</p>
                <p className="text-[11px] font-bold text-ink/50">Other</p>
              </div>
            </div>
            <button
              onClick={tapGame}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[color:var(--theme-primary)] px-3 py-3 text-sm font-bold text-white"
            >
              <Heart className="h-4 w-4 fill-white" />
              Tap heart
            </button>
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

function mergeMessages(left: LoveMessage[], right: LoveMessage[]) {
  return Array.from(new Map([...left, ...right].map((message) => [message.id, message])).values()).sort((a, b) => a.createdAt - b.createdAt);
}

function getClientId() {
  const key = "love-room-client-id";
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Could not load image"));
      image.onload = () => {
        const size = fitSize(image.width, image.height, 420);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.getContext("2d")?.drawImage(image, 0, 0, size.width, size.height);
        resolve(canvas.toDataURL("image/jpeg", 0.55));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (photoUrl) {
    return <Image src={photoUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-full border border-white/70 object-cover" />;
  }
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{initials(name)}</div>;
}

function MessageBubble({
  message,
  mine,
  canEdit,
  onEdit,
  onDelete
}: {
  message: LoveMessage;
  mine: boolean;
  canEdit: boolean;
  onEdit: (message: LoveMessage, nextText: string) => void;
  onDelete: (message: LoveMessage) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);

  async function saveEdit() {
    await onEdit(message, draft);
    setEditing(false);
  }

  return (
    <article className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-lg px-4 py-3 shadow-sm ${mine ? "bg-[color:var(--theme-primary)] text-white" : "bg-white text-ink"}`}>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold opacity-80">
          {message.kind === "location" ? <MapPin className="h-3 w-3" /> : null}
          <span>{message.sender}</span>
          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {message.edited ? <span>edited</span> : null}
        </div>
        {message.mediaUrl ? (
          <Image src={message.mediaUrl} alt="" width={720} height={960} unoptimized className="mb-2 max-h-80 w-full rounded-md object-cover" />
        ) : null}
        {editing ? (
          <div className="space-y-2">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-20 w-full resize-none rounded-md px-3 py-2 text-sm text-ink" />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="rounded-md bg-white/30 px-3 py-2 text-xs font-bold">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
        )}
        {canEdit && !editing ? (
          <div className="mt-2 flex gap-2">
            <button onClick={() => setEditing(true)} className="rounded-md bg-white/20 p-2" aria-label="Edit message">
              <Edit3 className="h-3 w-3" />
            </button>
            <button onClick={() => onDelete(message)} className="rounded-md bg-white/20 p-2" aria-label="Delete message">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
