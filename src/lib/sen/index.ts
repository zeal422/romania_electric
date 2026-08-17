/**
 * Barrel export pentru modulul SEN. Grupează tipuri, constante și funcții
 * de agregare/statistică/formatare într-un singur import.
 *
 * ATENȚIE: acest barrel e CLIENT-SAFE (fără node:fs). `loader.ts` este
 * server-only și se importă DIRECT, doar din API routes — nu trece prin barrel.
 */
export * from "./types";
export * from "./constants";
export * from "./aggregate";
export * from "./stats";
export * from "./format";
export * from "./calendar";
