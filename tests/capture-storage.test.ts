import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Teste pentru logica de captură a stocării (ISPOZ) din `scripts/convert-sen.py`
 * (modulul `--capture-storage`). Logica e Python, deci o rulăm real: funcțiile
 * pure sunt importate și apelate direct, iar fluxul complet e testat end-to-end
 * cu un mock server HTTP (Python, alimentat de un fișier payload) + fișiere
 * temporare (`SEN_STORAGE_URL` / `SEN_STORAGE_OUT`) — datele reale din `data/`
 * nu sunt niciodată atinse.
 *
 * Acoperă fix-urile: dedupe pe `t`, suprascriere la valoare diferită în aceeași
 * secundă (P3-003), fallback la fișier corupt/non-list (P2-001) și reject NaN.
 */

const SCRIPT = path.resolve("scripts", "convert-sen.py");
const TEST_TIMEOUT = 60_000; // spawn-urile Python sunt lente în sandbox

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
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass
http.server.HTTPServer(("127.0.0.1", ${port}), H).serve_forever()
`;
  return spawn("python3", ["-c", handler], { stdio: "ignore" });
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

describe("capture_storage — extract_ispoz (funcție pură Python)", () => {
  it(
    "extrage numeric, respinge lipsă/non-numeric/negativ/NaN/Inf/non-list",
    () => {
      py(`
assert m.extract_ispoz([{"KOZL115": "176"}, {"ISPOZ": "30"}]) == 30
assert m.extract_ispoz([{"CARB": "778"}]) is None
assert m.extract_ispoz([]) is None
assert m.extract_ispoz([{"ISPOZ": "abc"}]) is None
assert m.extract_ispoz([{"ISPOZ": "-5"}]) is None
assert m.extract_ispoz([{"ISPOZ": "nan"}]) is None
assert m.extract_ispoz([{"ISPOZ": "inf"}]) is None
assert m.extract_ispoz([{"ISPOZ": "-inf"}]) is None
assert m.extract_ispoz(None) is None
assert m.extract_ispoz({"ISPOZ": "30"}) is None
assert m.extract_ispoz("garbage") is None
print("extract_ispoz OK")
`);
    },
    TEST_TIMEOUT,
  );
});

describe("capture_storage — merge_storage (dedupe + suprascriere)", () => {
  it(
    "adaugă punct nou, dedupe la aceeași secundă, suprascrie la valoare diferită, curăță duplicate vechi",
    () => {
      py(`
# Record cu t dar fără ts (corupt) → exclus, fără KeyError la sorted (fix TO_FIX #5)
merged, changed = m.merge_storage(
    [{"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30}, {"t": "2026-08-09T12:00:00.000Z", "ispoz": 99}],
    {"t": "2026-08-09T11:00:00.000Z", "ts": 2000, "ispoz": 40},
)
assert changed is True
assert len(merged) == 2  # coruptul nu intră în serie
assert [p["ts"] for p in merged] == [1000, 2000]
print("merge_storage tolerant la ts lipsă OK")
`);
      py(`
# Punct nou → changed True, sortare ascendentă
merged, changed = m.merge_storage(
    [{"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30}],
    {"t": "2026-08-09T11:00:00.000Z", "ts": 2000, "ispoz": 40},
)
assert changed is True
assert [p["ts"] for p in merged] == [1000, 2000]
assert merged[-1]["ispoz"] == 40

# Aceeași secundă + aceeași valoare → changed False (dedupe)
merged, changed = m.merge_storage(
    [{"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30}],
    {"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30},
)
assert changed is False
assert len(merged) == 1

# Aceeași secundă + valoare DIFERITĂ → suprascrie (fix P3-003)
merged, changed = m.merge_storage(
    [{"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30}],
    {"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 35},
)
assert changed is True
assert len(merged) == 1
assert merged[0]["ispoz"] == 35

# Duplicate vechi curățate + record-uri fără cheia t ignorate
merged, changed = m.merge_storage(
    [
        {"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30},
        {"t": "2026-08-09T10:00:00.000Z", "ts": 1000, "ispoz": 30},  # duplicat vechi
        {"nu": "are t"},  # ignorat
    ],
    {"t": "2026-08-09T11:00:00.000Z", "ts": 2000, "ispoz": 40},
)
assert changed is True
assert len(merged) == 2
assert merged[0]["ispoz"] == 30
assert merged[1]["ispoz"] == 40
print("merge_storage OK")
`);
    },
    TEST_TIMEOUT,
  );
});

describe("capture_storage — end-to-end (mock server + fișier temporar)", () => {
  const PAYLOAD_OK = JSON.stringify([{ KOZL115: "176" }, { ISPOZ: "30" }, { PROD: "6000" }]);

  let tmp: string;
  let payloadFile: string;
  let baseUrl = "";
  let mock: ReturnType<typeof spawn> | null = null;

  function runCapture(url = baseUrl): { status: number | null; stderr: string } {
    const res = spawnSync("python3", [SCRIPT, "--capture-storage"], {
      env: {
        ...process.env,
        SEN_STORAGE_URL: url,
        SEN_STORAGE_OUT: path.join(tmp, "sen-storage.json"),
      },
      encoding: "utf-8",
    });
    return { status: res.status, stderr: res.stderr };
  }

  function outFile(): string {
    return path.join(tmp, "sen-storage.json");
  }

  function setPayload(body: string): void {
    writeFileSync(payloadFile, body);
  }

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "sen-capture-"));
    payloadFile = path.join(tmp, "payload.json");
    setPayload(PAYLOAD_OK);
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    mock = startMockServer(payloadFile, port);
    // Așteptăm ca serverul să accepte conexiuni (poll scurt).
    for (let i = 0; i < 50; i++) {
      const probe = spawnSync(
        "python3",
        [
          "-c",
          `import urllib.request; urllib.request.urlopen(${JSON.stringify(baseUrl)}, timeout=1)`,
        ],
        {
          encoding: "utf-8",
        },
      );
      if (probe.status === 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  afterAll(() => {
    mock?.kill();
    rmSync(tmp, { recursive: true, force: true });
  });

  it(
    "scrie primul punct de captură cu shape-ul corect",
    () => {
      writeFileSync(outFile(), "[]");
      setPayload(PAYLOAD_OK);
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty("t");
      expect(data[0]).toHaveProperty("ts");
      expect(data[0].ispoz).toBe(30);
      // Fix TO_FIX #6: ts = epoch-ul UTC al valorii t etichetate (contract fake-UTC).
      const epochOfT = Date.parse(data[0].t);
      expect(data[0].ts).toBe(epochOfT);
      expect(stderr).toContain("Wrote");
    },
    TEST_TIMEOUT,
  );

  it(
    "nu rescrie fișierul la payload JSON invalid (grațios, fără crash)",
    () => {
      writeFileSync(outFile(), "[]");
      setPayload("garbage-not-json");
      const { status } = runCapture();
      expect(status).toBe(0);
      expect(JSON.parse(readFileSync(outFile(), "utf-8"))).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "nu rescrie fișierul când ISPOZ lipsește din payload",
    () => {
      writeFileSync(outFile(), "[]");
      setPayload(JSON.stringify([{ CARB: "778" }]));
      const { status } = runCapture();
      expect(status).toBe(0);
      expect(JSON.parse(readFileSync(outFile(), "utf-8"))).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "nu crapă la eșec de rețea și păstrează datele existente",
    async () => {
      const seed = [{ t: "2026-08-09T09:00:00.000Z", ts: 9000, ispoz: 10 }];
      writeFileSync(outFile(), JSON.stringify(seed));
      // Un port „mort" (alocat + eliberat) refuză conexiunea instant
      // (ECONNREFUSED), fără timeout — mock-ul real rămâne neatins, deci
      // testele următoare nu depind de un restart cu race.
      const deadUrl = `http://127.0.0.1:${await freePort()}`;
      const { status } = runCapture(deadUrl);
      expect(status).toBe(0);
      expect(JSON.parse(readFileSync(outFile(), "utf-8"))).toEqual(seed);
    },
    TEST_TIMEOUT,
  );

  it(
    "pornește de la zero la fișier corupt (JSON invalid) fără să arunce",
    () => {
      writeFileSync(outFile(), "{nu e json");
      setPayload(PAYLOAD_OK);
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(1);
      expect(stderr).toContain("corupt");
    },
    TEST_TIMEOUT,
  );

  it(
    "pornește de la zero la structură non-list, fără KeyError/TypeError",
    () => {
      writeFileSync(outFile(), '{"nu": "e lista"}');
      setPayload(PAYLOAD_OK);
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(1);
      expect(stderr).toContain("structură neașteptată");
    },
    TEST_TIMEOUT,
  );

  it(
    "adaugă punctul nou la o serie existentă, păstrând ordinea cronologică",
    () => {
      // Deterministic: seed cu un timestamp fix din trecut, apoi un singur run
      // (timestampul real „acum" e garantat diferit). Dedupe-ul same-second e
      // acoperit determinist de testul pur merge_storage — aici verificăm doar
      // append + sortare. (O variantă „rulează de două ori și așteaptă 1 punct"
      // ar depinde de aceeași secundă wall-clock → flaky în CI.)
      const seed = [{ t: "2026-08-09T09:00:00.000Z", ts: 9000, ispoz: 10 }];
      writeFileSync(outFile(), JSON.stringify(seed));
      setPayload(PAYLOAD_OK); // ISPOZ 30
      const { status } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual(seed[0]); // punctul vechi păstrat, primul
      expect(data[1].ispoz).toBe(30); // noul punct, după
      expect(data[0].ts).toBeLessThan(data[1].ts); // ordine ascendentă
    },
    TEST_TIMEOUT,
  );
});
