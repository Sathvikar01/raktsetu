"use client";

import { useState, useTransition } from "react";
import { Alert, Input, Label, Select, Badge, buttonClasses } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE, translate } from "@/i18n";
import { readCsrfCookie } from "@/components/site/Csrf";
import { BLOOD_GROUPS } from "@/packages/schemas/events";
import {
  requestDonorPhoneOtpAction,
  verifyDonorPhoneOtpAction,
  saveDonorNetworkProfileAction,
  withdrawFromDonorNetworkAction,
} from "../actions";
import type { DonorNetworkProfileView } from "@/lib/services/donor-network";

/**
 * Donor network onboarding + controls: blood group, location, availability
 * pause, notification radius, last donation date, and phone (OTP-verified).
 * Radius options mirror NOTIFY_RADIUS_KM_OPTIONS in donor-network.ts —
 * inlined here because that module is server-only.
 */
const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100];

export function DonorNetworkForm({
  profile,
}: {
  profile: DonorNetworkProfileView | null;
}) {
  const d = getDictionary();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [phoneChanging, setPhoneChanging] = useState(false);

  const [bloodGroup, setBloodGroup] = useState(profile?.bloodGroup ?? "");
  const [locationLabel, setLocationLabel] = useState(profile?.locationLabel ?? "");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [available, setAvailable] = useState(profile?.available ?? true);
  const [radius, setRadius] = useState(String(profile?.notifyRadiusKm ?? 15));
  const [lastDonationDate, setLastDonationDate] = useState(
    profile?.lastDonationAt ? profile.lastDonationAt.toISOString().slice(0, 10) : ""
  );
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  function noteFrom(messageKey: string | undefined, ok: boolean) {
    setNote({ ok, text: translate(DEFAULT_LOCALE, messageKey ?? "common.errorGeneric") });
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(4));
        setLongitude(pos.coords.longitude.toFixed(4));
        setLocationCaptured(true);
      },
      () => setLocationCaptured(false),
      { timeout: 8000 }
    );
  }

  function sendOtp() {
    setNote(null);
    startTransition(async () => {
      const result = await requestDonorPhoneOtpAction(readCsrfCookie(), phone);
      if (!result.ok) return noteFrom(result.messageKey, false);
      if (result.devCode) setDevCode(result.devCode);
      setNote({ ok: true, text: d.common.loading });
    });
  }

  function verifyOtp() {
    setNote(null);
    startTransition(async () => {
      const result = await verifyDonorPhoneOtpAction(readCsrfCookie(), phone, code);
      if (!result.ok || !result.verificationToken) return noteFrom(result.messageKey, false);
      setVerificationToken(result.verificationToken);
      setNote({ ok: true, text: d.emergency.otpVerified });
    });
  }

  function save() {
    setNote(null);
    startTransition(async () => {
      const result = await saveDonorNetworkProfileAction({
        csrfToken: readCsrfCookie(),
        bloodGroup: bloodGroup || null,
        locationLabel: locationLabel || null,
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
        available,
        notifyRadiusKm: Number(radius),
        lastDonationDate: lastDonationDate || null,
        phone: phoneChanging && verificationToken ? phone : undefined,
        phoneVerificationToken: phoneChanging ? verificationToken : undefined,
      });
      if (result.ok) {
        setPhoneChanging(false);
        setVerificationToken(null);
        setDevCode(null);
      }
      return noteFrom(result.messageKey, result.ok);
    });
  }

  function withdraw() {
    if (!window.confirm(d.donor.networkWithdrawConfirm)) return;
    setNote(null);
    startTransition(async () => {
      const result = await withdrawFromDonorNetworkAction(readCsrfCookie());
      return noteFrom(result.messageKey, result.ok);
    });
  }

  return (
    <div className="space-y-4">
      {note ? <Alert type={note.ok ? "success" : "error"}>{note.text}</Alert> : null}
      {devCode ? <Alert type="info">{d.emergency.otpDevCode.replace("{code}", devCode)}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={profile?.available ? "teal" : "amber"}>
          {profile?.available ? d.donor.networkAvailable : d.donor.networkPaused}
        </Badge>
        {profile?.phoneVerified ? (
          <Badge tone="outline">
            {d.donor.networkPhoneVerified.replace("{phone}", profile.phoneMasked ?? "")}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="net-group">{d.donor.networkBloodGroup}</Label>
          <Select id="net-group" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
            <option value="">—</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="net-radius">{d.donor.networkNotifyRadius}</Label>
          <div className="flex items-center gap-2">
            <Select id="net-radius" value={radius} onChange={(e) => setRadius(e.target.value)}>
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} {d.donor.networkNotifyRadiusUnit}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="net-label">{d.donor.networkLocationLabel}</Label>
          <Input
            id="net-label"
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            placeholder={d.donor.networkLocationLabelPlaceholder}
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="net-last">{d.donor.networkLastDonation}</Label>
          <Input
            id="net-last"
            type="date"
            value={lastDonationDate}
            onChange={(e) => setLastDonationDate(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="rounded-xl border border-ink/10 p-4">
        <legend className="px-1 text-sm font-medium text-ink">{d.emergency.labelLocation}</legend>
        <button
          type="button"
          onClick={useMyLocation}
          className="rounded-lg border border-teal-600/40 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100"
        >
          {d.donor.networkUseMyLocation}
        </button>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="net-lat">{d.donor.networkLatitude}</Label>
            <Input
              id="net-lat"
              type="number"
              step="0.0001"
              value={latitude || ""}
              onChange={(e) => {
                setLatitude(e.target.value);
                setLocationCaptured(false);
              }}
            />
          </div>
          <div>
            <Label htmlFor="net-lng">{d.donor.networkLongitude}</Label>
            <Input
              id="net-lng"
              type="number"
              step="0.0001"
              value={longitude || ""}
              onChange={(e) => {
                setLongitude(e.target.value);
                setLocationCaptured(false);
              }}
            />
          </div>
        </div>
        {locationCaptured ? <p className="mt-2 text-xs text-teal-700">{d.donor.networkLocationCaptured}</p> : null}
      </fieldset>

      <fieldset className="rounded-xl border border-ink/10 p-4">
        <legend className="px-1 text-sm font-medium text-ink">{d.donor.networkPhoneLabel}</legend>
        {!phoneChanging ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">
              {profile?.phoneVerified ? profile.phoneMasked : d.donor.networkPhoneNone}
            </p>
            <button
              type="button"
              onClick={() => setPhoneChanging(true)}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-ink/5"
            >
              {profile?.phoneVerified ? d.donor.networkPhoneChange : d.donor.networkJoinCta}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-w-xs">
              <Label htmlFor="net-phone">{d.donor.networkPhoneLabel}</Label>
              <Input id="net-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="+9198xxxxxxxx" />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={sendOtp}
                disabled={pending || phone.trim().length < 6}
                className={buttonClasses("secondary", "sm")}
              >
                {d.donor.networkOtpSend}
              </button>
              <div className="w-32">
                <Label htmlFor="net-code">{d.donor.networkOtpCodeLabel}</Label>
                <Input id="net-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              <button
                type="button"
                onClick={verifyOtp}
                disabled={pending || code.length !== 6}
                className={buttonClasses("secondary", "sm")}
              >
                {d.donor.networkOtpVerify}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhoneChanging(false);
                  setVerificationToken(null);
                  setDevCode(null);
                }}
                className="text-sm text-ink-faint underline-offset-4 hover:underline"
              >
                {d.common.cancel}
              </button>
            </div>
            {verificationToken ? <p className="text-xs text-teal-700">{d.emergency.otpVerified}</p> : null}
          </div>
        )}
      </fieldset>

      <label htmlFor="net-available" className="flex items-center gap-3 text-sm text-ink-soft">
        <input
          id="net-available"
          type="checkbox"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
          className="size-4 rounded border-ink/30 accent-teal-600"
        />
        {d.donor.networkAvailable}
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={buttonClasses("primary", "md")}
        >
          {pending ? d.common.loading : d.donor.networkSave}
        </button>
        {profile?.onboardedAt ? (
          <button
            type="button"
            onClick={withdraw}
            disabled={pending}
            className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 hover:bg-crimson-50"
          >
            {d.donor.networkWithdraw}
          </button>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-ink-faint">{d.donor.networkIntro}</p>
    </div>
  );
}
