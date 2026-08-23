import type { Metadata } from "next";
import Link from "next/link";
import { BellRing } from "lucide-react";
import {
  Badge,
  buttonClasses,
  Card,
  CardBody,
  EmptyState,
} from "@/packages/ui";
import { DEFAULT_LOCALE, getDictionary, translate } from "@/i18n";
import { fromJson } from "@/lib/json";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/packages/database/client";
import { fmtDateTime } from "../format";
import { markAllNotificationsReadAction } from "../actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.nav.notifications };
}

interface StoredParams {
  key?: unknown;
  params?: unknown;
}

/** Resolve a stored template key defensively; unresolved keys fall back to generic copy. */
function safeTranslate(key: unknown, params: Record<string, string>, fallback: string): string {
  if (typeof key !== "string" || key.length === 0) return fallback;
  const rendered = translate(DEFAULT_LOCALE, key, params);
  return rendered === key ? fallback : rendered;
}

function stringParams(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export default async function NotificationsPage() {
  const user = await requireRole("DONOR");
  const d = getDictionary();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  const rows = notifications.map((notification) => {
    const titleStored = fromJson<StoredParams>(notification.titleParamsJson, {});
    const bodyStored = fromJson<StoredParams>(notification.bodyParamsJson, {});
    // typeKey-derived generic title/body: stored keys resolve through the
    // dictionary; anything unrenderable degrades to lock-screen-safe copy.
    const title = safeTranslate(
      titleStored.key,
      {},
      translate(DEFAULT_LOCALE, "notify.genericUpdateTitle")
    );
    const body = safeTranslate(
      bodyStored.key,
      stringParams(bodyStored.params),
      translate(DEFAULT_LOCALE, "notify.genericUpdateBody")
    );
    const href = notification.relatedDonationId
      ? `/dashboard/donations/${notification.relatedDonationId}${
          notification.relatedComponentId ? `#component-${notification.relatedComponentId}` : ""
        }`
      : null;
    return { id: notification.id, createdAt: notification.createdAt, readAt: notification.readAt, title, body, href };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">{d.donor.notificationsTitle}</h1>
        {unreadCount > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              {d.donor.markAllRead}
            </button>
          </form>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={BellRing} title={d.donor.notificationsEmpty} />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className={row.readAt === null ? "border-teal-600/25" : undefined}>
                <CardBody className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={
                        row.readAt === null
                          ? "font-semibold text-ink"
                          : "font-medium text-ink-soft"
                      }
                    >
                      {row.title}
                    </p>
                    {row.readAt === null ? (
                      <Badge tone="teal">
                        <BellRing className="size-3" aria-hidden />
                        {d.donor.unreadBadge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm leading-relaxed text-ink-soft">{row.body}</p>
                  <p className="text-xs text-ink-faint">{fmtDateTime(row.createdAt)}</p>
                  {row.href ? (
                    <p>
                      <Link
                        href={row.href}
                        className="rounded text-sm font-medium text-teal-700 hover:underline focus-visible:outline-2 focus-visible:outline-teal-600"
                      >
                        {d.donor.relatedDonation}
                      </Link>
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
