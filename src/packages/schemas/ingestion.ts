import { z } from "zod";
import {
  AGE_BANDS, COMPONENT_TYPES, DISCLOSURE_LEVELS, EVENT_TYPES, TREATMENT_CATEGORIES,
} from "./events";

/**
 * Wire contract for POST /api/v1/events.
 * Strict: unknown fields rejected before persistence (tamper surface reduction).
 */
export const InboundEventSchema = z
  .object({
    external_event_id: z.string().min(1).max(128),
    donation_identifier: z.string().min(1).max(128).optional(),
    component_identifier: z.string().min(1).max(128).optional(),
    identifier_scheme: z.enum(["INTERNAL_UUID", "ISBT128_DIN", "FACILITY_BARCODE", "ERAKTKOSH_ID", "HOSPITAL_LOCAL"]).default("HOSPITAL_LOCAL"),
    event_type: z.enum(EVENT_TYPES),
    occurred_at: z.string().datetime(),
    facility_code: z.string().max(64).optional(),
    verification_status: z.enum(["VERIFIED", "PENDING"]).default("VERIFIED"),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    correction_of_source_event_id: z.string().max(128).optional(),
    disclosure: z
      .object({
        level: z.enum(DISCLOSURE_LEVELS),
        category: z.enum(TREATMENT_CATEGORIES).optional(),
        age_band: z.enum(AGE_BANDS).optional(),
        recipient_ref: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
        patient_consent_verified: z.boolean().optional(),
      })
      .optional(),
  })
  .strict()
  .refine(
    (e) => !(e.event_type.startsWith("DONATION_") || e.event_type === "SCREENING_COMPLETED" ? e.component_identifier : false),
    { message: "donation-level events must not carry component_identifier" }
  )
  .refine(
    (e) => !(e.event_type.startsWith("COMPONENT_") && !e.component_identifier && !e.donation_identifier),
    { message: "component events require component_identifier or donation_identifier" }
  )
  .refine(
    (e) => !(e.disclosure && e.disclosure.level !== "NONE" && !e.disclosure.category),
    { message: "disclosure above NONE requires treatment category" }
  );

export type InboundEvent = z.infer<typeof InboundEventSchema>;

export const CreateComponentSchema = z.object({
  donationId: z.string().uuid(),
  componentType: z.enum(COMPONENT_TYPES),
  externalComponentId: z.string().max(128).optional(),
}).strict();

export const LinkDonationSchema = z.object({
  linkCode: z.string().min(6).max(32),
}).strict();
