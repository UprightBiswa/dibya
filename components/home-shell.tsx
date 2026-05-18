"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { Copy, Heart, LogOut, Plus, Trash2 } from "lucide-react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import { defaultRoom } from "@/lib/room-data";
import type { SharedRoom } from "@/lib/types";
import { LoveRoom } from "./love-room";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || crypto.randomUUID().slice(0, 8)
  );
}

export function HomeShell() {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get("room");
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<SharedRoom[]>([]);
  const [partnerName, setPartnerName] = useState("Dibya");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setRooms([]);
      return;
    }
    const q = query(collection(db, "rooms"), where("ownerUid", "==", user.uid));
    return onSnapshot(q, (snap) => {
      setRooms(
        snap.docs
          .map((item) => ({ id: item.id, ...item.data() }) as SharedRoom)
          .filter((room) => !room.deleted)
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      );
    });
  }, [user]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const invitePreview = useMemo(() => `${origin}/?room=${slugify(`${partnerName}-${user?.displayName ?? "me"}`)}`, [origin, partnerName, user]);

  async function login() {
    if (!auth) return;
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google login failed.";
      setAuthError(message);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user) return;
    setBusy(true);
    try {
      const id = `${slugify(partnerName)}-${crypto.randomUUID().slice(0, 6)}`;
      await setDoc(doc(db, "rooms", id), {
        ...defaultRoom,
        id,
        ownerUid: user.uid,
        ownerEmail: user.email,
        partnerName,
        createdAt: Date.now(),
        updatedAt: serverTimestamp(),
        profiles: {
          biswajit: {
            ...defaultRoom.profiles.biswajit,
            name: user.displayName || "Biswajit Das"
          },
          dibya: {
            ...defaultRoom.profiles.dibya,
            name: partnerName
          }
        }
      });
      setPartnerName("");
      router.push(`/?room=${id}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoom(roomIdToDelete: string) {
    if (!db) return;
    await updateDoc(doc(db, "rooms", roomIdToDelete), { deleted: true, deletedAt: serverTimestamp() });
  }

  async function copyInvite(id: string) {
    await navigator.clipboard.writeText(`${origin}/?room=${id}`);
  }

  if (roomId) {
    return <LoveRoom roomId={roomId} onBack={() => (window.location.href = "/")} />;
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_360px]">
        <div className="glass rounded-lg p-6 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--theme-secondary)]">Love Room</p>
              <h1 className="mt-2 max-w-2xl text-4xl font-black leading-tight text-ink">Private chat rooms for the people you care about.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
                Create a room, share one invite link, and keep your old message history. Guests can join without login.
              </p>
            </div>
            <Heart className="h-10 w-10 fill-[color:var(--theme-primary)] text-[color:var(--theme-primary)]" />
          </div>

          {!hasFirebaseConfig ? (
            <p className="mt-5 rounded-md bg-honey/50 p-3 text-sm font-bold text-ink">Firebase config is missing, so login and history are disabled.</p>
          ) : null}

          {user ? (
            <form onSubmit={createRoom} className="mt-6 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 sm:grid-cols-[1fr_auto]">
              <input
                value={partnerName}
                onChange={(event) => setPartnerName(event.target.value)}
                placeholder="Friend name, for example Dibya"
                className="min-w-0 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none"
                required
              />
              <button disabled={busy} className="flex items-center justify-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
                <Plus className="h-4 w-4" />
                {busy ? "Creating..." : "Create room"}
              </button>
              <p className="text-xs text-ink/55 sm:col-span-2">Invite will look like {invitePreview}</p>
            </form>
          ) : (
            <>
              <button onClick={login} className="mt-6 rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
                Continue with Google
              </button>
              {authError ? (
                <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
                  {authError.includes("unauthorized-domain")
                    ? "Google login is blocked because this domain is not authorized in Firebase Authentication settings."
                    : authError}
                </p>
              ) : null}
            </>
          )}
        </div>

        <aside className="glass rounded-lg p-5 shadow-soft">
          {user ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-ink">{user.displayName || "Main user"}</p>
                  <p className="text-xs text-ink/55">{user.email}</p>
                </div>
                <button onClick={() => auth && signOut(auth)} className="rounded-md border border-ink/10 p-2 text-ink" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {rooms.length === 0 ? <p className="text-sm text-ink/60">No rooms yet. Create the first one.</p> : null}
                {rooms.map((room) => (
                  <div key={room.id} className="rounded-lg border border-ink/10 bg-white/75 p-3">
                    <Link href={`/?room=${room.id}`} className="block font-black text-ink">
                      {room.partnerName || room.profiles.dibya.name}
                    </Link>
                    <p className="mt-1 truncate text-xs text-ink/50">{origin}/?room={room.id}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => copyInvite(room.id)} className="flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                      <button
                        onClick={() => deleteRoom(room.id)}
                        className="flex items-center justify-center gap-2 rounded-md border border-ink/10 px-3 py-2 text-xs font-bold text-ink"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-ink/65">Login is only for you, the room owner. People who receive an invite can join without login.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
