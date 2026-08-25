"use client";

import { useMemo, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import type { ComponentOption } from "../types";

/**
 * Barcode/QR-first unit selection.
 * A scanner types into the input and "Enter" (or an exact match as you type)
 * selects the unit — no dropdown hunting. Falls back to a filtered select.
 */
export function ScanOrSelect({
  id,
  name,
  options,
  label,
  pickPlaceholder,
}: {
  id: string;
  name: string;
  options: ComponentOption[];
  label: string;
  pickPlaceholder: string;
}) {
  const d = getDictionary();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);

  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(normalized) ||
        o.label.toLowerCase().includes(normalized)
    );
  }, [options, normalized]);

  const exact =
    options.find((o) => o.value.toLowerCase() === normalized) ??
    options.find((o) => o.label.toLowerCase().endsWith(normalized) && normalized.length >= 4);

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
            }}
            placeholder={d.staff.scanInputPlaceholder}
            className="rs-input w-full pl-9"
          />
        </div>
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
          defaultValue=""
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
