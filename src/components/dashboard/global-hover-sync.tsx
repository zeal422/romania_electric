"use client";

import { useEffect } from "react";
import { useHoverStore } from "@/hooks/use-hover-store";

/**
 * Componentă invizibilă care sincronizează `hoveredSource` direct cu un atribut pe <body> (`data-hovered-source`).
 * Permite stilizarea prin CSS a graficelor Recharts fără a le declanșa re-randări React.
 */
export function GlobalHoverSync() {
  const hoveredSource = useHoverStore((state) => state.hoveredSource);

  useEffect(() => {
    if (hoveredSource) {
      document.body.dataset.hoveredSource = hoveredSource;
    } else {
      delete document.body.dataset.hoveredSource;
    }

    return () => {
      delete document.body.dataset.hoveredSource;
    };
  }, [hoveredSource]);

  return null;
}
