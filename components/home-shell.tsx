"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import {
  Bell,
  Check,
  HeartHandshake,
  Inbox,
  LogOut,
  MessageCircle,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import { defaultRoom } from "@/lib/room-data";
import { useAppStore } from "@/lib/app-store";
import type { AppUser, ChatInvite, SharedRoom } from "@/lib/types";
import { LoveRoom } from "./love-room";

type TabId = "chats" | "users" | "requests" | "profile";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || crypto.randomUUID().slice(0, 8)
  );
}

function pairId(a: string, b: string) {
  return [a, b].sort().join("_");
}

export function HomeShell() {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get("room");
  const inviteId = params.get("invite");
  const [selectedRoomId, setSelectedRoomId] = useState(roomId || "");
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
  const [selectedProfile, setSelectedProfile] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<ChatInvite[]>([]);
  const [sentInvites, setSentInvites] = useState<ChatInvite[]>([]);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const { activeTab, setActiveTab, soundEnabled, toggleSound, playTone } = useAppStore();

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser || !db) return;
      const fallbackUsername = slugify(nextUser.displayName || nextUser.email?.split("@")[0] || "user");
      await setDoc(
        doc(db, "users", nextUser.uid),
        {
          uid: nextUser.uid,
          email: nextUser.email || "",
          displayName: nextUser.displayName || fallbackUsername,
          username: fallbackUsername,
          usernameLower: fallbackUsername.toLowerCase(),
          name: nextUser.displayName || fallbackUsername,
          role: "Member",
          bio: "",
          photoUrl: nextUser.photoURL || "",
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        } satisfies AppUser,
        { merge: true }
      );
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
          .sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? 0) - (a.lastMessageAt ?? a.createdAt ?? 0))
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

    const unsubInvites = onSnapshot(query(collection(db, "invites"), where("toUid", "==", user.uid)), (snap) => {
      const next = snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ChatInvite).filter((item) => item.status === "pending");
      if (next.length > invites.length) playTone("success");
      setInvites(next);
    });

    const unsubSentInvites = onSnapshot(query(collection(db, "invites"), where("fromUid", "==", user.uid)), (snap) => {
      setSentInvites(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ChatInvite));
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setAllUsers(snap.docs.map((item) => item.data() as AppUser).filter((item) => item.uid !== user.uid));
    });

    return () => {
      unsubRooms();
      unsubProfile();
      unsubInvites();
      unsubSentInvites();
      unsubUsers();
    };
  }, [invites.length, playTone, user]);

  useEffect(() => {
    if (!db || !user || !profile || !inviteId) return;
    getDoc(doc(db, "invites", inviteId)).then(async (snap) => {
      if (!snap.exists()) return;
      const invite = { id: snap.id, ...snap.data() } as ChatInvite;
      if (invite.status === "accepted" && invite.roomId) {
        router.replace(`/?room=${invite.roomId}`);
        return;
      }
      if (invite.status === "pending" && invite.toUid === user.uid) {
        await acceptInvite(invite);
      }
    });
  }, [inviteId, profile, router, user]);

  useEffect(() => {
    if (roomId) setSelectedRoomId(roomId);
  }, [roomId]);

  const appUrl = typeof window === "undefined" ? "" : window.location.origin;
  const filteredRooms = rooms.filter((room) => roomTitle(room, user?.uid).toLowerCase().includes(search.toLowerCase()));
  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase();
    return allUsers.filter((item) => `${item.name} ${item.username} ${item.bio}`.toLowerCase().includes(term));
  }, [allUsers, search]);

  async function login() {
    if (!auth) return;
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      playTone("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google login failed.";
      setAuthError(message);
    }
  }

  async function shareApp() {
    const shareText = "Join me on HeartLink. Login, set your username, and send me a chat request.";
    if (navigator.share) {
      await navigator.share({ title: "HeartLink", text: shareText, url: appUrl });
    } else {
      await navigator.clipboard.writeText(`${shareText} ${appUrl}`);
      setNotice("App link copied.");
    }
    playTone("success");
  }

  async function shareRequest(targetUser: AppUser, existingInvite?: ChatInvite) {
    if (!db || !user || !profile) return;
    const id = pairId(user.uid, targetUser.uid);
    if (!existingInvite) {
      await sendInviteTo(targetUser);
    }
    const requestUrl = `${appUrl}/?invite=${id}`;
    const shareText = `${profile.name || profile.username} sent you a HeartLink request. Open this link to accept and start chatting.`;
    if (navigator.share) {
      await navigator.share({ title: "HeartLink request", text: shareText, url: requestUrl });
    } else {
      await navigator.clipboard.writeText(`${shareText} ${requestUrl}`);
      setNotice("Request accept link copied.");
    }
    playTone("success");
  }

  async function deleteRoom(roomIdToDelete: string) {
    if (!db) return;
    await setDoc(doc(db, "rooms", roomIdToDelete), { deleted: true, closedAt: Date.now(), lastMessage: "Connection closed." }, { merge: true });
    playTone("tap");
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
        updatedAt: serverTimestamp(),
        lastActiveAt: Date.now()
      },
      { merge: true }
    );
    setNotice("Profile saved.");
    playTone("success");
  }

  async function findUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !findUsername.trim()) return;
    const snap = await getDocs(query(collection(db, "users"), where("usernameLower", "==", slugify(findUsername).toLowerCase())));
    const match = snap.docs.map((item) => item.data() as AppUser).find((item) => item.uid !== user?.uid) ?? null;
    setFoundUser(match);
    if (!match) setNotice("No user found with that username.");
  }

  async function sendInviteTo(targetUser: AppUser) {
    if (!db || !user || !profile) return;
    const roomIdForPair = pairId(user.uid, targetUser.uid);
    if (rooms.some((room) => room.id === roomIdForPair)) {
      setSelectedRoomId(roomIdForPair);
      setActiveTab("chats");
      router.replace("/");
      return;
    }
    const id = roomIdForPair;
    await setDoc(doc(db, "invites", id), {
      id,
      fromUid: user.uid,
      fromName: profile.name || profile.username,
      fromUsername: profile.username,
      fromPhotoUrl: profile.photoUrl,
      toUid: targetUser.uid,
      toName: targetUser.name || targetUser.username,
      toUsername: targetUser.username,
      toPhotoUrl: targetUser.photoUrl,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    setNotice(`Request sent to ${targetUser.name || targetUser.username}.`);
    playTone("send");
  }

  async function acceptInvite(invite: ChatInvite) {
    if (!db || !user || !profile) return;
    const id = pairId(invite.fromUid, invite.toUid);
    await setDoc(doc(db, "rooms", id), {
      ...defaultRoom,
      id,
      ownerUid: invite.fromUid,
      peerUid: invite.toUid,
      participantUids: [invite.fromUid, invite.toUid],
      partnerName: invite.fromName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMessage: "Chat request accepted.",
      lastMessageAt: Date.now(),
      profiles: {
        owner: { name: invite.fromName, role: `@${invite.fromUsername || "user"}`, bio: "", photoUrl: invite.fromPhotoUrl || "" },
        peer: { name: profile.name || invite.toName, role: `@${profile.username || invite.toUsername || "user"}`, bio: profile.bio || "", photoUrl: profile.photoUrl || "" }
      }
    });
    await updateDoc(doc(db, "invites", invite.id), { status: "accepted", roomId: id, acceptedAt: serverTimestamp(), updatedAt: Date.now() });
    playTone("success");
    setSelectedRoomId(id);
    setActiveTab("chats");
    router.replace("/");
  }

  async function declineInvite(invite: ChatInvite) {
    if (!db) return;
    await updateDoc(doc(db, "invites", invite.id), { status: "declined", declinedAt: serverTimestamp(), updatedAt: Date.now() });
    playTone("tap");
  }

  if (!user) {
    return (
      <main className="min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
        <section className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-7xl content-center gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-lg bg-ink p-6 text-white shadow-soft sm:p-9">
            <div className="flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/80">
              <Sparkles className="h-4 w-4 text-honey" />
              HeartLink
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">A private social inbox for close connections.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/68">
              HeartLink works like a tiny social app: login, create your profile, discover people by username, send a request, and chat in a private 1:1 room with photos, camera snaps, themes, reactions, games, and consent-only sharing.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              {[
                { icon: Users, label: "Profiles" },
                { icon: Bell, label: "Requests" },
                { icon: MessageCircle, label: "Realtime chat" },
                { icon: HeartHandshake, label: "Shared games" }
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/8 p-3">
                  <item.icon className="h-5 w-5 text-honey" />
                  <p className="mt-3 text-xs font-bold text-white/80">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="glass rounded-lg p-5 shadow-soft">
            <p className="text-sm font-black text-ink">Onboard</p>
            <div className="mt-4 space-y-3">
              {["Sign in with Google", "Set name, username, bio, avatar", "Share the app or find users", "Accept requests and chat"].map((item, index) => (
                <div key={item} className="flex gap-3 rounded-md bg-white/70 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-black text-white">{index + 1}</span>
                  <p className="pt-1 text-sm font-bold leading-5 text-ink">{item}</p>
                </div>
              ))}
            </div>
            {!hasFirebaseConfig ? <p className="mt-4 rounded-md bg-honey/50 p-3 text-sm font-bold text-ink">Firebase config is missing.</p> : null}
            <button onClick={login} className="mt-5 w-full rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
              Continue with Google
            </button>
            <button onClick={shareApp} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-5 py-3 text-sm font-bold text-ink">
              <Share2 className="h-4 w-4" />
              Share app
            </button>
            {authError ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">{authError}</p> : null}
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 lg:px-6">
      <section className="mx-auto grid max-w-7xl gap-3 lg:h-[calc(100vh-1.5rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="glass flex min-h-[34rem] flex-col rounded-lg p-3 shadow-soft lg:h-full">
          <div className="flex items-center gap-3 p-2">
            <Avatar name={profile?.name || user.displayName || "Me"} photoUrl={profile?.photoUrl || user.photoURL || ""} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-ink">{profile?.name || user.displayName || "Member"}</p>
              <p className="truncate text-xs text-ink/55">@{profile?.username || "set-username"}</p>
            </div>
            <button onClick={toggleSound} className="rounded-md border border-ink/10 bg-white p-2 text-ink" aria-label="Toggle sound">
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button onClick={() => auth && signOut(auth)} className="rounded-md border border-ink/10 bg-white p-2 text-ink" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-white/70 p-1">
            {[
              { id: "chats", label: "Chats", icon: MessageCircle },
              { id: "users", label: "Users", icon: Users },
              { id: "requests", label: "Req", icon: Inbox, count: invites.length + sentInvites.filter((item) => item.status === "declined").length },
              { id: "profile", label: "Me", icon: ShieldCheck }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-black ${
                  activeTab === tab.id ? "bg-ink text-white" : "text-ink/60"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count ? <span className="absolute right-1 top-1 rounded-full bg-[color:var(--theme-primary)] px-1.5 text-[10px] text-white">{tab.count}</span> : null}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-ink/45" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
          </div>

          <div className="no-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {activeTab === "chats" ? (
              <>
                {rooms.length === 0 ? <EmptyState title="No chats yet" text="Find a user, send a request, or accept one from Requests." /> : null}
                {filteredRooms.map((room) => (
                  <ChatRow
                    key={room.id}
                    room={room}
                    uid={user.uid}
                    active={selectedRoomId === room.id}
                    onOpen={() => setSelectedRoomId(room.id)}
                    onDelete={() => deleteRoom(room.id)}
                  />
                ))}
              </>
            ) : null}

            {activeTab === "users" ? (
              <>
                <form onSubmit={findUser} className="flex gap-2 rounded-lg bg-white/70 p-2">
                  <input value={findUsername} onChange={(event) => setFindUsername(event.target.value)} placeholder="Find username" className="min-w-0 flex-1 rounded-md border border-ink/10 px-3 py-2 text-sm font-bold" />
                  <button className="rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">Find</button>
                </form>
                {foundUser ? (
                  <UserRow
                    user={foundUser}
                    status={relationStatus(foundUser.uid, rooms, sentInvites, invites, user.uid)}
                    onAction={() => sendInviteTo(foundUser)}
                    onShare={() => shareRequest(foundUser, sentInvites.find((invite) => invite.id === pairId(user.uid, foundUser.uid)))}
                    onOpen={() => setSelectedProfile(foundUser)}
                  />
                ) : null}
                {filteredUsers.length === 0 ? <EmptyState title="No users found" text="Share the app with someone. After they login, they show here." /> : null}
                {filteredUsers.map((item) => (
                  <UserRow
                    key={item.uid}
                    user={item}
                    status={relationStatus(item.uid, rooms, sentInvites, invites, user.uid)}
                    onAction={() => sendInviteTo(item)}
                    onShare={() => shareRequest(item, sentInvites.find((invite) => invite.id === pairId(user.uid, item.uid)))}
                    onOpen={() => setSelectedProfile(item)}
                  />
                ))}
              </>
            ) : null}

            {activeTab === "requests" ? (
              <>
                {invites.length === 0 ? <EmptyState title="No pending requests" text="New chat requests will appear here with accept and deny buttons." /> : null}
                {invites.map((invite) => (
                  <div key={invite.id} className="rounded-lg bg-white/75 p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={invite.fromName} photoUrl={invite.fromPhotoUrl || ""} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-ink">{invite.fromName}</p>
                        <p className="truncate text-xs text-ink/55">@{invite.fromUsername || "user"} sent a request</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
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
                {sentInvites.filter((invite) => invite.status === "declined").map((invite) => (
                  <div key={invite.id} className="rounded-lg bg-white/75 p-3">
                    <p className="text-sm font-black text-ink">{invite.toName} denied your request.</p>
                    <p className="mt-1 text-xs leading-5 text-ink/55">You can send a new request later.</p>
                    <button onClick={() => updateDoc(doc(db!, "invites", invite.id), { status: "pending", updatedAt: Date.now() })} className="mt-3 w-full rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">
                      Send again
                    </button>
                  </div>
                ))}
              </>
            ) : null}

            {activeTab === "profile" ? (
              <div className="rounded-lg bg-white/75 p-3">
                <p className="mb-3 text-sm font-black text-ink">Profile</p>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2 text-sm font-bold" />
                <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Unique username" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2 text-sm font-bold" />
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Bio" className="mb-2 min-h-20 w-full resize-none rounded-md border border-ink/10 px-3 py-2 text-sm" />
                <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} placeholder="Photo URL" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2 text-sm" />
                <button onClick={saveProfile} className="w-full rounded-md bg-ink px-3 py-2 text-xs font-bold text-white">Save profile</button>
                <button onClick={shareApp} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-xs font-bold text-ink">
                  <Share2 className="h-3 w-3" />
                  Share app
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        {selectedRoomId ? (
          <section className="min-h-[calc(100vh-1.5rem)] min-w-0">
            <LoveRoom key={selectedRoomId} roomId={selectedRoomId} embedded onBack={() => setSelectedRoomId("")} />
          </section>
        ) : (
        <section className="hidden overflow-hidden rounded-lg bg-ink text-white shadow-soft lg:block">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <div className="flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/75">
                <Sparkles className="h-4 w-4 text-honey" />
                Dashboard
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-black leading-tight">Chat list, people, requests, and profile in one calm place.</h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/65">
                Open a chat from the left. Requests create private rooms between two logged-in users. Photos, camera snaps, games, themes, and consent-only info sharing all update live.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Chats" value={rooms.length} />
              <Metric label="Users" value={allUsers.length} />
              <Metric label="Requests" value={invites.length} />
            </div>
          </div>
        </section>
        )}
      </section>

      {notice ? (
        <button onClick={() => setNotice("")} className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white shadow-soft">
          {notice}
        </button>
      ) : null}

      {selectedProfile ? <ProfileSheet user={selectedProfile} onClose={() => setSelectedProfile(null)} /> : null}
    </main>
  );
}

function roomTitle(room: SharedRoom, uid?: string) {
  if (uid && room.ownerUid === uid) return room.profiles.peer.name || room.partnerName || "Chat";
  if (uid && room.peerUid === uid) return room.profiles.owner.name || room.partnerName || "Chat";
  return room.partnerName || room.profiles.peer.name || "Chat";
}

function otherProfile(room: SharedRoom, uid?: string) {
  return uid && room.peerUid === uid ? room.profiles.owner : room.profiles.peer;
}

function relationStatus(targetUid: string, rooms: SharedRoom[], sent: ChatInvite[], incoming: ChatInvite[], currentUid: string) {
  if (rooms.some((room) => room.participantUids?.includes(targetUid))) return "connected";
  const id = pairId(currentUid, targetUid);
  const invite = sent.find((item) => item.id === id) || incoming.find((item) => item.id === id);
  if (!invite) return "none";
  if (invite.status === "pending") return invite.fromUid === currentUid ? "sent" : "incoming";
  return invite.status;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (photoUrl) {
    return <Image src={photoUrl} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-full border border-white/70 object-cover" />;
  }
  return <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{initials(name)}</div>;
}

function ChatRow({
  room,
  uid,
  active,
  onOpen,
  onDelete
}: {
  room: SharedRoom;
  uid: string;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const profile = otherProfile(room, uid);
  return (
    <div className={`group rounded-lg p-3 ${active ? "bg-ink text-white" : "bg-white/75"}`}>
      <div className="flex items-center gap-3">
        <Avatar name={profile.name} photoUrl={profile.photoUrl} />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-sm font-black ${active ? "text-white" : "text-ink"}`}>{roomTitle(room, uid)}</p>
          <p className={`truncate text-xs ${active ? "text-white/60" : "text-ink/55"}`}>{room.lastMessage || "Open chat"}</p>
        </button>
        <button onClick={onDelete} className="rounded-md border border-ink/10 bg-white p-2 text-ink opacity-100 lg:opacity-0 lg:group-hover:opacity-100" aria-label="Close chat">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink/15 bg-white/60 p-4 text-center">
      <p className="text-sm font-black text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink/55">{text}</p>
    </div>
  );
}

function UserRow({
  user,
  status,
  onAction,
  onShare,
  onOpen
}: {
  user: AppUser;
  status: "none" | "connected" | "sent" | "incoming" | "accepted" | "declined";
  onAction: () => void;
  onShare: () => void;
  onOpen: () => void;
}) {
  const actionLabel = status === "connected" || status === "accepted" ? "Connected" : status === "sent" ? "Sent" : status === "declined" ? "Send again" : "Request";
  return (
    <div className="rounded-lg bg-white/75 p-3">
      <div className="flex items-center gap-3">
        <button onClick={onOpen} className="shrink-0" aria-label={`Open ${user.name || user.username} profile`}>
          <Avatar name={user.name || user.username} photoUrl={user.photoUrl} />
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-black text-ink">{user.name || user.username}</p>
          <p className="truncate text-xs text-ink/55">@{user.username}</p>
          {user.bio ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/65">{user.bio}</p> : null}
        </button>
        <button
          onClick={onAction}
          disabled={status === "connected" || status === "accepted" || status === "sent"}
          className="flex items-center gap-1 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-55"
        >
          <Send className="h-3 w-3" />
          {actionLabel}
        </button>
        {status !== "connected" && status !== "accepted" ? (
          <button onClick={onShare} className="rounded-md border border-ink/10 bg-white px-3 py-2 text-xs font-bold text-ink">
            Link
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProfileSheet({ user, onClose }: { user: AppUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-3 sm:items-center">
      <div className="glass w-full max-w-md rounded-lg p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={user.name || user.username} photoUrl={user.photoUrl} />
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-ink">{user.name || user.username}</p>
              <p className="truncate text-xs font-bold text-ink/55">@{user.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border border-ink/10 bg-white p-2 text-ink" aria-label="Close profile">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-2 text-sm leading-6 text-ink/70">
          <p className="rounded-md bg-white/75 p-3">{user.bio || "No bio added yet."}</p>
          <p className="rounded-md bg-white/75 p-3">Role: {user.role || "Member"}</p>
          <p className="rounded-md bg-white/75 p-3">Device and location details appear only inside a shared chat after that user presses the share buttons.</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/8 p-4">
      <p className="text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/55">{label}</p>
    </div>
  );
}
