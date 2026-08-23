/** Shared, serializable shapes for staff portal forms. Type-only module — no runtime imports. */

export interface OpsActionState {
  ok: boolean;
  message: string;
  /** Set when a donor link code was issued (record donation / simulator). */
  linkCode?: string;
  /** Simulator step marker so the client can chain donationId → componentId. */
  step?: string;
  /** Opaque internal ids returned by simulator steps (never external identifiers of people). */
  simDonationId?: string;
  simRbcComponentId?: string;
  banner?: string;
  steps?: string[];
}

export interface OptionItem {
  value: string;
  label: string;
}

export interface DonationOption {
  value: string;
  label: string;
}

export interface ComponentOption {
  value: string;
  label: string;
}
