#!/usr/bin/env python3
"""Convert Grafic_SEN.xlsx -> data/sen-data.json (typed, ascending by date).

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
from datetime import datetime, timezone
from statistics import mean

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "upload", "Grafic_SEN.xlsx")
OUT_DIR = os.path.join(ROOT, "data")
OUT_DATA = os.path.join(OUT_DIR, "sen-data.json")
OUT_SUMMARY = os.path.join(OUT_DIR, "sen-summary.json")

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

SOURCES = ["carbune", "hidrocarburi", "ape", "nuclear", "eolian", "foto", "biomasa"]


def parse_ts(raw: str):
    # Format in file: "08-08-2026 18:07:57" -> DD-MM-YYYY HH:MM:SS
    # We keep the wall-clock timestamp as recorded in the source (Romanian local time)
    # and store as UTC-labelled instant so the UI shows the original numbers faithfully.
    dt = datetime.strptime(raw, "%d-%m-%Y %H:%M:%S")
    dt_utc = dt.replace(tzinfo=timezone.utc)
    return dt_utc


def main():
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
        try:
            dt = parse_ts(raw_ts)
        except Exception:
            continue
        vals = r[1:12]
        if any(v is None for v in vals):
            continue
        rec = {
            "t": dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "ts": int(dt.timestamp() * 1000),
        }
        for i, f in enumerate(FIELDS):
            v = vals[i]
            if isinstance(v, str):
                # strip estimate markers like "6945*" or " - "
                v = v.replace("*", "").strip()
            rec[f] = float(v)
        records.append(rec)

    # Sort ascending by timestamp (file is descending)
    records.sort(key=lambda x: x["ts"])
    print(f"Parsed {len(records)} records", file=sys.stderr)
    if not records:
        print("No records parsed!", file=sys.stderr)
        sys.exit(1)

    with open(OUT_DATA, "w", encoding="utf-8") as f:
        json.dump(records, f, separators=(",", ":"))
    print(f"Wrote {OUT_DATA} ({os.path.getsize(OUT_DATA)/1024:.1f} KB)", file=sys.stderr)

    # ---- Summary statistics ----
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

    solds = col("sold")
    imports = [s for s in solds if s < 0]
    exports = [s for s in solds if s > 0]
    summary["balance"] = {
        "importSamples": len(imports),
        "exportSamples": len(exports),
        "importShare": round(100 * len(imports) / len(solds), 1),
        "avgImport": round(mean(imports), 1) if imports else 0,
        "avgExport": round(mean(exports), 1) if exports else 0,
        "netAvg": round(mean(solds), 1),
    }

    with open(OUT_SUMMARY, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUT_SUMMARY}", file=sys.stderr)

    print("\n=== Summary ===", file=sys.stderr)
    print(f"Range: {summary['start']} -> {summary['end']}", file=sys.stderr)
    print(f"Latest consum: {summary['latest']['consum']} MW", file=sys.stderr)
    print(f"Renewable share (avg): {summary['renewableShareAvg']}%", file=sys.stderr)
    print(f"Import share: {summary['balance']['importShare']}%", file=sys.stderr)


if __name__ == "__main__":
    main()
