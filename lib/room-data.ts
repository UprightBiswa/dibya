import type { SharedRoom, ThemeName } from "./types";

export const themes: Record<ThemeName, { label: string; primary: string; secondary: string; bg: string }> = {
  rose: { label: "Rose", primary: "#e84d74", secondary: "#11a37f", bg: "#fff7f8" },
  mint: { label: "Mint", primary: "#0f9f86", secondary: "#f9738c", bg: "#f4fffb" },
  sunset: { label: "Sunset", primary: "#e6583f", secondary: "#7c3aed", bg: "#fff8ed" },
  night: { label: "Night", primary: "#7c3aed", secondary: "#22c55e", bg: "#f7f5ff" },
  ocean: { label: "Ocean", primary: "#0f766e", secondary: "#2563eb", bg: "#eefcff" },
  mono: { label: "Mono", primary: "#111827", secondary: "#64748b", bg: "#f8fafc" }
};

export const loveQuotes = [
  "A small message can make a long day feel lighter.",
  "Good people deserve soft places to talk and feel seen.",
  "Shared laughter turns an ordinary chat into a memory.",
  "Care shows up in the little replies, photos, and check-ins.",
  "Send something kind. It may be exactly what the other person needs."
];

export const gifts = [
  { icon: "\uD83D\uDC90", label: "Bouquet", text: "A fresh bouquet for your day." },
  { icon: "\uD83E\uDDF8", label: "Teddy", text: "A soft teddy hug for you." },
  { icon: "\uD83C\uDF6B", label: "Chocolate", text: "Sweet chocolate for a sweeter smile." },
  { icon: "\uD83D\uDC8C", label: "Note", text: "A private note: you matter here." },
  { icon: "\uD83C\uDF19", label: "Good night", text: "Sleep softly and rest well." },
  { icon: "\u2600\uFE0F", label: "Good morning", text: "Good morning. Wishing you a bright day." }
];

export const defaultRoom: SharedRoom = {
  id: "private-room",
  theme: "rose",
  quoteOfDay: loveQuotes[0],
  profiles: {
    owner: {
      name: "You",
      role: "Room owner",
      bio: "Create a private room and share thoughtful messages.",
      photoUrl: ""
    },
    peer: {
      name: "Friend",
      role: "Invited person",
      bio: "A private space for chat, care, and shared moments.",
      photoUrl: ""
    }
  }
};
