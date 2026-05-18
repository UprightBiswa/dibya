"use client";

import { create } from "zustand";

type UiState = {
  sender: "biswajit" | "dibya";
  setSender: (sender: "biswajit" | "dibya") => void;
};

export const useUiStore = create<UiState>((set) => ({
  sender: "biswajit",
  setSender: (sender) => set({ sender })
}));
