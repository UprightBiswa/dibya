export type ThemeName = "rose" | "mint" | "sunset" | "night";

export type Profile = {
  name: string;
  role: string;
  bio: string;
  photoUrl: string;
};

export type Participant = Profile & {
  id: string;
  joinedAt: number;
  locationText?: string;
  deviceText?: string;
};

export type AppUser = Profile & {
  uid: string;
  email: string;
  username: string;
  usernameLower: string;
  displayName: string;
  createdAt?: number;
};

export type ChatInvite = {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  status: "pending" | "accepted" | "declined";
  roomId?: string;
  createdAt: number;
};

export type SharedRoom = {
  id: string;
  ownerUid?: string;
  ownerEmail?: string;
  peerUid?: string;
  participantUids?: string[];
  partnerName?: string;
  deleted?: boolean;
  createdAt?: number;
  theme: ThemeName;
  quoteOfDay: string;
  profiles: {
    owner: Profile;
    peer: Profile;
  };
};

export type LoveMessage = {
  id: string;
  roomId: string;
  sender: string;
  senderId?: string;
  ownerUid?: string;
  edited?: boolean;
  kind: "text" | "gift" | "photo" | "location" | "device" | "snap" | "game";
  text: string;
  mediaUrl?: string;
  createdAt: number;
};
