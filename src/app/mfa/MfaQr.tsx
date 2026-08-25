"use client";

import { QRCodeSVG } from "qrcode.react";

/** Authenticator provisioning QR (client-only; qrcode.react needs the DOM). */
export function MfaQr({ uri }: { uri: string }) {
  return (
    <div className="inline-block rounded-xl border border-ink/10 bg-white p-3">
      <QRCodeSVG value={uri} size={180} marginSize={1} aria-label="Authenticator QR code" />
    </div>
  );
}
