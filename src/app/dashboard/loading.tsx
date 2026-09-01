import { Spinner } from "@/packages/ui";
import { getDictionary } from "@/i18n";

export default function DashboardLoading() {
  const d = getDictionary();
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-3 text-ink-soft">
      <Spinner label={d.common.loading} className="size-5" />
      <span className="text-sm" role="status">{d.common.loading}</span>
    </div>
  );
}
