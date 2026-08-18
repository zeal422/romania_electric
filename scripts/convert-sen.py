#!/usr/bin/env python3
"""Convert / refresh SEN data -> data/sen-data.json + data/sen-summary.json.

Usage:
  bun run data:convert    # full rebuild from upload/Grafic_SEN.xlsx
  bun run data:refresh    # incremental fetch from the Transelectrica live endpoint

Output schema (array of objects):
{
  "t": "2026-07-01T18:11:06.000Z",  # ISO (wall-clock as recorded by Transelectrica)
  "ts": 1782924660000,              # epoch ms
  "consum": 7210.0,
  "medieConsum": 7318.0,
  "productie": 5309.0,
  "carbune": 815.0,
  "hidrocarburi": 715.0,
  "ape": 1769.0,
  "nuclear": 679.0,
  "eolian": 402.0,
  "foto": 887.0,
  "biomasa": 38.0,
  "sold": 1900.0
}

Also writes data/sen-summary.json with global statistics for instant KPI rendering.
"""
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from statistics import mean

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "upload", "Grafic_SEN.xlsx")
OUT_DIR = os.path.join(ROOT, "data")
# Overridable prin env pentru teste (fișiere temporare), ca să nu atingem niciodată
# datele reale din repo — pattern existent (SEN_STORAGE_OUT / SEN_PRICES_OUT):
# SEN_DATA_OUT / SEN_SUMMARY_OUT (fișiere temp) + SEN_LIVE_URL (endpoint mock).
OUT_DATA = os.environ.get("SEN_DATA_OUT", os.path.join(OUT_DIR, "sen-data.json"))
OUT_SUMMARY = os.environ.get("SEN_SUMMARY_OUT", os.path.join(OUT_DIR, "sen-summary.json"))
OUT_STORAGE = os.environ.get("SEN_STORAGE_OUT", os.path.join(OUT_DIR, "sen-storage.json"))
# Prețurile PZU (OPCOM): SEN_PRICES_OUT (fișier temp pt teste) + template-ul de URL
# (endpoint public, fără cheie) + backfill-days overridable pt teste (mock server).
OUT_PRICES = os.environ.get("SEN_PRICES_OUT", os.path.join(OUT_DIR, "sen-prices.json"))
PRICES_URL_TEMPLATE = os.environ.get(
    "SEN_PRICES_URL_TEMPLATE",
    "https://www.opcom.ro/rapoarte-pzu-raportPIP-export-csv/{day}/{month}/{year}/en?resolution=60",
)
PRICES_BACKFILL_DAYS = int(os.environ.get("SEN_PRICES_BACKFILL_DAYS", "35"))

# Ordinea coloanelor din xlsx (header: …;Carbune;Hidrocarburi;Ape;Nuclear;Eolian;Foto;Biomasa;Sold).
FIELDS = [
    "consum",
    "medieConsum",
    "productie",
    "carbune",
    "hidrocarburi",
    "ape",
    "nuclear",
    "eolian",
    "foto",
    "biomasa",
    "sold",
]

# ATENȚIE: endpoint-ul live (widget-ul „SEN Grafic”) are o ordine DIFERITĂ de xlsx:
# pune SOLD pe poziția a 4-a (imediat după productie), apoi carbune…biomasa.
#   live:  consum;medieConsum;productie;SOLD;carbune;hidrocarburi;ape;nuclear;eolian;foto;biomasa
#   xlsx: consum;medieConsum;productie;carbune;hidrocarburi;ape;nuclear;eolian;foto;biomasa;SOLD
LIVE_FIELDS = [
    "consum",
    "medieConsum",
    "productie",
    "sold",
    "carbune",
    "hidrocarburi",
    "ape",
    "nuclear",
    "eolian",
    "foto",
    "biomasa",
]

SOURCES = ["carbune", "hidrocarburi", "ape", "nuclear", "eolian", "foto", "biomasa"]

# Endpoint public Transelectrica (widget-ul „SEN Grafic”, Liferay resource URL).
# Răspuns: text — rânduri separate prin „|”, câmpuri separate prin „;”:
#   "09-08-2026 00:09:47;5435;5282;6354;-918;778;1267;1113;680;2435;-14;60;|..."
# Prima coloană e timpul wall-clock România (DD-MM-YYYY HH:MM:SS), urmat de cele 11 câmpuri.
LIVE_URL = os.environ.get(
    "SEN_LIVE_URL",
    "https://www.transelectrica.ro/widget/web/tel/sen-grafic"
    "?p_p_id=SENGrafic_WAR_SENGraficportlet"
    "&p_p_lifecycle=2&p_p_state=maximized&p_p_mode=view",
)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

try:
    from zoneinfo import ZoneInfo

    TZ_RO = ZoneInfo("Europe/Bucharest")
except Exception:
    # Fallback fără tzdata: România e mereu UTC+2 (iarna) sau UTC+3 (vara), deci
    # un offset FIX UTC+3 acoperă întotdeauna ora curentă a României (vara exact,
    # iarna cu 1h înainte — inofensiv: endpoint-ul întoarce doar datele disponibile,
    # nu și „viitorul”). NU folosi timezone.utc aici: end-ul ar fi cu 2-3h în urmă
    # față de ora României și ultimele înregistrări ar lipsi din fetch.
    TZ_RO = timezone(timedelta(hours=3))


def parse_ts(raw: str):
    # Format in file/endpoint: "08-08-2026 18:07:57" -> DD-MM-YYYY HH:MM:SS
    # We keep the wall-clock timestamp as recorded in the source (Romanian local time)
    # and store as UTC-labelled instant so the UI shows the original numbers faithfully.
    dt = datetime.strptime(raw, "%d-%m-%Y %H:%M:%S")
    dt_utc = dt.replace(tzinfo=timezone.utc)
    return dt_utc


def make_record(raw_ts: str, vals, fields=FIELDS):
    """Construiește o înregistrare tipizată dintr-un timp raw + 11 valori; None dacă invalid.

    `fields` indică ordinea în care vin valorile (xlsx: FIELDS, live: LIVE_FIELDS).
    """
    try:
        dt = parse_ts(raw_ts)
    except Exception:
        return None
    rec = {
        "t": dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "ts": int(dt.timestamp() * 1000),
    }
    for i, f in enumerate(fields):
        try:
            v = vals[i]
            if isinstance(v, str):
                # strip estimate markers like "6945*" or " - "
                v = v.replace("*", "").strip()
            rec[f] = float(v)
        except (TypeError, ValueError, IndexError):
            # Valoare lipsă / non-numerică (ex: „-”, text) → rând invalid.
            # Nu propagăm excepția: rândul e ignorat, restul datelor rămân valide.
            return None
    return rec


def read_existing():
    """Încarcă sen-data.json existent (gol dacă lipsește)."""
    if not os.path.exists(OUT_DATA):
        return []
    with open(OUT_DATA, encoding="utf-8") as f:
        return json.load(f)


def fetch_live(start: datetime, end: datetime):
    """Fetch incremental de pe endpoint-ul live Transelectrica (interval [start, end])."""
    fields = {}

    def add(prefix, dt):
        # Zero-pad pentru consistență cu buildLiveUrl din live.ts (day=08, hour=06 etc.)
        fields[f"_SENGrafic_WAR_SENGraficportlet_{prefix}_day"] = f"{dt.day:02d}"
        fields[f"_SENGrafic_WAR_SENGraficportlet_{prefix}_month"] = f"{dt.month:02d}"
        fields[f"_SENGrafic_WAR_SENGraficportlet_{prefix}_year"] = f"{dt.year:04d}"
        fields[f"_SENGrafic_WAR_SENGraficportlet_{prefix}_Hour"] = f"{dt.hour:02d}"
        fields[f"_SENGrafic_WAR_SENGraficportlet_{prefix}_Minute"] = f"{dt.minute:02d}"

    add("start", start)
    add("end", end)
    qs = "&".join(f"{k}={v}" for k, v in fields.items())
    url = f"{LIVE_URL}&{qs}"

    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"[fetch_live] eșec de rețea: {e} — întorc date goale", file=sys.stderr)
        return []
    except Exception as e:
        print(f"[fetch_live] eroare neașteptată: {e} — întorc date goale", file=sys.stderr)
        return []

    records = []
    for line in text.split("|"):
        parts = line.strip().split(";")
        if len(parts) < 12 or "-" not in parts[0]:
            continue
        rec = make_record(parts[0], parts[1:12], fields=LIVE_FIELDS)
        if rec is not None:
            records.append(rec)
    return records


def write_outputs(records):
    """Scrie sen-data.json + sen-summary.json și printează rezumatul. Nu mai apelează sys.exit."""
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_DATA, "w", encoding="utf-8") as f:
        json.dump(records, f, separators=(",", ":"))
    print(f"Wrote {OUT_DATA} ({os.path.getsize(OUT_DATA)/1024:.1f} KB)", file=sys.stderr)

    summary = build_summary(records)
    with open(OUT_SUMMARY, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUT_SUMMARY}", file=sys.stderr)

    print("\n=== Summary ===", file=sys.stderr)
    print(f"Range: {summary['start']} -> {summary['end']}", file=sys.stderr)
    print(f"Latest consum: {summary['latest']['consum']} MW", file=sys.stderr)
    print(f"Renewable share (avg): {summary['renewableShareAvg']}%", file=sys.stderr)
    print(f"Import share: {summary['balance']['importShare']}%", file=sys.stderr)
    return summary


def build_summary(records):
    def col(name):
        return [r[name] for r in records]

    def stat(name):
        c = col(name)
        return {
            "min": round(min(c), 1),
            "max": round(max(c), 1),
            "avg": round(mean(c), 1),
        }

    summary = {
        "count": len(records),
        "start": records[0]["t"],
        "end": records[-1]["t"],
        "startTs": records[0]["ts"],
        "endTs": records[-1]["ts"],
        "latest": records[-1],
        "stats": {f: stat(f) for f in FIELDS},
        "sources": SOURCES,
    }

    # Nuclearul NU e o sursă regenerabilă (e low-carbon) — exclus intenționat din RES.
    RENEWABLE = ["ape", "eolian", "foto", "biomasa"]
    avg_prod = mean(col("productie"))
    avg_renew = mean([sum(r[s] for s in RENEWABLE) for r in records])
    summary["renewableShareAvg"] = round(100 * avg_renew / avg_prod, 1) if avg_prod else 0

    # Semantica sold (confirmată pe sursa oficială: SOLD = CONS − PROD, verificat pe
    # sen-filter: CONS 4595 − PROD 5657 = −1062 = SOLD):
    #   sold > 0 (consum > producție) = IMPORT net; sold < 0 = EXPORT net.
    solds = col("sold")
    imports = [s for s in solds if s > 0]
    exports = [s for s in solds if s < 0]
    summary["balance"] = {
        "importSamples": len(imports),
        "exportSamples": len(exports),
        "importShare": round(100 * len(imports) / len(solds), 1),
        "avgImport": round(mean(imports), 1) if imports else 0,
        "avgExport": round(mean(exports), 1) if exports else 0,
        "netAvg": round(mean(solds), 1),
    }
    return summary


def refresh_from_live():
    """Modul --fetch: adaugă incremental datele noi la setul existent."""
    os.makedirs(OUT_DIR, exist_ok=True)
    existing = read_existing()
    if existing:
        existing.sort(key=lambda x: x["ts"])
        last_ts = existing[-1]["ts"]
        # tz=timezone.utc e INTENȚIONAT aici: ts-urile sunt wall-clock România etichetat
        # UTC (contract fake-UTC, vezi parse_ts/make_record), deci fromtimestamp(..., utc)
        # redă exact ora României. NU schimba pe TZ_RO — ar muta start-ul cu +2..3h și
        # fereastra ar începe DUPĂ ultima înregistrare (s-ar pierde date la fiecare refresh).
        start = datetime.fromtimestamp(last_ts / 1000, tz=timezone.utc)
    else:
        # Nu există set: luăm ultimele 7 zile.
        start = datetime.now(TZ_RO) - timedelta(days=7)
    start -= timedelta(hours=2)  # overlap pentru dedupe (datele pot întârzia)
    # Sanity-check de noapte (mai jos) trebuie să acopere garantat 00-06h ora RO:
    # intervalul zilnic [last_ts − 2h, now+1h] pornește de obicei după 04:00, deci
    # lărgim start-ul cel târziu până la miezul nopții de azi — dacă rulezi înainte
    # de 04:00, acoperă măcar 00-02h (tot noapte, foto≈0 → shift-ul tot se prinde).
    midnight = datetime.now(TZ_RO).replace(hour=0, minute=0, second=0, microsecond=0)
    start = min(start, midnight)
    # Cap superior cu marjă: TZ_RO e ora României (EEST vara / EET iarna, sau
    # fallback UTC+3), iar +1h asigură că ultima înregistrare disponibilă e inclusă.
    end = datetime.now(TZ_RO) + timedelta(hours=1)

    print(f"Fetching live [{start} -> {end}] …", file=sys.stderr)
    new_records = fetch_live(start, end)
    print(f"Fetched {len(new_records)} records", file=sys.stderr)

    # Sanity: solarul nu poate produce noaptea (0-6h); dacă fotovoltaicele „producem”
    # noaptea e un semn clar de shift de coloane — oprim și semnalăm, nu corupem datele.
    # Fereastra 00-06h (nu doar 00-04h) acoperă noaptea fizică de vară: pe datele reale,
    # primul `foto > 50` e la 06:13, max înainte de 06:00 = 13 MW.
    night = [r for r in new_records if 0 <= datetime.fromtimestamp(r["ts"] / 1000, tz=timezone.utc).hour < 6]
    if night and max(r["foto"] for r in night) > 50:
        print(
            f"[sanity] ATENȚIE: foto={max(r['foto'] for r in night):.0f} MW între 00-06h "
            f"(imposibil noaptea) — posibil shift de coloane. OPRESC actualizarea.",
            file=sys.stderr,
        )
        return

    if not new_records:
        print("No new records — keeping existing data.", file=sys.stderr)
        return

    # Merge + dedupe pe ts (datele live suprascriu eventualele duplicate vechi).
    by_ts = {r["ts"]: r for r in existing}
    for r in new_records:
        by_ts[r["ts"]] = r
    merged = sorted(by_ts.values(), key=lambda x: x["ts"])
    print(f"Merged: {len(existing)} -> {len(merged)} records", file=sys.stderr)

    if len(merged) == len(existing):
        print("No new timestamps — data already up to date.", file=sys.stderr)
        return

    write_outputs(merged)


def is_data_stale(max_age_h: float = 24.0) -> bool:
    """True dacă datele statice sunt mai vechi decât `max_age_h` ore.

    Citește doar `endTs` din `OUT_SUMMARY` (fișierul e mic). Fișier lipsă sau
    corupt → True (tratăm ca stale: la prima rulare nu există date). Folosită
    de modulul `--refresh-if-stale` (auto-refresh la pornirea dev serverului).
    Pură și deterministă — testabilă direct.
    """
    try:
        with open(OUT_SUMMARY, encoding="utf-8") as f:
            summary = json.load(f)
        end_ts = summary.get("endTs")
        # endTs NaN/Infinity (JSON corupt) ar trece de isinstance (sunt floats) și
        # ar face `age_h` non-finit → `nan > max_age_h` e False → datele ar părea
        # veșnic „proaspete" și refresh-ul n-ar mai rula niciodată. Tratăm orice
        # valoare non-finită ca stale (corupție de date) — fix TO_FIX round 2.
        if not isinstance(end_ts, (int, float)) or not math.isfinite(end_ts):
            return True
        age_h = (time.time() - end_ts / 1000) / 3600
        return age_h > max_age_h
    except (OSError, json.JSONDecodeError, AttributeError):
        return True


def refresh_if_stale(max_age_h: float = 24.0) -> None:
    """Modul `--refresh-if-stale`: aduce datele la zi dacă sunt vechi.

    Rulează exact ce fac workflow-urile GitHub (`--fetch` + `--capture-prices`),
    doar când `is_data_stale(max_age_h)` e adevărat. Dacă datele sunt proaspete,
    nu atinge rețeaua (pornire instant). Orice eroare neașteptată e prinsă și
    raportată ca warning, fără să propage exit non-zero — invariantul folosit de
    wrapper-ul `scripts/dev.sh`: un eșec al refresh-ului NU blochează pornirea
    serverului („warning, nu blocker”). Funcțiile de fetch prind deja erorile de
    rețea intern (întorc date goale fără să arunce), deci fallback-ul e dublu.
    """
    try:
        if not is_data_stale(max_age_h):
            print(f"[refresh-if-stale] Date proaspete (< {max_age_h:.0f}h) — nimic de făcut.", file=sys.stderr)
            return
        print(f"[refresh-if-stale] Date vechi (> {max_age_h:.0f}h) — aduc la zi…", file=sys.stderr)
        refresh_from_live()
        capture_prices()
        # Dacă live-ul a eșuat sau a adus doar duplicate, refresh_from_live iese
        # devreme fără să scrie — dar un sen-summary.json lipsă/corupt trebuie
        # oricum reconstruit din records-urile valide (altfel is_data_stale ar
        # rămâne True la fiecare pornire, iar /api/sen/summary ar da 500).
        ensure_summary_from_data()
    except Exception as e:  # pragma: no cover — eroare neașteptată, oricum nu blocăm
        print(f"[refresh-if-stale] AVERTIZARE: refresh eșuat ({e}) — continui cu datele existente.", file=sys.stderr)


def ensure_summary_from_data() -> None:
    """Reconstruiește OUT_SUMMARY din records-urile valide dacă e lipsă/corupt.

    Folosită de `refresh_if_stale` DUPĂ `refresh_from_live()` + `capture_prices()`:
    când live-ul eșuează (rețea) sau întoarce doar timestamps duplicate,
    `refresh_from_live` iese devreme fără să scrie nimic — dar dacă sen-data.json
    are records valide, summary-ul trebuie oricum să existe (altfel is_data_stale
    rămâne True la fiecare pornire, iar runtime-ul /api/sen/summary ar da 500).
    Invariant: nu aruncă niciodată (e apelat din try-ul lui refresh_if_stale,
    dar toleranța e dublă) — fix TO_FIX round 2.
    """
    try:
        with open(OUT_SUMMARY, encoding="utf-8") as f:
            json.load(f)
        return  # summary deja valid
    except (OSError, json.JSONDecodeError):
        pass
    try:
        existing = read_existing()
        if not existing:
            return
        summary = build_summary(existing)
        with open(OUT_SUMMARY, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(
            f"[refresh-if-stale] OUT_SUMMARY reconstruit din {len(existing)} records existente",
            file=sys.stderr,
        )
    except Exception as e:
        print(
            f"[refresh-if-stale] AVERTIZARE: nu am putut reconstrui OUT_SUMMARY ({e})",
            file=sys.stderr,
        )


# Overridable prin env pentru teste (mock server local): SEN_STORAGE_URL.
STORAGE_URL = os.environ.get("SEN_STORAGE_URL", "https://www.transelectrica.ro/sen-filter")


def load_existing_storage():
    """Încarcă seria existentă din OUT_STORAGE; tolerantă la lipsă/corupt/non-list.

    Returnează o listă (goala dacă fișierul nu există, e JSON invalid sau nu e
    o listă — nu aruncă niciodată).
    """
    if not os.path.exists(OUT_STORAGE):
        return []
    try:
        with open(OUT_STORAGE, encoding="utf-8") as f:
            existing = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"[capture_storage] fișier corupt ({e}) — pornesc de la zero", file=sys.stderr)
        return []
    if not isinstance(existing, list):
        print(
            f"[capture_storage] structură neașteptată în {OUT_STORAGE} — pornesc de la zero",
            file=sys.stderr,
        )
        return []
    return existing


def extract_ispoz(payload):
    """Extrage ISPOZ dintr-un payload `/sen-filter` (listă de {cod: valoare}).

    Returnează float ≥ 0 sau None dacă lipsește / nu e numeric / negativ /
    non-finit (NaN, Inf). Funcție pură, testabilă.
    """
    if not isinstance(payload, list):
        return None
    for pair in payload:
        if isinstance(pair, dict) and "ISPOZ" in pair:
            try:
                v = float(pair["ISPOZ"])
            except (TypeError, ValueError):
                return None
            # Reject și NaN/Inf: `nan < 0` e fals, deci un check doar pe `< 0`
            # ar lăsa valorile non-finite să treacă (extract_ispoz din TS e la fel).
            if not math.isfinite(v) or v < 0:
                return None
            return v
    return None


def merge_storage(existing, rec):
    """Merge un punct nou în seria existentă, cu dedupe pe `t` (secundă).

    Returnează (merged, changed):
    - merged: seria deduplicată pe `t` și sortată ascendent după `ts`;
    - changed: True dacă punctul aduce ceva nou — `t` nou SAU valoare ISPOZ
      diferită la același `t`. Fără comparația valorii, o rulare în aceeași
      secundă cu o valoare schimbată ar fi ignorată (early-return) și update-ul
      s-ar pierde — fix P3-003.
    """
    by_key = {}
    for r in existing:
        # Excludem record-urile cu t dar fără ts (corupte): sorted() de mai jos
        # ar crăpa cu KeyError pe r["ts"] — toleranță la fel de strictă ca
        # load_existing_storage (fix TO_FIX #5).
        if isinstance(r, dict) and "t" in r and "ts" in r:
            by_key[r["t"]] = r
    prev = by_key.get(rec["t"])
    changed = prev is None or prev.get("ispoz") != rec["ispoz"]
    by_key[rec["t"]] = rec
    merged = sorted(by_key.values(), key=lambda x: x["ts"])
    return merged, changed


def capture_storage():
    """Modul --capture-storage: prinde valoarea curentă de stocare (ISPOZ).

    Transelectrica expune stocarea doar ca snapshot (sen-filter), fără istoric.
    Construim noi istoricul: la fiecare rulare (orar, prin workflow-ul
    storage-capture.yml) citim ISPOZ și îl adăugăm cu dedupe pe ts la
    data/sen-storage.json: [{"t", "ts", "ispoz"}].

    Fallback silențios la eșec de rețea (data deja capturată rămâne); sanity:
    valoarea trebuie să fie numerică și ≥ 0, altfel ignorăm răspunsul.
    """
    os.makedirs(os.path.dirname(OUT_STORAGE) or ".", exist_ok=True)

    existing = load_existing_storage()

    req = urllib.request.Request(STORAGE_URL, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"[capture_storage] eșec de rețea: {e} — păstrez datele existente", file=sys.stderr)
        return
    except Exception as e:
        print(f"[capture_storage] eroare neașteptată: {e} — păstrez datele existente", file=sys.stderr)
        return

    try:
        # sen-filter răspunde cu o listă de obiecte {cod: valoare}:
        #   [{"KOZL115":"176"},{"ISPOZ":"30"},...]
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        print(f"[capture_storage] răspuns neașteptat ({e}) — ignor", file=sys.stderr)
        return

    ispoz = extract_ispoz(payload)
    if ispoz is None:
        print("[capture_storage] ISPOZ lipsă sau invalid — ignor payload", file=sys.stderr)
        return

    now = datetime.now(TZ_RO)
    # Contract fake-UTC (ca parse_ts/make_record pentru datele SEN): ts = epoch-ul
    # UTC al valorii t etichetate (wall-clock RO), NU instant-ul real — altfel
    # ts-ul ar fi cu 2-3h în urmă față de t (fix TO_FIX #6).
    dt = parse_ts(now.strftime("%d-%m-%Y %H:%M:%S"))
    rec = {
        "t": dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "ts": int(dt.timestamp() * 1000),
        "ispoz": ispoz,
    }

    # Dedupe pe `t` (ISO la nivel de secundă) — două rulări în aceeași secundă
    # nu trebuie să creeze duplicate vizuale (ts-urile brute diferă la ms).
    # `changed` compară și valoarea: aceeași secundă + valoare diferită = punct
    # nou (suprascrie), nu „deja la zi". Comparăm pe chei, nu pe lungime: un
    # fișier cu duplicate vechi ar umfla len(existing) și ar ascunde punctul nou
    # (sau ar lăsa duplicatele necurățate) — vezi merge_storage.
    merged, changed = merge_storage(existing, rec)

    if not changed and len(merged) == len(existing):
        print("No new storage capture — data already up to date.", file=sys.stderr)
        return

    with open(OUT_STORAGE, "w", encoding="utf-8") as f:
        json.dump(merged, f, separators=(",", ":"))
    print(f"Wrote {OUT_STORAGE} ({len(merged)} points, latest ispoz={ispoz} MW)", file=sys.stderr)


import csv as _csv


def load_existing_prices():
    """Încarcă seria existentă de prețuri din OUT_PRICES; tolerantă la lipsă/corupt/non-list.

    Returnează o listă (goală dacă fișierul nu există, e JSON invalid sau nu e
    o listă — nu aruncă niciodată), fără validare profundă a fiecărui record
    (merge_prices face curățarea la scriere).
    """
    if not os.path.exists(OUT_PRICES):
        return []
    try:
        with open(OUT_PRICES, encoding="utf-8") as f:
            existing = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"[capture_prices] fișier corupt ({e}) — pornesc de la zero", file=sys.stderr)
        return []
    if not isinstance(existing, list):
        print(
            f"[capture_prices] structură neașteptată în {OUT_PRICES} — pornesc de la zero",
            file=sys.stderr,
        )
        return []
    return existing


def parse_prices_csv(text: str):
    """Parsează CSV-ul OPCOM (PZU, raport PIP) într-o listă de prețuri orare.

    Format real (verificat live): header `Interval,Average Price [Euro/MWh],Resolution`,
    apoi un rând per interval de livrare — DOAR 24 (zilele normale). Zilele DST
    cu 23/25 de intervale sunt RESPINSE (return None): `priceForHour` indexează
    `prices[hour]` pozițional, deci un număr diferit de intervale ar decala
    prețurile cu o oră după ora sărită — mai bine „prețuri indisponibile" decât
    prețuri greșite (decizie confirmată, fix 0.3.27).
    Returnează lista de prețuri (float) în ordinea intervalelor 1..24 sau None
    dacă payload-ul e gol / header-ul lipsă / vreun preț e ne-parseabil / numărul
    de intervale ≠ 24.
    """
    rows = list(_csv.DictReader(text.splitlines()))
    if not rows:
        return None
    if "Average Price [Euro/MWh]" not in rows[0]:
        return None
    prices = []
    for row in rows:
        raw = (row.get("Average Price [Euro/MWh]") or "").strip()
        try:
            v = float(raw)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(v):
            return None
        prices.append(v)
    if len(prices) != 24:
        return None
    return prices


def fetch_prices_day(date: datetime):
    """Descarcă prețurile PZU pentru o zi calendaristică dată (wall-clock RO).

    Returnează un dict {"date", "prices", "currency"} sau None dacă payload-ul
    e gol (zi fără date publicate — de ex. viitoare), eșec de rețea sau CSV
    ne-parseabil. Fără să arunce — fallback silențios, workflow-ul reia.
    """
    url = PRICES_URL_TEMPLATE.format(
        day=f"{date.day:02d}",
        month=f"{date.month:02d}",
        year=f"{date.year:04d}",
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"[capture_prices] eșec de rețea la {date.date()}: {e} — sar peste zi", file=sys.stderr)
        return None
    except Exception as e:
        print(
            f"[capture_prices] eroare neașteptată la {date.date()}: {e} — sar peste zi",
            file=sys.stderr,
        )
        return None

    prices = parse_prices_csv(text)
    if prices is None:
        # Payload gol (zi viitoare / nedisponibilă) sau format neașteptat — skip.
        print(f"[capture_prices] {date.date()}: payload gol sau ne-parseabil — skip", file=sys.stderr)
        return None
    return {
        "date": date.strftime("%Y-%m-%d"),
        "prices": prices,
        "currency": "EUR",
    }


def _valid_price_record(r):
    """True dacă un record de prețuri e valid pentru merge.

    Respinge record-uri malformate care ar crăpa la sortare sau ar polua
    data/sen-prices.json: date non-string (ex: None), prețuri ne-numerice sau
    non-finite (NaN/Inf). Fără validare, sorted(key=lambda x: x["date"]) ar
    arunca TypeError la date: None (fix TO_FIX F6).
    """
    return (
        isinstance(r, dict)
        and isinstance(r.get("date"), str)
        and isinstance(r.get("prices"), list)
        and all(isinstance(p, (int, float)) and math.isfinite(p) for p in r["prices"])
    )


def merge_prices(existing, day):
    """Merge o zi de prețuri în seria existentă, cu dedupe/suprascriere pe `date`.

    Returnează (merged, changed):
    - merged: lista deduplicată pe `date` (ziua nouă o suprascrie pe cea veche)
      și sortată ascendent după dată;
    - changed: True dacă ziua aduce o valoare nouă (zi nouă SAU prețuri diferite
      la aceeași dată — OPCOM poate publica prețuri revizuite).

    Record-urile existente malformate sunt EXCLUSE (vezi `_valid_price_record`),
    fără crash — nu blochează captura pentru datele valide.
    """
    by_date = {}
    for r in existing:
        if _valid_price_record(r):
            by_date[r["date"]] = r
    prev = by_date.get(day["date"])
    changed = prev is None or prev.get("prices") != day["prices"]
    by_date[day["date"]] = day
    merged = sorted(by_date.values(), key=lambda x: x["date"])
    return merged, changed


def capture_prices():
    """Modul --capture-prices: descarcă prețurile PZU (OPCOM) pentru ultimele zile.

    Prețurile day-ahead (PZU) sunt publice pe opcom.ro ca export CSV per zi de
    livrare (fără cheie, fără înregistrare — la fel cum Transelectrica expune
    widget-ul SEN). La fiecare rulare (zilnic, prin workflow-ul price-capture.yml)
    descărcăm ultimele PRICES_BACKFILL_DAYS zile și le scriem cu dedupe pe dată
    în data/sen-prices.json: [{"date", "prices": [...], "currency": "EUR"}].

    Backfill-ul larg (35 zile) e intenționat: acoperă preset-ul de 30 de zile al
    dashboard-ului + marjă, e indempotent (suprascrie aceleași date) și e ieftin
    (~35 requesturi mici de ~600B pe rulare zilnică).

    Fallback silențios la eșec de rețea / zi fără date (datele existente rămân);
    un eșec REAL (eroare de scriere) iese non-zero → vizibil în Actions.
    """
    os.makedirs(os.path.dirname(OUT_PRICES) or ".", exist_ok=True)

    existing = load_existing_prices()
    today = datetime.now(TZ_RO)
    merged = list(existing)
    changed_any = False

    for offset in range(PRICES_BACKFILL_DAYS):
        day = today - timedelta(days=offset)
        rec = fetch_prices_day(day)
        if rec is None:
            continue
        merged, changed = merge_prices(merged, rec)
        if changed:
            changed_any = True

    if not changed_any:
        print("No new prices — data already up to date.", file=sys.stderr)
        return

    with open(OUT_PRICES, "w", encoding="utf-8") as f:
        json.dump(merged, f, separators=(",", ":"))
    print(
        f"Wrote {OUT_PRICES} ({len(merged)} days, latest {merged[-1]['date'] if merged else '-'})",
        file=sys.stderr,
    )


def convert_from_xlsx():
    """Modul implicit (data:convert): rebuild complet din upload/Grafic_SEN.xlsx."""
    import openpyxl  # lazy: necesar doar pentru modul xlsx (--fetch e stdlib-only)

    os.makedirs(OUT_DIR, exist_ok=True)
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["Grafic SEN"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    print("Header:", header, file=sys.stderr)

    records = []
    for r in rows[1:]:
        raw_ts = r[0]
        if not isinstance(raw_ts, str) or "-" not in raw_ts:
            continue
        vals = r[1:12]
        if any(v is None for v in vals):
            continue
        rec = make_record(raw_ts, vals)
        if rec is not None:
            records.append(rec)

    # Sort ascending by timestamp (file is descending)
    records.sort(key=lambda x: x["ts"])
    print(f"Parsed {len(records)} records", file=sys.stderr)
    if not records:
        print("No records parsed!", file=sys.stderr)
        sys.exit(1)

    write_outputs(records)


if __name__ == "__main__":
    if "--capture-storage" in sys.argv:
        capture_storage()
    elif "--capture-prices" in sys.argv:
        capture_prices()
    elif "--refresh-if-stale" in sys.argv:
        refresh_if_stale()
    elif "--fetch" in sys.argv:
        refresh_from_live()
    else:
        convert_from_xlsx()
