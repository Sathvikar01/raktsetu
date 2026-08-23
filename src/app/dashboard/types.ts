/** Shared, serializable shapes for donor app forms. Type-only module — no runtime imports. */

export interface DonorActionState {
  ok: boolean;
  message: string;
}

/**
 * Documented consent purposes (schema comment examples + the account
 * registration default). Kept out of actions.ts because "use server"
 * files may only export async functions.
 */
export const DONOR_CONSENT_PURPOSES = [
  "account.lifecycle_notifications",
  "notifications.email",
  "notifications.descriptive",
  "data.export",
] as const;

export type DonorConsentPurpose = (typeof DONOR_CONSENT_PURPOSES)[number];
