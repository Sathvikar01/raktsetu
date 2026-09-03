import { z } from "zod";

/** Closed lifecycle event catalog (spec §6). Extend only via PR + docs update. */
export const EVENT_TYPES = [
  "DONATION_COLLECTED",
  "DONATION_PROCESSING_STARTED",
  "SCREENING_COMPLETED",
  "COMPONENT_CREATED",
  "COMPONENT_AVAILABLE",
  "COMPONENT_RESERVED",
  "COMPONENT_TRANSFERRED",
  "COMPONENT_RECEIVED",
  "COMPONENT_ISSUED",
  "COMPONENT_RETURNED",
  "COMPONENT_TRANSFUSED",
  "COMPONENT_EXPIRED",
  "COMPONENT_DISCARDED",
  "COMPONENT_RECALLED",
  "EVENT_CORRECTION",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const DONATION_EVENTS: EventType[] = [
  "DONATION_COLLECTED", "DONATION_PROCESSING_STARTED", "SCREENING_COMPLETED", "EVENT_CORRECTION",
];
export const COMPONENT_EVENTS: EventType[] = [
  "COMPONENT_CREATED", "COMPONENT_AVAILABLE", "COMPONENT_RESERVED", "COMPONENT_TRANSFERRED",
  "COMPONENT_RECEIVED", "COMPONENT_ISSUED", "COMPONENT_RETURNED", "COMPONENT_TRANSFUSED",
  "COMPONENT_EXPIRED", "COMPONENT_DISCARDED", "COMPONENT_RECALLED",
];

export const COMPONENT_TYPES = ["RBC", "PLASMA", "PLATELET", "WHOLE_BLOOD", "OTHER"] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

/** ABO/Rh groups recorded by blood banks at collection (inventory facts). */
export const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const VERIFICATION_STATUSES = ["VERIFIED", "PENDING", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const TREATMENT_CATEGORIES = [
  "EMERGENCY_CARE", "SURGERY", "CANCER_CARE", "MATERNAL_CARE",
  "PEDIATRIC_CARE", "CHRONIC_TREATMENT", "OTHER_CLINICAL",
] as const;
export type TreatmentCategory = (typeof TREATMENT_CATEGORIES)[number];

export const DISCLOSURE_LEVELS = ["NONE", "BROAD_PURPOSE", "LIMITED_ANON"] as const;
export type DisclosureLevel = (typeof DISCLOSURE_LEVELS)[number];

export const AGE_BANDS = ["<18", "18-40", "40-60", "60+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
