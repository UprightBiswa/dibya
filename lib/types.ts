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

export type SharedRoom = {
  id: string;
  ownerUid?: string;
  ownerEmail?: string;
  partnerName?: string;
  deleted?: boolean;
  createdAt?: number;
  theme: ThemeName;
  quoteOfDay: string;
  profiles: {
    biswajit: Profile;
    dibya: Profile;
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
