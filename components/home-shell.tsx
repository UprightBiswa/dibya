"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { Check, Copy, HeartHandshake, Inbox, LogOut, MessageCircle, Search, ShieldCheck, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [findUsername, setFindUsername] = useState("");
  const [foundUser, setFoundUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<ChatInvite[]>([]);
  const [activeTab, setActiveTab] = useState<"chats" | "users" | "requests" | "profile">("chats");
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

    const unsubRooms = onSnapshot(query(collection(db, "rooms"), where("participantUids", "array-contains", user.uid)), (snap) => {
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
      setName(data.name || data.displayName || "");
      setUsername(data.username || "");
      setBio(data.bio || "");
      setPhotoUrl(data.photoUrl || "");
    });

    const unsubInvites = onSnapshot(query(collection(db, "invites"), where("toUid", "==", user.uid), where("status", "==", "pending")), (snap) => {
      setInvites(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ChatInvite));
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setAllUsers(snap.docs.map((item) => item.data() as AppUser).filter((item) => item.uid !== user.uid));
    });

    return () => {
      unsubRooms();
      unsubProfile();
      unsubInvites();
      unsubUsers();
    };
  }, [user]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const filteredRooms = rooms.filter((room) => roomTitle(room, user?.uid).toLowerCase().includes(search.toLowerCase()));

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
        name: name.trim() || user.displayName || cleanUsername,
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

  async function sendInviteTo(targetUser: AppUser) {
    if (!db || !user || !profile) return;
    const id = `${user.uid}_${targetUser.uid}`;
    await setDoc(doc(db, "invites", id), {
      id,
      fromUid: user.uid,
      fromName: profile.name || profile.username,
      toUid: targetUser.uid,
      toName: targetUser.name || targetUser.username,
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

  async function declineInvite(invite: ChatInvite) {
    if (!db) return;
    await updateDoc(doc(db, "invites", invite.id), { status: "declined", declinedAt: serverTimestamp() });
  }

  if (roomId) {
    return <LoveRoom roomId={roomId} onBack={() => (window.location.href = "/")} />;
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-lg bg-ink text-white shadow-soft">
          <div className="grid min-h-[38rem] gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/80">
                  <Sparkles className="h-4 w-4 text-honey" />
                  HeartLink social rooms
                </div>
                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
                  Private social chat for people you actually care about.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
                  Create your profile, discover users, send a chat request, accept or deny invites, and open a shared room with realtime messages, photos, reactions, room themes, and playful taps.
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-4">
                {[
                  { icon: Users, label: "Profiles" },
                  { icon: UserPlus, label: "Requests" },
                  { icon: MessageCircle, label: "Chats" },
                  { icon: HeartHandshake, label: "Games" }
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/8 p-3">
                    <item.icon className="h-5 w-5 text-honey" />
                    <p className="mt-3 text-xs font-bold text-white/80">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 text-ink">
              <p className="text-sm font-black">How it works</p>
              <div className="mt-4 space-y-3">
                {["Login with Google", "Set your public username", "Send or accept a request", "Start chatting in a shared room"].map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-md bg-petal p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-black text-white">{index + 1}</span>
                    <p className="pt-1 text-sm font-bold leading-5">{item}</p>
                  </div>
                ))}
              </div>

              {!hasFirebaseConfig ? (
                <p className="mt-4 rounded-md bg-honey/50 p-3 text-sm font-bold text-ink">Firebase config is missing, so login and history are disabled.</p>
              ) : null}

              {!user ? (
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
              ) : (
                <div className="mt-5 rounded-md border border-ink/10 p-3">
                  <p className="text-xs font-bold text-ink/55">Signed in as</p>
                  <p className="mt-1 truncate text-sm font-black">{profile?.name || user.displayName || user.email}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="glass rounded-lg p-5 shadow-soft">
          {user ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-ink">{profile?.name || user.displayName || "Member"}</p>
                  <p className="truncate text-xs text-ink/55">@{profile?.username || "set-username"} - {user.email}</p>
                </div>
                <button onClick={() => auth && signOut(auth)} className="rounded-md border border-ink/10 p-2 text-ink" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-1 rounded-lg bg-white/70 p-1">
                {[
                  { id: "chats", label: "Chats", icon: MessageCircle },
                  { id: "users", label: "Users", icon: Users },
                  { id: "requests", label: "Req", icon: Inbox },
                  { id: "profile", label: "Me", icon: ShieldCheck }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-black ${
                      activeTab === tab.id ? "bg-ink text-white" : "text-ink/60"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 max-h-[calc(100vh-9rem)] space-y-3 overflow-y-auto pr-1">
                {activeTab === "chats" ? (
                  <>
                    <div className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2">
                      <Search className="h-4 w-4 text-ink/45" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search chats"
                        className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                      />
                    </div>
                    {rooms.length === 0 ? (
                      <EmptyState title="No chats yet" text="Open Users, send a request, or accept a request when someone invites you." />
                    ) : null}
                    {filteredRooms.map((room) => (
                      <div key={room.id} className="rounded-lg border border-ink/10 bg-white/75 p-3">
                        <Link href={`/?room=${room.id}`} className="block font-black text-ink">
                          {roomTitle(room, user.uid)}
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
                  </>
                ) : null}

                {activeTab === "users" ? (
                  <div className="rounded-lg border border-ink/10 bg-white/75 p-3">
                    <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
                      <UserPlus className="h-4 w-4" />
                      Find people
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
                    {foundUser ? <UserRow user={foundUser} action="Send invite" onAction={() => sendInviteTo(foundUser)} /> : null}
                    <div className="mt-3 space-y-2">
                      {allUsers.length === 0 ? <EmptyState title="No users yet" text="Ask another person to login once. Their profile will appear here." /> : null}
                      {allUsers.map((item) => (
                        <UserRow key={item.uid} user={item} action="Send request" onAction={() => sendInviteTo(item)} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeTab === "requests" ? (
                  <div className="rounded-lg border border-ink/10 bg-white/75 p-3">
                    <p className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
                      <Inbox className="h-4 w-4" />
                      Requests
                    </p>
                    {invites.length === 0 ? <EmptyState title="No pending requests" text="When someone sends you an invite, accept or deny it here." /> : null}
                    <div className="space-y-2">
                      {invites.map((invite) => (
                        <div key={invite.id} className="rounded-md bg-petal p-3">
                          <p className="text-xs font-bold text-ink/60">{invite.fromName} wants to start a chat with you.</p>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button onClick={() => acceptInvite(invite)} className="flex items-center justify-center gap-1 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
                              <Check className="h-3 w-3" />
                              Accept
                            </button>
                            <button onClick={() => declineInvite(invite)} className="flex items-center justify-center gap-1 rounded-md border border-ink/10 px-3 py-2 text-xs font-bold text-ink">
                              <X className="h-3 w-3" />
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeTab === "profile" ? (
                  <div className="rounded-lg border border-ink/10 bg-white/75 p-3">
                    <p className="mb-3 text-sm font-black text-ink">My profile</p>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="display name"
                      className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2 text-sm font-bold"
                    />
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
                      className="mb-2 min-h-20 w-full resize-none rounded-md border border-ink/10 px-3 py-2 text-sm"
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
                ) : null}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-black text-ink">Welcome to HeartLink</p>
              <p className="text-sm leading-6 text-ink/65">
                This is a small private social app. Login to create your profile, see users, manage requests, and keep your chat history.
              </p>
              <button onClick={login} className="w-full rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
                Continue with Google
              </button>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function roomTitle(room: SharedRoom, uid?: string) {
  if (uid && room.ownerUid === uid) return room.profiles.peer.name || room.partnerName || "Chat";
  if (uid && room.peerUid === uid) return room.profiles.owner.name || room.partnerName || "Chat";
  return room.partnerName || room.profiles.peer.name || "Chat";
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink/15 bg-white/60 p-4 text-center">
      <p className="text-sm font-black text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink/55">{text}</p>
    </div>
  );
}

function UserRow({ user, action, onAction }: { user: AppUser; action: string; onAction: () => void }) {
  return (
    <div className="mt-3 rounded-md bg-petal p-3">
      <p className="text-sm font-black">{user.name || user.username}</p>
      <p className="text-xs text-ink/55">@{user.username}</p>
      {user.bio ? <p className="mt-1 text-xs leading-5 text-ink/65">{user.bio}</p> : null}
      <button onClick={onAction} className="mt-2 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
        {action}
      </button>
    </div>
  );
}
