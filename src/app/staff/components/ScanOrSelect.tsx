"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import type { ComponentOption } from "../types";
import { resolveScanAction } from "../actions";

/**
 * Barcode/QR-first unit selection.
 * A scanner types into the input and "Enter" (or an exact match as you type)
 * selects the unit — no dropdown hunting. Falls back to a filtered select.
 *
 * Resolution is SERVER-SIDE first: when the typed code does not match the
 * preloaded options, resolveScanAction() looks the unit up in the database
 * (same tenant predicates as ingestion), so scans of units outside the last-N
 * preload window still work instead of silently failing.
 */
export function ScanOrSelect({
  id,
  name,
  options,
  label,
  pickPlaceholder,
  organizationId,
  scope,
}: {
  id: string;
  name: string;
  options: ComponentOption[];
  label: string;
  pickPlaceholder: string;
  organizationId: string;
  scope: "transfer" | "hospital";
}) {
  const d = getDictionary();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [remote, setRemote] = useState<ComponentOption | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  const normalized = query.trim().toLowerCase();
  const allOptions = useMemo(
    () => (remote && !options.some((o) => o.value === remote.value) ? [remote, ...options] : options),
    [remote, options]
  );

  const matches = useMemo(() => {
    if (!normalized) return allOptions;
    return allOptions.filter(
      (o) =>
        o.value.toLowerCase().includes(normalized) ||
        o.label.toLowerCase().includes(normalized)
    );
  }, [allOptions, normalized]);

  const exact =
    allOptions.find((o) => o.value.toLowerCase() === normalized) ??
    allOptions.find((o) => o.label.toLowerCase().endsWith(normalized) && normalized.length >= 4);

  // Server-side resolution for codes the preloaded list does not know.
  useEffect(() => {
    let cancelled = false;
    if (exact || normalized.length < 4) {
      setLookupFailed(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await resolveScanAction({ organizationId, code: query.trim(), scope });
        if (cancelled) return;
        if (res.ok && res.option) {
          setRemote(res.option);
          setSelected(res.option.value);
          setLookupFailed(false);
        } else {
          setLookupFailed(true);
        }
      } catch {
        if (!cancelled) setLookupFailed(true);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, organizationId, scope]);

  if (exact && exact.value !== selected) {
    // Scanner input resolved to exactly one unit — select it automatically.
    setSelected(exact.value);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />
      <div>
        <Label htmlFor={`${id}-scan`}>{d.staff.scanInputLabel}</Label>
        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            id={`${id}-scan`}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected("");
              setRemote(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Enter is part of the scan gesture, not a form submission —
                // give server-side resolution a beat instead of posting early.
                e.preventDefault();
              }
            }}
            placeholder={d.staff.scanInputPlaceholder}
            className="rs-input w-full pl-9"
          />
        </div>
        {lookupFailed && !selected ? (
          <p className="mt-1 text-xs text-ink-faint">{d.staff.scanNoMatch}</p>
        ) : null}
        {selected ? (
          <p className="mt-1 text-xs font-medium text-teal-700">{d.staff.scanMatched}</p>
        ) : null}
      </div>
      <div>
        <Label htmlFor={id}>{label}</Label>
        <Select
          ref={selectRef}
          id={id}
          required
          value={selected || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            {pickPlaceholder}
          </option>
          {matches.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
