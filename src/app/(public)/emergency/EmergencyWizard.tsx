"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ShieldCheck } from "lucide-react";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  buttonClasses,
} from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { BLOOD_GROUPS } from "@/packages/schemas/events";
import {
  requestEmergencyOtpAction,
  verifyEmergencyOtpAction,
  createEmergencyRequestAction,
  type EmergencyOtpState,
  type EmergencyVerifyState,
} from "./actions";

const EMERGENCY_COMPONENTS = ["RBC", "WHOLE_BLOOD", "PLASMA", "PLATELET"] as const;
const URGENCIES = ["EMERGENCY", "URGENT", "ROUTINE"] as const;

type Step = "details" | "otp";

export function EmergencyWizard() {
  const d = getDictionary();
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  const [form, setForm] = useState({
    componentType: "RBC",
    bloodGroup: "O+",
    unitsRequested: 1,
    urgency: "EMERGENCY",
    hospitalName: "",
    city: "",
    latitude: "",
    longitude: "",
    contactName: "",
    contactPhone: "",
  });
  const [code, setCode] = useState("");
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [locating, setLocating] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const detailsComplete = useMemo(
    () =>
      form.hospitalName.trim().length >= 2 &&
      form.city.trim().length >= 2 &&
      form.contactName.trim().length >= 2 &&
      form.contactPhone.trim().length >= 6 &&
      locationCaptured &&
      Number(form.latitude) !== 0,
    [form, locationCaptured]
  );

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(4),
          longitude: pos.coords.longitude.toFixed(4),
        }));
        setLocationCaptured(true);
        setLocating(false);
      },
      () => {
        setLocationCaptured(false);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }

  function manualLocation() {
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      setLocationCaptured(true);
    }
  }

  function goToOtp() {
    if (!detailsComplete) {
      setErrorKey("emergency.errValidation");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const result: EmergencyOtpState = await requestEmergencyOtpAction(form.contactPhone);
      if (!result.ok) {
        setErrorKey(result.messageKey ?? "emergency.errGeneric");
        return;
      }
      if (result.devCode) setDevCode(result.devCode);
      setStep("otp");
    });
  }

  function verifyOtp() {
    setErrorKey(null);
    startTransition(async () => {
      const result: EmergencyVerifyState = await verifyEmergencyOtpAction(form.contactPhone, code);
      if (!result.ok || !result.verificationToken) {
        setErrorKey(result.messageKey ?? "emergency.otpInvalid");
        return;
      }
      setVerificationToken(result.verificationToken);
      // Token verified → create the request and move to the live status page.
      const created = await createEmergencyRequestAction({
        ...form,
        unitsRequested: Number(form.unitsRequested),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        verificationToken: result.verificationToken,
      });
      if (!created.ok || !created.publicToken) {
        setErrorKey(created.messageKey ?? "emergency.errGeneric");
        setStep("details");
        return;
      }
      router.push(`/emergency/${created.publicToken}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{step === "details" ? d.emergency.formTitle : d.emergency.otpStepTitle}</CardTitle>
        <p className="mt-1 text-sm text-ink-soft">
          {step === "details" ? d.emergency.formIntro : d.emergency.otpIntro}
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        {errorKey ? (
          <Alert type="error">{translateKey(errorKey)}</Alert>
        ) : null}
        {devCode && step === "otp" ? (
          <Alert type="info">{d.emergency.otpDevCode.replace("{code}", devCode)}</Alert>
        ) : null}

        {step === "details" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="em-component">{d.emergency.labelComponentType}</Label>
                <Select
                  id="em-component"
                  value={form.componentType}
                  onChange={(e) => set("componentType", e.target.value)}
                >
                  {EMERGENCY_COMPONENTS.map((c) => (
                    <option key={c} value={c}>
                      {d.components[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="em-group">{d.emergency.labelBloodGroup}</Label>
                <Select id="em-group" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
                  {BLOOD_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="em-units">{d.emergency.labelUnits}</Label>
                <Input
                  id="em-units"
                  type="number"
                  min={1}
                  max={10}
                  value={form.unitsRequested}
                  onChange={(e) => set("unitsRequested", Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="em-urgency">{d.emergency.labelUrgency}</Label>
                <Select id="em-urgency" value={form.urgency} onChange={(e) => set("urgency", e.target.value)}>
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {d.requests[`urgency${u}` as keyof typeof d.requests] as string}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-ink-faint">{d.emergency.urgencyNote}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="em-hospital">{d.emergency.labelHospital}</Label>
                <Input
                  id="em-hospital"
                  value={form.hospitalName}
                  onChange={(e) => set("hospitalName", e.target.value)}
                  maxLength={160}
                  required
                />
              </div>
              <div>
                <Label htmlFor="em-city">{d.emergency.labelCity}</Label>
                <Input id="em-city" value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={80} required />
              </div>
            </div>

            <fieldset className="rounded-xl border border-ink/10 p-4">
              <legend className="px-1 text-sm font-medium text-ink">{d.emergency.labelLocation}</legend>
              <button
                type="button"
                onClick={useMyLocation}
                className="flex items-center gap-1.5 rounded-lg border border-teal-600/40 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100"
              >
                <MapPin className="size-4" aria-hidden />
                {locating ? d.common.loading : d.emergency.useMyLocation}
              </button>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="em-lat">Latitude</Label>
                  <Input
                    id="em-lat"
                    type="number"
                    step="0.0001"
                    value={form.latitude}
                    onChange={(e) => {
                      set("latitude", e.target.value);
                      setLocationCaptured(false);
                    }}
                    onBlur={manualLocation}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="em-lng">Longitude</Label>
                  <Input
                    id="em-lng"
                    type="number"
                    step="0.0001"
                    value={form.longitude}
                    onChange={(e) => {
                      set("longitude", e.target.value);
                      setLocationCaptured(false);
                    }}
                    onBlur={manualLocation}
                    required
                  />
                </div>
              </div>
              {locationCaptured ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-teal-700">
                  <ShieldCheck className="size-3.5" aria-hidden /> {d.emergency.locationSet}
                </p>
              ) : (
                <p className="mt-2 text-xs text-crimson-700">{d.emergency.locationMissing}</p>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="em-contact-name">{d.emergency.labelContactName}</Label>
                <Input
                  id="em-contact-name"
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                  maxLength={80}
                  required
                />
              </div>
              <div>
                <Label htmlFor="em-contact-phone">{d.emergency.labelContactPhone}</Label>
                <Input
                  id="em-contact-phone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  placeholder="+9198xxxxxxxx"
                  maxLength={20}
                  required
                />
              </div>
            </div>

            <button
              type="button"
              onClick={goToOtp}
              disabled={pending}
              className={buttonClasses("primary", "md", "w-full")}
            >
              {pending ? d.common.loading : d.emergency.otpSend}
            </button>
            <p className="text-xs leading-relaxed text-ink-faint">{d.emergency.privacyNote}</p>
          </>
        ) : (
          <>
            <div className="max-w-48">
              <Label htmlFor="em-otp">{d.emergency.otpCodeLabel}</Label>
              <Input
                id="em-otp"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={verifyOtp}
                disabled={pending || code.length !== 6}
                className={buttonClasses("primary", "md")}
              >
                {pending ? d.emergency.submitting : d.emergency.submit}
              </button>
              <button
                type="button"
                onClick={goToOtp}
                disabled={pending}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5"
              >
                {d.emergency.otpResend}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-ink-faint">{d.emergency.privacyNote}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** Client-side i18n: resolve a dictionary key with no params. */
function translateKey(key: string): string {
  const d = getDictionary() as unknown as Record<string, unknown>;
  let node: unknown = d;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}
