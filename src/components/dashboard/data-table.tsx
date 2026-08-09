"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SOURCE_ORDER, SOURCES } from "@/lib/sen/constants";
import { formatDateTime, formatNumber, formatSigned } from "@/lib/sen/format";
import type { SourceField } from "@/lib/sen/types";

/** Tip minimal folosit de tabel — compatibil cu SenReading și AggregatedPoint. */
type TableRowLike = {
  t: string;
  ts: number;
  consum: number;
  productie: number;
  sold: number;
} & Record<SourceField, number>;

interface DataTableProps {
  readings: TableRowLike[];
}

/**
 * Tabel cu cele mai recente înregistrări brute (10-min). Scrollabil cu
 * înălțime maximă și badge-uri colorate pentru starea soldului.
 */
export function DataTable({ readings }: DataTableProps) {
  // Cele mai recente primele, max 200 rânduri
  const rows = [...readings].sort((a, b) => b.ts - a.ts).slice(0, 200);

  return (
    <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="h-9 text-xs">Data</TableHead>
            <TableHead className="h-9 text-right text-xs">Consum</TableHead>
            <TableHead className="h-9 text-right text-xs">Producție</TableHead>
            <TableHead className="h-9 text-right text-xs">Sold</TableHead>
            {SOURCE_ORDER.map((f) => (
              <TableHead key={f} className="h-9 text-right text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: SOURCES[f].color }}
                    aria-hidden
                  />
                  {SOURCES[f].label}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            // Semantica sold: sold > 0 = import, sold < 0 = export.
            const isImport = r.sold > 0;
            const isExport = r.sold < 0;
            return (
              <TableRow
                key={r.ts}
                className="border-border/50 text-xs transition-colors hover:bg-accent/40"
              >
                <TableCell className="whitespace-nowrap font-mono text-muted-foreground tabular-nums">
                  {formatDateTime(r.t, { withYear: true })}
                </TableCell>
                <TableCell className="text-right font-mono font-medium tabular-nums">
                  {formatNumber(r.consum)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium tabular-nums">
                  {formatNumber(r.productie)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={`gap-1 font-mono tabular-nums ${
                      isImport
                        ? "border-red-500/40 bg-red-500/10 text-red-500"
                        : isExport
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    {isImport ? (
                      <ArrowDownToLine className="h-3 w-3" />
                    ) : isExport ? (
                      <ArrowUpFromLine className="h-3 w-3" />
                    ) : null}
                    {formatSigned(r.sold)}
                  </Badge>
                </TableCell>
                {SOURCE_ORDER.map((f) => (
                  <TableCell
                    key={f}
                    className="text-right font-mono tabular-nums text-muted-foreground"
                  >
                    {formatNumber(r[f])}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4 + SOURCE_ORDER.length}
                className="py-8 text-center text-muted-foreground"
              >
                Nicio înregistrare în intervalul selectat
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
