import type { SharedRoom, ThemeName } from "./types";

export const themes: Record<ThemeName, { label: string; primary: string; secondary: string; bg: string }> = {
  rose: { label: "Rose", primary: "#e84d74", secondary: "#11a37f", bg: "#fff7f8" },
  mint: { label: "Mint", primary: "#0f9f86", secondary: "#f9738c", bg: "#f4fffb" },
  sunset: { label: "Sunset", primary: "#e6583f", secondary: "#7c3aed", bg: "#fff8ed" },
  night: { label: "Night", primary: "#7c3aed", secondary: "#22c55e", bg: "#f7f5ff" }
};

export const loveQuotes = [
  "Every small message from you makes the day softer.",
  "Proud of your brave nurse heart and the way you care for your family.",
  "My favorite place is any moment where we are laughing together.",
  "You make ordinary days feel like a celebration.",
  "A little flower for your tired day, and a big thank you for your love."
];

export const gifts = [
  { icon: "💐", label: "Bouquet", text: "A fresh bouquet for your caring heart." },
  { icon: "🧸", label: "Teddy", text: "A soft teddy hug for you." },
  { icon: "🍫", label: "Chocolate", text: "Sweet chocolate for a sweeter smile." },
  { icon: "💌", label: "Love Note", text: "A secret note: you are deeply loved." },
  { icon: "🌙", label: "Good Night", text: "Sleep softly, my favorite person." },
  { icon: "☀️", label: "Good Morning", text: "Good morning, beautiful soul." }
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
