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
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from statistics import mean

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "upload", "Grafic_SEN.xlsx")
OUT_DIR = os.path.join(ROOT, "data")
OUT_DATA = os.path.join(OUT_DIR, "sen-data.json")
OUT_SUMMARY = os.path.join(OUT_DIR, "sen-summary.json")

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
LIVE_URL = (
    "https://www.transelectrica.ro/widget/web/tel/sen-grafic"
    "?p_p_id=SENGrafic_WAR_SENGraficportlet"
    "&p_p_lifecycle=2&p_p_state=maximized&p_p_mode=view"
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
    if "--fetch" in sys.argv:
        refresh_from_live()
    else:
        convert_from_xlsx()
