"use client";

import { defaultRoom } from "./room-data";
import type { LoveMessage, SharedRoom } from "./types";

const roomKey = (roomId: string) => `love-room:${roomId}`;
const messageKey = (roomId: string) => `love-messages:${roomId}`;

export function readLocalRoom(roomId: string): SharedRoom {
  const raw = localStorage.getItem(roomKey(roomId));
  if (!raw) return { ...defaultRoom, id: roomId };
  return JSON.parse(raw) as SharedRoom;
}

export function writeLocalRoom(room: SharedRoom) {
  localStorage.setItem(roomKey(room.id), JSON.stringify(room));
}

export function readLocalMessages(roomId: string): LoveMessage[] {
  const raw = localStorage.getItem(messageKey(roomId));
  return raw ? (JSON.parse(raw) as LoveMessage[]) : [];
}

export function writeLocalMessages(roomId: string, messages: LoveMessage[]) {
  localStorage.setItem(messageKey(roomId), JSON.stringify(messages.slice(-80)));
}
