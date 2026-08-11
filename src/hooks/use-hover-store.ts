"use client";

import { create } from "zustand";

interface HoverState {
  hoveredSource: string | null;
  setHoveredSource: (source: string | null) => void;
}

export const useHoverStore = create<HoverState>((set) => ({
  hoveredSource: null,
  setHoveredSource: (source) => set({ hoveredSource: source }),
}));
