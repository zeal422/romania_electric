/**
 * Barrel export pentru modulul SEN. Grupează tipuri, constante și funcții
 * de agregare/statistică/formatare într-un singur import.
 */
export * from "./types";
export * from "./constants";
export * from "./aggregate";
export * from "./stats";
export * from "./format";
export { loadReadings, loadSummary, getCachedReadings, resetCache } from "./loader";
