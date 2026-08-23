import { FlaskConical } from "lucide-react";
import { getDictionary } from "@/i18n";

export function DemoBanner({ demoMode }: { demoMode: boolean }) {
  if (!demoMode) return null;
  const d = getDictionary();
  return (
    <div
      role="note"
      className="border-b border-amber-600/20 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      <FlaskConical className="mr-1.5 inline size-4 -translate-y-px" aria-hidden />
      {d.public.demoNotice}
    </div>
  );
}
