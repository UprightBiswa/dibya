"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { Copy, Heart, ImageIcon, Inbox, Link2, LogOut, MessageCircle, Palette, Plus, Search, ShieldCheck, Sparkles, Trash2, UserPlus } from "lucide-react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import { defaultRoom } from "@/lib/room-data";
import type { AppUser, ChatInvite, SharedRoom } from "@/lib/types";
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
  const [partnerName, setPartnerName] = useState("");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [findUsername, setFindUsername] = useState("");
  const [foundUser, setFoundUser] = useState<AppUser | null>(null);
  const [invites, setInvites] = useState<ChatInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser || !db) return;
      const fallbackUsername = slugify(nextUser.displayName || nextUser.email?.split("@")[0] || "user");
      const userProfile: AppUser = {
        uid: nextUser.uid,
        email: nextUser.email || "",
        displayName: nextUser.displayName || fallbackUsername,
        username: fallbackUsername,
        usernameLower: fallbackUsername.toLowerCase(),
        name: nextUser.displayName || fallbackUsername,
        role: "Member",
        bio: "",
        photoUrl: nextUser.photoURL || "",
        createdAt: Date.now()
      };
      await setDoc(doc(db, "users", nextUser.uid), userProfile, { merge: true });
    });
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setRooms([]);
      setProfile(null);
      return;
    }
    const q = query(collection(db, "rooms"), where("participantUids", "array-contains", user.uid));
    const unsubRooms = onSnapshot(q, (snap) => {
      setRooms(
        snap.docs
          .map((item) => ({ id: item.id, ...item.data() }) as SharedRoom)
          .filter((room) => !room.deleted)
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      );
    });
    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data() as AppUser | undefined;
      if (!data) return;
      setProfile(data);
      setUsername(data.username || "");
      setBio(data.bio || "");
      setPhotoUrl(data.photoUrl || "");
    });
    const unsubInvites = onSnapshot(query(collection(db, "invites"), where("toUid", "==", user.uid), where("status", "==", "pending")), (snap) => {
      setInvites(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ChatInvite));
    });
    return () => {
      unsubRooms();
      unsubProfile();
      unsubInvites();
    };
  }, [user]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const invitePreview = useMemo(() => {
    if (!partnerName.trim()) return `${origin}/?room=friend-name`;
    return `${origin}/?room=${slugify(`${partnerName}-${user?.displayName ?? "me"}`)}`;
  }, [origin, partnerName, user]);
  const filteredRooms = rooms.filter((room) => `${room.partnerName ?? ""} ${room.profiles.peer.name}`.toLowerCase().includes(search.toLowerCase()));

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
        peerUid: "",
        participantUids: [user.uid],
        partnerName,
        createdAt: Date.now(),
        updatedAt: serverTimestamp(),
        profiles: {
          owner: {
            ...defaultRoom.profiles.owner,
            name: profile?.name || user.displayName || "You"
          },
          peer: {
            ...defaultRoom.profiles.peer,
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
    const batch = writeBatch(db);
    const messages = await getDocs(collection(db, "rooms", roomIdToDelete, "messages"));
    const participants = await getDocs(collection(db, "rooms", roomIdToDelete, "participants"));
    messages.docs.forEach((item) => batch.delete(item.ref));
    participants.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    await deleteDoc(doc(db, "rooms", roomIdToDelete));
  }

  async function copyInvite(id: string) {
    await navigator.clipboard.writeText(`${origin}/?room=${id}`);
  }

  async function saveProfile() {
    if (!db || !user) return;
    const cleanUsername = slugify(username);
    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || cleanUsername,
        name: profile?.name || user.displayName || cleanUsername,
        role: profile?.role || "Member",
        username: cleanUsername,
        usernameLower: cleanUsername.toLowerCase(),
        bio,
        photoUrl,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  async function findUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !findUsername.trim()) return;
    const snap = await getDocs(query(collection(db, "users"), where("usernameLower", "==", slugify(findUsername).toLowerCase())));
    const match = snap.docs.map((item) => item.data() as AppUser).find((item) => item.uid !== user?.uid) ?? null;
    setFoundUser(match);
  }

  async function sendAccountInvite() {
    if (!db || !user || !profile || !foundUser) return;
    const id = `${user.uid}_${foundUser.uid}`;
    await setDoc(doc(db, "invites", id), {
      id,
      fromUid: user.uid,
      fromName: profile.name || profile.username,
      toUid: foundUser.uid,
      toName: foundUser.name || foundUser.username,
      status: "pending",
      createdAt: Date.now()
    });
  }

  async function acceptInvite(invite: ChatInvite) {
    if (!db || !user || !profile) return;
    const id = [invite.fromUid, invite.toUid].sort().join("_");
    await setDoc(doc(db, "rooms", id), {
      ...defaultRoom,
      id,
      ownerUid: invite.fromUid,
      peerUid: invite.toUid,
      participantUids: [invite.fromUid, invite.toUid],
      partnerName: invite.fromName,
      createdAt: Date.now(),
      updatedAt: serverTimestamp(),
      profiles: {
        owner: { ...defaultRoom.profiles.owner, name: invite.fromName },
        peer: { ...defaultRoom.profiles.peer, name: profile.name || invite.toName }
      }
    });
    await updateDoc(doc(db, "invites", invite.id), { status: "accepted", roomId: id, acceptedAt: serverTimestamp() });
    router.push(`/?room=${id}`);
  }

  if (roomId) {
    return <LoveRoom roomId={roomId} onBack={() => (window.location.href = "/")} />;
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-lg bg-ink text-white shadow-soft">
          <div className="grid min-h-[34rem] gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_330px]">
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/80">
                  <Sparkles className="h-4 w-4 text-honey" />
                  Private rooms, shared moments
                </div>
                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">A warm chat space for any person you care about.</h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
                  Create a private room, share one link, and keep messages, snaps, gifts, themes, profile notes, and playful heart taps in one calm place.
                </p>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-4">
                {[
                  { icon: MessageCircle, label: "Realtime chat" },
                  { icon: ImageIcon, label: "Photo snaps" },
                  { icon: Palette, label: "Themes" },
                  { icon: ShieldCheck, label: "Owner history" }
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/8 p-3">
                    <item.icon className="h-5 w-5 text-honey" />
                    <p className="mt-3 text-xs font-bold text-white/80">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 text-ink">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black">New private room</p>
                <Heart className="h-5 w-5 fill-[color:var(--theme-primary)] text-[color:var(--theme-primary)]" />
              </div>

              {!hasFirebaseConfig ? (
                <p className="mt-4 rounded-md bg-honey/50 p-3 text-sm font-bold text-ink">Firebase config is missing, so login and history are disabled.</p>
              ) : null}

              {user ? (
                <form onSubmit={createRoom} className="mt-5 space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink/50">Person name</label>
                  <input
                    value={partnerName}
                    onChange={(event) => setPartnerName(event.target.value)}
                    placeholder="Type a name"
                    className="w-full rounded-md border border-ink/10 bg-petal px-4 py-3 text-sm font-bold outline-none focus:border-[color:var(--theme-primary)]"
                    required
                  />
                  <div className="rounded-md border border-dashed border-ink/15 bg-white p-3">
                    <p className="flex items-center gap-2 text-xs font-bold text-ink/50">
                      <Link2 className="h-3 w-3" />
                      Invite preview
                    </p>
                    <p className="mt-2 break-all text-xs font-bold leading-5 text-ink">{invitePreview}</p>
                  </div>
                  <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
                    <Plus className="h-4 w-4" />
                    {busy ? "Creating..." : "Create room"}
                  </button>
                </form>
              ) : (
                <>
                  <button onClick={login} className="mt-5 w-full rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
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
          </div>
        </div>

        <aside className="glass rounded-lg p-5 shadow-soft">
          {user ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-ink">{profile?.name || user.displayName || "Main user"}</p>
                  <p className="text-xs text-ink/55">@{profile?.username || "set-username"} · {user.email}</p>
                </div>
                <button onClick={() => auth && signOut(auth)} className="rounded-md border border-ink/10 p-2 text-ink" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-ink/10 bg-white/75 p-3">
                  <p className="mb-3 text-sm font-black text-ink">My profile</p>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="unique username"
                    className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2 text-sm font-bold"
                  />
                  <textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="bio"
                    className="mb-2 min-h-16 w-full resize-none rounded-md border border-ink/10 px-3 py-2 text-sm"
                  />
                  <input
                    value={photoUrl}
                    onChange={(event) => setPhotoUrl(event.target.value)}
                    placeholder="photo url"
                    className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2 text-sm"
                  />
                  <button onClick={saveProfile} className="w-full rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
                    Save profile
                  </button>
                </div>

                <div className="rounded-lg border border-ink/10 bg-white/75 p-3">
                  <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
                    <UserPlus className="h-4 w-4" />
                    Find user
                  </p>
                  <form onSubmit={findUser} className="flex gap-2">
                    <input
                      value={findUsername}
                      onChange={(event) => setFindUsername(event.target.value)}
                      placeholder="username"
                      className="min-w-0 flex-1 rounded-md border border-ink/10 px-3 py-2 text-sm font-bold"
                    />
                    <button className="rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">Find</button>
                  </form>
                  {foundUser ? (
                    <div className="mt-3 rounded-md bg-petal p-3">
                      <p className="text-sm font-black">{foundUser.name || foundUser.username}</p>
                      <p className="text-xs text-ink/55">@{foundUser.username}</p>
                      {foundUser.bio ? <p className="mt-2 text-xs leading-5 text-ink/65">{foundUser.bio}</p> : null}
                      <button onClick={sendAccountInvite} className="mt-3 w-full rounded-md bg-[color:var(--theme-primary)] px-3 py-2 text-xs font-bold text-white">
                        Send invite
                      </button>
                    </div>
                  ) : null}
                </div>

                {invites.length ? (
                  <div className="rounded-lg border border-ink/10 bg-white/75 p-3">
                    <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
                      <Inbox className="h-4 w-4" />
                      Invites
                    </p>
                    <div className="space-y-2">
                      {invites.map((invite) => (
                        <div key={invite.id} className="rounded-md bg-petal p-3">
                          <p className="text-xs font-bold text-ink/60">{invite.fromName} wants to chat with you.</p>
                          <button onClick={() => acceptInvite(invite)} className="mt-2 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
                            Accept
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2">
                  <Search className="h-4 w-4 text-ink/45" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search rooms"
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                  />
                </div>
                {rooms.length === 0 ? <p className="text-sm text-ink/60">No rooms yet. Create the first one.</p> : null}
                {filteredRooms.map((room) => (
                  <div key={room.id} className="rounded-lg border border-ink/10 bg-white/75 p-3">
                    <Link href={`/?room=${room.id}`} className="block font-black text-ink">
                      {room.partnerName || room.profiles.peer.name}
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
