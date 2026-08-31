"use client";

import { useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import { buttonClasses } from "@/packages/ui";

/**
 * Client-side export delivery: the server renders the page with the full
 * export object; this component only serializes/downloads it in the browser.
 */
export function DownloadButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  function download() {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raktsetu-data-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={download} className={buttonClasses("primary", "sm")}>
        <Download className="size-4" aria-hidden />
        Download JSON
      </button>
      <button type="button" onClick={copy} className={buttonClasses("secondary", "sm")}>
        {copied ? (
          <Check className="size-4 text-teal-700" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        {copied ? "Copied" : "Copy to clipboard"}
      </button>
    </div>
  );
}
