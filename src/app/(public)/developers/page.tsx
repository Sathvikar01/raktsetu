import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound, PlugZap, Workflow } from "lucide-react";
import { EVENT_TYPES } from "@/packages/schemas/events";
import { getDictionary } from "@/i18n";
import { Alert, buttonClasses, SectionHeading, TBody, TD, TH, THead, TR, Table } from "@/packages/ui";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.devTitle, description: d.public.devIntro };
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-[13px] leading-relaxed text-teal-50">
      <code>{children}</code>
    </pre>
  );
}

const CURL_SAMPLE = `TIMESTAMP=$(date +%s)
BODY='{
  "external_event_id": "bb-a-000123",
  "donation_identifier": "BB-A-D0001",
  "identifier_scheme": "FACILITY_BARCODE",
  "event_type": "DONATION_COLLECTED",
  "occurred_at": "2026-08-23T09:30:00Z",
  "verification_status": "VERIFIED"
}'
SIGNATURE=$(printf '%s.%s' "$TIMESTAMP" "$BODY" \\
  | openssl dgst -sha256 -hmac "$PARTNER_SECRET" -hex \\
  | sed 's/^.* //')

curl -X POST "$RAKTSETU_HOST/api/v1/events" \\
  -H "Content-Type: application/json" \\
  -H "X-RaktSetu-Key: $PARTNER_KEY_ID" \\
  -H "X-RaktSetu-Timestamp: $TIMESTAMP" \\
  -H "X-RaktSetu-Signature: $SIGNATURE" \\
  -d "$BODY"`;

const ADAPTER_EXCERPT = `// src/packages/integrations — BloodSystemAdapter
export interface NormalizedEvent {
  externalEventId: string;
  donationIdentifier?: string;
  componentIdentifier?: string;
  identifierScheme: "INTERNAL_UUID" | "ISBT128_DIN"
    | "FACILITY_BARCODE" | "ERAKTKOSH_ID" | "HOSPITAL_LOCAL";
  eventType: EventType;              // closed catalog
  occurredAt: string;                // ISO-8601
  facilityCode?: string;
  verificationStatus: "VERIFIED" | "PENDING";
}

export interface BloodSystemAdapter {
  name: string;
  fetchEvents(since: Date): Promise<NormalizedEvent[]>;
}`;

const HEADERS = [
  { name: "X-RaktSetu-Key", descKey: "headerKey" },
  { name: "X-RaktSetu-Timestamp", descKey: "headerTimestamp" },
  { name: "X-RaktSetu-Signature", descKey: "headerSignature" },
] as const;

export default function DevelopersPage() {
  const d = getDictionary();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.devKicker}
        title={d.public.devTitle}
        body={d.public.devIntro}
      />

      {/* Quickstart */}
      <section aria-labelledby="endpoint-heading" className="mt-14">
        <h2 id="endpoint-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
          <PlugZap className="size-5 text-teal-600" aria-hidden />
          {d.public.devEndpointTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.devEndpointDesc}</p>
      </section>

      <section aria-labelledby="headers-heading" className="mt-10">
        <h2 id="headers-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
          <KeyRound className="size-5 text-teal-600" aria-hidden />
          {d.public.devHeadersTitle}
        </h2>
        <div className="mt-4">
          <Table caption={d.public.devHeadersTitle}>
            <THead>
              <TR>
                <TH className="w-64">Header</TH>
                <TH>Value</TH>
              </TR>
            </THead>
            <TBody>
              {HEADERS.map((h) => (
                <TR key={h.name}>
                  <TD>
                    <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px] font-semibold text-teal-700">
                      {h.name}
                    </code>
                  </TD>
                  <TD>{d.public[h.descKey]}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="sample-heading" className="mt-10">
        <h2 id="sample-heading" className="text-lg font-semibold tracking-tight text-ink">
          {d.public.devSampleTitle}
        </h2>
        <div className="mt-4">
          <CodeBlock>{CURL_SAMPLE}</CodeBlock>
        </div>
      </section>

      {/* Event catalog */}
      <section aria-labelledby="catalog-heading" className="mt-14">
        <h2 id="catalog-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
          <Workflow className="size-5 text-teal-600" aria-hidden />
          {d.public.devCatalogTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.devCatalogIntro}</p>
        <div className="mt-6">
          <Table caption={d.public.devCatalogTitle}>
            <THead>
              <TR>
                <TH className="w-72">{d.public.eventTypeHeader}</TH>
                <TH>{d.public.eventMeaningHeader}</TH>
              </TR>
            </THead>
            <TBody>
              {EVENT_TYPES.map((et) => (
                <TR key={et}>
                  <TD>
                    <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px] font-semibold text-teal-700">
                      {et}
                    </code>
                  </TD>
                  <TD>{d.public.eventNames[et]}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>

      {/* Adapter */}
      <section aria-labelledby="adapter-heading" className="mt-14">
        <h2 id="adapter-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.public.devAdapterTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.devAdapterBody}</p>
        <div className="mt-4">
          <CodeBlock>{ADAPTER_EXCERPT}</CodeBlock>
        </div>
      </section>

      {/* ABDM/FHIR */}
      <Alert type="info" title={d.public.devAbdmTitle}>
        {d.public.devAbdmBody}
      </Alert>

      <div className="mt-12 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/partners" className={buttonClasses("primary", "md")}>
          {d.nav.partners}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link href="/open-source" className={buttonClasses("secondary", "md")}>
          {d.nav.openSource}
        </Link>
      </div>
    </div>
  );
}
