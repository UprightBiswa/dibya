"use client";

import { create } from "zustand";
import type { ThemeName } from "./types";

type AppView = "chats" | "users" | "requests" | "profile";

type AppState = {
  activeTab: AppView;
  soundEnabled: boolean;
  selectedTheme: ThemeName;
  setActiveTab: (tab: AppView) => void;
  setSelectedTheme: (theme: ThemeName) => void;
  toggleSound: () => void;
  playTone: (kind?: "tap" | "send" | "success") => void;
};

let audioContext: AudioContext | null = null;

function play(kind: "tap" | "send" | "success") {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequencies = { tap: 420, send: 620, success: 780 };
  oscillator.frequency.value = frequencies[kind];
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.14);
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: "chats",
  soundEnabled: true,
  selectedTheme: "rose",
  setActiveTab: (tab) => {
    set({ activeTab: tab });
    get().playTone("tap");
  },
  setSelectedTheme: (theme) => {
    set({ selectedTheme: theme });
    get().playTone("tap");
  },
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  playTone: (kind = "tap") => {
    if (get().soundEnabled) play(kind);
  }
}));

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
