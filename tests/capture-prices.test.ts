import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Teste pentru logica de captură a prețurilor PZU (OPCOM) din
 * `scripts/convert-sen.py` (modulul `--capture-prices`). Logica e Python, deci
 * o rulăm real: funcțiile pure sunt importate și apelate direct, iar fluxul
 * complet e testat end-to-end cu un mock server HTTP (Python) + fișiere
 * temporare (`SEN_PRICES_URL_TEMPLATE` / `SEN_PRICES_OUT` /
 * `SEN_PRICES_BACKFILL_DAYS`) — datele reale din `data/` nu sunt atinse.
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
        self.send_header("Content-Type", "text/csv")
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

/** CSV OPCOM valid, 24 de intervale, valori distincte pe fiecare oră. */
function makeCsv(prices: number[]): string {
  const rows = ['"Interval","Average Price [Euro/MWh]","Resolution"'];
  prices.forEach((p, i) => {
    rows.push(`"${i + 1}","${p}","PT60M"`);
  });
  return rows.join("\r\n");
}

const CSV_24 = makeCsv(Array.from({ length: 24 }, (_, i) => 100 + i));

describe("capture_prices — parse_prices_csv (funcție pură Python)", () => {
  it(
    "parsează 24 de intervale + respinge payload gol/header lipsă/non-numeric",
    () => {
      py(`
prices = m.parse_prices_csv(${JSON.stringify(CSV_24)})
assert prices is not None and len(prices) == 24
assert prices[0] == 100.0 and prices[23] == 123.0
assert m.parse_prices_csv("") is None
assert m.parse_prices_csv("garbage") is None
assert m.parse_prices_csv("\\"Interval\\",\\"Average Price [Euro/MWh]\\",\\"Resolution\\"") is None
# Preț non-numeric → None
bad = '"Interval","Average Price [Euro/MWh]","Resolution"\\r\\n"1","abc","PT60M"'
assert m.parse_prices_csv(bad) is None
# NaN/Inf → None (non-finit)
nan = '"Interval","Average Price [Euro/MWh]","Resolution"\\r\\n"1","nan","PT60M"'
assert m.parse_prices_csv(nan) is None
print("parse_prices_csv OK")
`);
    },
    TEST_TIMEOUT,
  );
});

describe("capture_prices — merge_prices (dedupe + suprascriere pe dată)", () => {
  it(
    "adaugă zi nouă, suprascrie la prețuri diferite, nu schimbă la identic",
    () => {
      py(`
# Zi nouă → changed True, sortare ascendentă pe dată
merged, changed = m.merge_prices(
    [{"date": "2026-08-13", "prices": [1.0], "currency": "EUR"}],
    {"date": "2026-08-14", "prices": [3.0], "currency": "EUR"},
)
assert changed is True
assert [p["date"] for p in merged] == ["2026-08-13", "2026-08-14"]

# Aceeași dată + prețuri DIFERITE → suprascrie (OPCOM poate publica revizuiri)
merged, changed = m.merge_prices(
    [{"date": "2026-08-13", "prices": [1.0], "currency": "EUR"}],
    {"date": "2026-08-13", "prices": [9.0], "currency": "EUR"},
)
assert changed is True
assert len(merged) == 1
assert merged[0]["prices"] == [9.0]

# Aceeași dată + prețuri identice → changed False (indempotent)
merged, changed = m.merge_prices(
    [{"date": "2026-08-13", "prices": [1.0], "currency": "EUR"}],
    {"date": "2026-08-13", "prices": [1.0], "currency": "EUR"},
)
assert changed is False
assert len(merged) == 1

# Record-uri invalide (fără date/prices) excluse, fără crash
merged, changed = m.merge_prices(
    [{"nu": "are date"}, {"date": "2026-08-12", "prices": [2.0], "currency": "EUR"}],
    {"date": "2026-08-13", "prices": [1.0], "currency": "EUR"},
)
assert changed is True
assert len(merged) == 2
print("merge_prices OK")
`);
    },
    TEST_TIMEOUT,
  );
});

describe("capture_prices — end-to-end (mock server + fișier temporar)", () => {
  let tmp: string;
  let payloadFile: string;
  let baseUrl = "";
  let mock: ReturnType<typeof spawn> | null = null;

  function runCapture(url = baseUrl): { status: number | null; stderr: string } {
    const res = spawnSync("python3", [SCRIPT, "--capture-prices"], {
      env: {
        ...process.env,
        // Mock: template-ul ignoră data (același payload la fiecare request),
        // iar backfill-ul e limitat la 2 zile ca testul să fie rapid.
        SEN_PRICES_URL_TEMPLATE: `${url}/rapoarte-pzu-raportPIP-export-csv/{day}/{month}/{year}/en?resolution=60`,
        SEN_PRICES_OUT: path.join(tmp, "sen-prices.json"),
        SEN_PRICES_BACKFILL_DAYS: "2",
      },
      encoding: "utf-8",
    });
    return { status: res.status, stderr: res.stderr };
  }

  function outFile(): string {
    return path.join(tmp, "sen-prices.json");
  }

  function setPayload(body: string): void {
    writeFileSync(payloadFile, body);
  }

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "sen-prices-"));
    payloadFile = path.join(tmp, "payload.csv");
    setPayload(CSV_24);
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
        { encoding: "utf-8" },
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
    "capturează prețurile cu shape-ul corect (date, prices[24], currency EUR)",
    () => {
      writeFileSync(outFile(), "[]");
      setPayload(CSV_24);
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data.length).toBe(2); // backfill 2 zile
      for (const day of data) {
        expect(day).toHaveProperty("date");
        expect(day.prices).toHaveLength(24);
        expect(day.currency).toBe("EUR");
      }
      expect(stderr).toContain("Wrote");
    },
    TEST_TIMEOUT,
  );

  it(
    "payload gol → nu scrie nimic (zi fără date publicate, de ex. viitoare)",
    () => {
      writeFileSync(outFile(), "[]");
      setPayload("");
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      expect(JSON.parse(readFileSync(outFile(), "utf-8"))).toHaveLength(0);
      expect(stderr).toContain("No new prices");
    },
    TEST_TIMEOUT,
  );

  it(
    "nu crapă la eșec de rețea și păstrează datele existente",
    async () => {
      const seed = [{ date: "2026-08-13", prices: [1, 2], currency: "EUR" }];
      writeFileSync(outFile(), JSON.stringify(seed));
      // Un port „mort" refuză conexiunea instant (ECONNREFUSED).
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
      setPayload(CSV_24);
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(2);
      expect(stderr).toContain("corupt");
    },
    TEST_TIMEOUT,
  );

  it(
    "pornește de la zero la structură non-list, fără KeyError/TypeError",
    () => {
      writeFileSync(outFile(), '{"nu": "e lista"}');
      setPayload(CSV_24);
      const { status, stderr } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(2);
      expect(stderr).toContain("structură neașteptată");
    },
    TEST_TIMEOUT,
  );

  it(
    "adaugă zile noi la o serie existentă, păstrând ordinea cronologică și dedupe-ul pe dată",
    () => {
      // Seed cu o zi veche (nu e în backfill-ul de 2 zile) + o zi care VA fi
      // suprascrisă. Rularea descarcă ultimele 2 zile (15 și 14 aug — azi e
      // 15 aug), deci 14 aug din seed e suprascris cu prețurile noi → total 3.
      const seed = [
        { date: "2026-01-01", prices: [1], currency: "EUR" },
        { date: "2026-08-14", prices: [999], currency: "EUR" }, // va fi suprascris
      ];
      writeFileSync(outFile(), JSON.stringify(seed));
      setPayload(CSV_24);
      const { status } = runCapture();
      expect(status).toBe(0);
      const data = JSON.parse(readFileSync(outFile(), "utf-8"));
      expect(data).toHaveLength(3);
      expect(data[0].date).toBe("2026-01-01");
      // Ziua existentă suprascrisă cu prețurile noi (24), nu cu [999].
      const old = data.find((d: { date: string }) => d.date === "2026-08-14");
      expect(old.prices).toHaveLength(24);
      expect(old.prices[0]).toBe(100);
      // Ordine cronologică.
      expect(data[0].date < data[1].date && data[1].date < data[2].date).toBe(true);
    },
    TEST_TIMEOUT,
  );
});
