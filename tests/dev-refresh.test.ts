import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Teste pentru modulul `--refresh-if-stale` din `scripts/convert-sen.py`
 * (auto-refresh la pornirea dev serverului — Varianta A, fix 0.3.29).
 *
 * Logica e Python, deci o rulăm real. Funcția pură `is_data_stale` e importată
 * și apelată direct (cu `OUT_SUMMARY` suprascris în modul); fluxul complet
 * `--refresh-if-stale` rulează scriptul ca subproces cu env override
 * (`SEN_DATA_OUT` / `SEN_SUMMARY_OUT` / `SEN_LIVE_URL` / `SEN_PRICES_*`) +
 * mock server HTTP — datele reale din `data/` nu sunt atinse.
 *
 * Invariantul critic testat: modulul iese întotdeauna cu exit 0 (chiar cu date
 * corupte / rețea moartă), ca wrapper-ul `scripts/dev.sh` să nu blocheze
 * pornirea serverului („warning, nu blocker").
 */

const SCRIPT = path.resolve("scripts", "convert-sen.py");

/** Rulează un script Python inline care importă modulul și execută `body`. */
function py(body: string): string {
  const code = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("convert_sen", ${JSON.stringify(SCRIPT)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
${body}
`;
  const res = spawnSync("python3", ["-c", code], { encoding: "utf-8" });
  if (res.status !== 0) {
    throw new Error(`python3 a eșuat (exit ${res.status}):\n${res.stderr}\n${res.stdout}`);
  }
  return res.stdout;
}

/** Mock server HTTP Python: servește conținutul din `payloadFile` la fiecare GET. */
function startMockServer(payloadFile: string, port: number): ReturnType<typeof spawn> {
  const handler = `
import http.server, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        with open(${JSON.stringify(payloadFile)}, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass
http.server.HTTPServer(("127.0.0.1", ${port}), H).serve_forever()
`;
  const proc = spawn("python3", ["-c", handler], { stdio: "ignore" });
  // Listener 'error' permanent de la naștere: un spawn EȘUAT (ex. python3 lipsă
  // în CI) emite 'error' asincron (nextTick) — fără listener, EventEmitter
  // aruncă „Unhandled 'error' event" și omoară întregul test runner (fix claim 8).
  proc.on("error", () => {});
  return proc;
}

/** Găsește un port liber (bind + close; race minim acceptabil pentru teste). */
function freePort(): Promise<number> {
  const net = require("node:net") as typeof import("node:net");
  return new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as { port: number };
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Oprește un mock server și AȘTAPTĂ exit-ul procesului (spre deosebire de `kill()`
 * fire-and-forget). Fără await, procesul vechi poate fi încă viu când pornește
 * serverul de înlocuire pe același port → EADDRINUSE (procesul nou moare) sau
 * `waitForServer` răspunde la procesul VECHI (care servește payload-ul vechi) —
 * test flaky / fals-pozitiv. Folosit înainte de fiecare restart și în cleanup
 * (fix TO_FIX round 2, claim 7). Fiecare proces e oprit independent.
 */
async function stopMockServer(
  proc: ReturnType<typeof spawn> | undefined,
  timeoutMs = 5_000,
): Promise<void> {
  if (!proc) return;
  if (proc.exitCode !== null || proc.signalCode !== null) return; // deja mort

  // Listener 'error' permanent (fix claim 8): un kill EȘUAT (EPERM — ramura
  // `else` din ChildProcess.kill, Node 22) sau un spawn eșuat emit 'error' pe
  // ChildProcess. Fără listener, EventEmitter aruncă „Unhandled 'error' event"
  // → crash-ul întregului test runner (nu doar fail de test). Rămâne atașat pe
  // toată durata ambelor încercări (SIGTERM + SIGKILL).
  proc.on("error", () => {});

  /**
   * Așteaptă terminarea procesului; se rezolvă la PRIMUL dintre `exit`/`close`/
   * `error` (o singură cale, nu un wait per eveniment). `exit`/`close` = mort
   * garantat (`close` se emite și după spawn eșuat, când `exit` nu apare
   * NICIODATĂ). `error` = kill/spawn EȘUAT: procesul e considerat ÎNCĂ VIU
   * (EPERM = kill refuzat) → escaladăm la SIGKILL / fail-test, nu continuăm
   * niciodată cu un proces viu pe port. Timer-ul e curățat la rezolvare.
   */
  const waitForExit = (ms: number): Promise<boolean> =>
    new Promise((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve(true);
        return;
      }
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (dead: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(dead);
      };
      timer = setTimeout(() => settle(false), ms);
      proc.once("exit", () => settle(true));
      proc.once("close", () => settle(true));
      proc.once("error", () => settle(false));
    });

  // Pasul 1: SIGTERM (terminare grațioasă). Dacă procesul moare, gata.
  proc.kill();
  if (await waitForExit(timeoutMs)) return;

  // Pasul 2: procesul a supraviețuit SIGTERM-ului (blocat/ignoră semnalul) —
  // SIGKILL (de neignorat) și așteptăm exit-ul real. Dacă nici acum nu moare,
  // eșuăm testul: nu continuăm niciodată cu un mock server VIU pe port (ar
  // produce EADDRINUSE la rebind sau waitForServer care răspunde la procesul
  // vechi — payload greșit → test fals-pozitiv).
  proc.kill("SIGKILL");
  const died = await waitForExit(timeoutMs);
  if (!died) {
    throw new Error(
      `mock server nu a terminat nici după SIGKILL (pid ${proc.pid}) — portul rămâne ocupat`,
    );
  }
}

/**
 * Așteaptă până când un server de pe `port` acceptă conexiuni (readiness probe).
 *
 * `startMockServer` face `spawn("python3", ...)` — procesul Python are nevoie de
 * câteva zeci de ms să pornească și să lege portul. Dacă subprocesul de refresh
 * pornește imediat, fetch-ul poate ajunge înainte ca serverul să asculte →
 * URLError prins intern → „No new records" → test flaky. Poll-ul elimină race-ul
 * (fix TO_FIX round 2, claim 6). Fiecare port e așteptat independent.
 */
async function waitForServer(port: number, timeoutMs = 10_000): Promise<void> {
  const net = require("node:net") as typeof import("node:net");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.once("error", () => {
        sock.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`mock server pe portul ${port} nu a acceptat conexiuni în ${timeoutMs}ms`);
}

/** CSV OPCOM valid, 24 de intervale (reutilizat din pattern-ul capture-prices). */
function makeCsv(prices: number[]): string {
  const rows = ['"Interval","Average Price [Euro/MWh]","Resolution"'];
  prices.forEach((p, i) => {
    rows.push(`"${i + 1}","${p}","PT60M"`);
  });
  return rows.join("\r\n");
}

/** Payload live Transelectrica valid: un rând la un timp dat (ziua, foto mic — fără guard de noapte). */
function makeLiveLine(d: Date): string {
  const fmt = (x: number) => String(x).padStart(2, "0");
  const dd = fmt(d.getUTCDate());
  const mm = fmt(d.getUTCMonth() + 1);
  const yyyy = d.getUTCFullYear();
  const hh = fmt(d.getUTCHours());
  const min = fmt(d.getUTCMinutes());
  const ss = fmt(d.getUTCSeconds());
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss};5000;4900;6000;-100;700;1200;600;700;2300;50;60;|`;
}

/** Rulează `--refresh-if-stale` ca subproces cu env override (fișiere temp). */
function runRefreshIfStale(env: Record<string, string>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const res = spawnSync("python3", [SCRIPT, "--refresh-if-stale"], {
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe("is_data_stale (funcție pură Python)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sen-stale-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("proaspăt → False, vechi → True, lipsă → True, corupt → True", () => {
    const fresh = path.join(dir, "fresh.json");
    const old = path.join(dir, "old.json");
    const corrupt = path.join(dir, "corrupt.json");
    const nowS = Date.now();
    writeFileSync(fresh, JSON.stringify({ endTs: nowS }));
    writeFileSync(old, JSON.stringify({ endTs: nowS - 48 * 3600_000 }));
    writeFileSync(corrupt, "nu e json{");
    py(`
m.OUT_SUMMARY = ${JSON.stringify(fresh)}
assert m.is_data_stale(24.0) is False, "proaspăt trebuie să fie fresh"
m.OUT_SUMMARY = ${JSON.stringify(old)}
assert m.is_data_stale(24.0) is True, "vechi trebuie să fie stale"
m.OUT_SUMMARY = ${JSON.stringify(path.join(dir, "missing.json"))}
assert m.is_data_stale(24.0) is True, "lipsă trebuie să fie stale"
m.OUT_SUMMARY = ${JSON.stringify(corrupt)}
assert m.is_data_stale(24.0) is True, "corupt trebuie să fie stale"
# endTs lipsă / non-numeric → stale
open(${JSON.stringify(fresh)}, "w").write(json.dumps({"start": "x"}))
m.OUT_SUMMARY = ${JSON.stringify(fresh)}
assert m.is_data_stale(24.0) is True
print("is_data_stale OK")
`);
  });

  it("endTs NaN / Infinity → True (non-finit = corupție, nu proaspăt) — fix TO_FIX round 2", () => {
    const nan = path.join(dir, "nan.json");
    const inf = path.join(dir, "inf.json");
    // Python's json.load acceptă literalii NaN/Infinity (json.loads('{"endTs": NaN}') → nan),
    // deci un fișier corupt cu astfel de valori e realist. Înainte de fix, `nan > 24` e
    // False → datele păreau veșnic proaspete și refresh-ul nu mai rula niciodată.
    writeFileSync(nan, '{"endTs": NaN}');
    writeFileSync(inf, '{"endTs": Infinity}');
    py(`
m.OUT_SUMMARY = ${JSON.stringify(nan)}
assert m.is_data_stale(24.0) is True, "NaN trebuie tratat ca stale (corupție)"
m.OUT_SUMMARY = ${JSON.stringify(inf)}
assert m.is_data_stale(24.0) is True, "Infinity trebuie tratat ca stale (corupție)"
print("is_data_stale non-finit OK")
`);
  });
});

describe("--refresh-if-stale (flux complet, subproces real)", () => {
  let dir: string;
  let livePort = 0;
  let pricesPort = 0;
  let liveServer: ReturnType<typeof spawn> | undefined;
  let pricesServer: ReturnType<typeof spawn> | undefined;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "sen-refresh-"));
    livePort = await freePort();
    pricesPort = await freePort();
  });
  afterAll(async () => {
    await stopMockServer(liveServer);
    await stopMockServer(pricesServer);
    rmSync(dir, { recursive: true, force: true });
  });

  function envFor(liveUrl: string, pricesUrl: string): Record<string, string> {
    return {
      SEN_DATA_OUT: path.join(dir, "sen-data.json"),
      SEN_SUMMARY_OUT: path.join(dir, "sen-summary.json"),
      SEN_PRICES_OUT: path.join(dir, "sen-prices.json"),
      // LIVE_URL real are deja `?p_p_id=...`; codul face `${LIVE_URL}&${qs}`,
      // deci mock-ul trebuie să aibă și el un `?` (altfel „nonnumeric port").
      SEN_LIVE_URL: `${liveUrl}?x=1`,
      SEN_PRICES_URL_TEMPLATE: pricesUrl,
      SEN_PRICES_BACKFILL_DAYS: "2",
    };
  }

  it("cu date proaspete nu atinge rețeaua și nu rescrie nimic (pornire instant)", () => {
    // Căile exacte pe care le citește/scrie modulul (din envFor) — testul trebuie
    // să scrie în ACELE fișiere, altfel modulul vede „lipsă” (stale).
    const dataPath = path.join(dir, "sen-data.json");
    const sumPath = path.join(dir, "sen-summary.json");
    // Un rând static vechi de 1h (proaspăt < 24h) + summary fresh.
    const now = Date.now();
    const t1 = now - 60 * 60_000;
    writeFileSync(
      dataPath,
      JSON.stringify([
        {
          t: new Date(t1).toISOString(),
          ts: t1,
          consum: 5000,
          medieConsum: 4900,
          productie: 6000,
          carbune: 700,
          hidrocarburi: 1200,
          ape: 600,
          nuclear: 700,
          eolian: 2300,
          foto: 50,
          biomasa: 60,
          sold: -100,
        },
      ]),
    );
    writeFileSync(sumPath, JSON.stringify({ endTs: t1 }));
    const before = readFileSync(dataPath, "utf-8");

    // LIVE_URL către un port închis: dacă modulul ar atinge rețeaua, ar eșua
    // (URLError prins intern) — dar noi vrem să NU încerce deloc.
    const res = runRefreshIfStale(
      envFor(`http://127.0.0.1:${livePort}`, `http://127.0.0.1:${pricesPort}`),
    );
    expect(res.status).toBe(0);
    expect(res.stderr).toContain("Date proaspete");
    expect(readFileSync(dataPath, "utf-8")).toBe(before); // neschimbat
    expect(res.stderr).not.toContain("Fetching live"); // zero rețea
  });

  it("cu date vechi + mock server aduce totul la zi (endTs actualizat), exit 0", async () => {
    const dataPath = path.join(dir, "sen-data.json");
    const sumPath = path.join(dir, "sen-summary.json");
    const livePayload = path.join(dir, "live.txt");
    const csvPayload = path.join(dir, "prices.csv");

    // Date statice vechi de 48h → stale.
    const old = Date.now() - 48 * 3600_000;
    writeFileSync(
      dataPath,
      JSON.stringify([
        {
          t: new Date(old).toISOString(),
          ts: old,
          consum: 5000,
          medieConsum: 4900,
          productie: 6000,
          carbune: 700,
          hidrocarburi: 1200,
          ape: 600,
          nuclear: 700,
          eolian: 2300,
          foto: 50,
          biomasa: 60,
          sold: -100,
        },
      ]),
    );
    writeFileSync(sumPath, JSON.stringify({ endTs: old }));

    // Mock live: un rând NOU (acum − 1h) — mai nou decât staticul vechi.
    const fresh = Date.now() - 1 * 3600_000;
    writeFileSync(livePayload, makeLiveLine(new Date(fresh)));
    // Mock prețuri: 24 de intervale valide.
    writeFileSync(csvPayload, makeCsv(Array.from({ length: 24 }, (_, i) => 100 + i)));

    // Oprim mai întâi eventualele servere vechi și AȘTEPTĂM exit-ul (kill
    // fire-and-forget ar lăsa procesul vechi să țină portul → EADDRINUSE la
    // rebind sau waitForServer care răspunde la procesul VECHI — fix claim 7).
    await stopMockServer(liveServer);
    await stopMockServer(pricesServer);
    liveServer = startMockServer(livePayload, livePort);
    pricesServer = startMockServer(csvPayload, pricesPort);
    // Readiness probe: ambele server-e NOI trebuie să accepte conexiuni înainte
    // ca subprocesul de refresh să pornească (altfel test flaky — fix claim 6).
    await waitForServer(livePort);
    await waitForServer(pricesPort);

    const res = runRefreshIfStale(
      envFor(`http://127.0.0.1:${livePort}`, `http://127.0.0.1:${pricesPort}`),
    );
    expect(res.status).toBe(0);
    expect(res.stderr).toContain("Date vechi");
    expect(res.stderr).toContain("Fetching live");

    const data = JSON.parse(readFileSync(dataPath, "utf-8"));
    const summary = JSON.parse(readFileSync(sumPath, "utf-8"));
    const lastTs = data[data.length - 1].ts;
    expect(lastTs).toBeGreaterThan(old); // endTs a avansat
    expect(summary.endTs).toBe(lastTs);
    expect(data.length).toBeGreaterThan(1); // static vechi + rândul live nou
  });

  it("cu summary corupt iese tot cu exit 0 (invariantul wrapper-ului: nu blochează pornirea)", () => {
    const dataPath = path.join(dir, "sen-data.json");
    const sumPath = path.join(dir, "sen-summary.json");
    writeFileSync(sumPath, "nu e json{");
    writeFileSync(dataPath, "nu e json{");
    // LIVE_URL către port închis: orice eroare de rețea/citire e prinsă intern.
    const res = runRefreshIfStale(
      envFor(`http://127.0.0.1:${livePort}`, `http://127.0.0.1:${pricesPort}`),
    );
    expect(res.status).toBe(0); // NICIODATĂ non-zero — serverul pornește mereu
  });

  it("summary corupt + live eșuat (URL mort) → OUT_SUMMARY reconstruit din records valide — fix TO_FIX round 2", async () => {
    const dataPath = path.join(dir, "sen-data.json");
    const sumPath = path.join(dir, "sen-summary.json");
    // Oprim mock server-ele lăsate pornite de testele anterioare și AȘTEPTĂM
    // exit-ul: portul trebuie să fie ÎNTOTDEAUNA mort ca live-ul să eșueze
    // (altfel rândul live s-ar adăuga și count-ul ar crește — testul ar testa
    // altceva). Kill fire-and-forget ar putea lăsa portul activ → fals-pozitiv.
    await stopMockServer(liveServer);
    await stopMockServer(pricesServer);
    // Date statice VALIDE (vechi de 48h → stale), summary CORUPT.
    const old = Date.now() - 48 * 3600_000;
    writeFileSync(
      dataPath,
      JSON.stringify([
        {
          t: new Date(old).toISOString(),
          ts: old,
          consum: 5000,
          medieConsum: 4900,
          productie: 6000,
          carbune: 700,
          hidrocarburi: 1200,
          ape: 600,
          nuclear: 700,
          eolian: 2300,
          foto: 50,
          biomasa: 60,
          sold: -100,
        },
      ]),
    );
    writeFileSync(sumPath, "nu e json{");
    // LIVE_URL către un port închis (niciun mock server pornit) → live eșuează,
    // refresh_from_live iese devreme fără write — dar summary-ul trebuie oricum
    // reconstruit din records-urile valide (fix TO_FIX round 2, claim 2).
    const res = runRefreshIfStale(
      envFor(`http://127.0.0.1:${livePort}`, `http://127.0.0.1:${pricesPort}`),
    );
    expect(res.status).toBe(0);
    // summary-ul a fost reconstruit și e valid, cu endTs = ts-ul recordului static.
    const summary = JSON.parse(readFileSync(sumPath, "utf-8"));
    expect(summary.endTs).toBe(old);
    expect(summary.count).toBe(1);
  });

  it("summary corupt + live doar duplicate → OUT_SUMMARY reconstruit din records valide — fix TO_FIX round 2", async () => {
    const dataPath = path.join(dir, "sen-data.json");
    const sumPath = path.join(dir, "sen-summary.json");
    const livePayload = path.join(dir, "live-dup.txt");
    const csvPayload = path.join(dir, "prices-dup.csv");
    // Date statice VALIDE (vechi de 48h → stale), summary CORUPT.
    // `old` la graniță de SECUNDĂ (fără ms): makeLiveLine trunchiază la secundă,
    // deci doar așa ts-ul live e EXACT ts-ul staticului → duplicat real.
    const old = Math.floor((Date.now() - 48 * 3600_000) / 1000) * 1000;
    writeFileSync(
      dataPath,
      JSON.stringify([
        {
          t: new Date(old).toISOString(),
          ts: old,
          consum: 5000,
          medieConsum: 4900,
          productie: 6000,
          carbune: 700,
          hidrocarburi: 1200,
          ape: 600,
          nuclear: 700,
          eolian: 2300,
          foto: 50,
          biomasa: 60,
          sold: -100,
        },
      ]),
    );
    writeFileSync(sumPath, "nu e json{");
    // Mock live: EXACT același ts ca staticul (duplicat) → „No new timestamps".
    writeFileSync(livePayload, makeLiveLine(new Date(old)));
    writeFileSync(csvPayload, makeCsv(Array.from({ length: 24 }, (_, i) => 100 + i)));

    // Oprim mai întâi eventualele servere vechi și AȘTEPTĂM exit-ul (kill
    // fire-and-forget ar lăsa procesul vechi să țină portul → EADDRINUSE la
    // rebind sau waitForServer care răspunde la procesul VECHI — fix claim 7).
    await stopMockServer(liveServer);
    await stopMockServer(pricesServer);
    liveServer = startMockServer(livePayload, livePort);
    pricesServer = startMockServer(csvPayload, pricesPort);
    // Readiness probe: ambele server-e NOI trebuie să accepte conexiuni înainte
    // ca subprocesul de refresh să pornească (altfel test flaky — fix claim 6).
    await waitForServer(livePort);
    await waitForServer(pricesPort);

    const res = runRefreshIfStale(
      envFor(`http://127.0.0.1:${livePort}`, `http://127.0.0.1:${pricesPort}`),
    );
    expect(res.status).toBe(0);
    // summary-ul a fost reconstruit chiar dacă live-ul nu a adus nimic nou.
    const summary = JSON.parse(readFileSync(sumPath, "utf-8"));
    expect(summary.endTs).toBe(old);
    expect(summary.count).toBe(1);
  });
});

describe("stopMockServer (teardown robust la evenimente 'error' — fix claim 8)", () => {
  it("kill eșuat (EPERM simulat) nu crapă runner-ul și procesul e oprit oricum", async () => {
    // Proces VIU care IGNORĂ SIGTERM (ca mock server-ul blocat) — creat cu spawn
    // direct, fără listener 'error' din startMockServer, ca testul să verifice
    // DOAR listener-ul permanent din stopMockServer.
    const p = spawn(
      "python3",
      ["-c", "import signal, time; signal.signal(signal.SIGTERM, lambda *a: None); time.sleep(30)"],
      { stdio: "ignore" },
    );
    await new Promise((r) => setTimeout(r, 150)); // lasă procesul să pornească
    expect(p.exitCode).toBeNull();

    // stopMockServer rulează sincron până la primul await (atașează listener-ul
    // 'error' permanent + trimite SIGTERM + intră în waitForExit). Apoi emitem
    // 'error' pe child — exact ramura `else` (EPERM) din ChildProcess.kill
    // (Node 22): emit sincron. Fără listener → „Unhandled 'error' event" →
    // crash-ul întregului test runner (bug-ul din claim). Cu fix-ul, listener-ul
    // permanent îl prinde, waitForExit se rezolvă prin calea 'error' → escaladăm
    // la SIGKILL → procesul moare garantat.
    const stopping = stopMockServer(p);
    p.emit(
      "error",
      Object.assign(new Error("kill EPERM (simulat)"), {
        errno: -1,
        code: "EPERM",
        syscall: "kill",
      }),
    );
    await expect(stopping).resolves.toBeUndefined();
    expect(p.exitCode !== null || p.signalCode !== null).toBe(true);
  });
});
