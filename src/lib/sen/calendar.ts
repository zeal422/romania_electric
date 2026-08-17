/**
 * Utilitare de calendar, client-safe (funcții pure, fără node:fs).
 *
 * Separarea de `format.ts` e intenționată: `format.ts` afișează datele sursă
 * strict prin getters UTC (contract fake-UTC, AGENTS §4.7), în timp ce aici
 * procesăm input-ul calendarului utilizatorului — care trăiește în fusul
 * LOCAL al browser-ului și trebuie citit prin getters locali.
 */

/**
 * Cheia calendaristică `YYYY-MM-DD` a unei date, din componentele LOCALE.
 *
 * Folosită pentru conversia datei alese în react-day-picker (care produce
 * miezul nopții LOCAL al zilei click-uite). `toISOString().slice(0, 10)` ar
 * lua ziua UTC — pentru utilizatorii UTC+3 (România — publicul țintă) click-ul
 * pe „15 aug" ar deveni „2026-08-14" (off-by-one, fix 0.3.27): miezul nopții
 * local 15 aug = 14 aug 21:00 UTC. Getters-ii locali redau mereu ziua pe care
 * utilizatorul a văzut-o în calendar, indiferent de fusul browser-ului.
 */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
