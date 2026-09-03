"use client";

import { useTransition } from "react";
import { getDictionary } from "@/i18n";
import { readCsrfCookie } from "@/components/site/Csrf";
import { cancelOrgCampAction } from "../camp-actions";

export function CampCancelButton({
  campId,
  organizationId,
}: {
  campId: string;
  organizationId: string;
}) {
  const d = getDictionary();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await cancelOrgCampAction(readCsrfCookie(), campId, organizationId);
        })
      }
      className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 hover:bg-crimson-50"
    >
      {pending ? d.common.loading : d.camps.cancelCamp}
    </button>
  );
}
