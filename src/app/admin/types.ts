/** Shared serializable shapes for admin portal forms. Type-only module. */

export interface SecretOnceView {
  keyId: string;
  secret: string;
  previousKeyId?: string;
}

export interface AdminActionState {
  ok: boolean;
  message: string;
  secretOnce?: SecretOnceView;
}

export interface CredentialView {
  id: string;
  keyId: string;
  status: string;
  rotatedAtLabel: string | null;
  lastUsedAtLabel: string | null;
}

export interface IntegrationView {
  id: string;
  name: string;
  adapterType: string;
  status: string;
  description: string | null;
  credentials: CredentialView[];
}

/** Adapter types supported by the schema (schema.prisma Integration.adapterType). */
export const ADAPTER_TYPES = [
  "MOCK_BLOOD_BANK",
  "MOCK_HOSPITAL",
  "WEBHOOK",
  "CSV_IMPORT",
  "FHIR",
  "ERAKTKOSH",
] as const;
