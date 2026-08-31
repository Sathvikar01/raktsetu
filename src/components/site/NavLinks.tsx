"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogIn, Menu, UserPlus, X } from "lucide-react";

export interface NavLinkItem {
  href: string;
  label: string;
}

function linkClasses(active: boolean): string {
  return [
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active ? "text-teal-700" : "text-ink-soft hover:bg-canvas hover:text-ink",
  ].join(" ");
}

/** Underline that grows in from the left on hover, or fully shown when active. */
function NavLink({
  href,
  label,
  active,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group ${linkClasses(active)}`}
    >
      <span className="relative inline-block">
        {label}
        <span
          aria-hidden
          className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-teal-600 transition-transform duration-200 ${
            active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
          }`}
        />
      </span>
    </Link>
  );
}

export function DesktopNav({
  links,
  navAriaLabel,
  signInLabel,
  signUpLabel,
}: {
  links: NavLinkItem[];
  navAriaLabel: string;
  signInLabel: string;
  signUpLabel: string;
}) {
  const pathname = usePathname();
  return (
    <div className="hidden items-center gap-1 lg:flex">
      <nav aria-label={navAriaLabel}>
        <ul className="flex items-center gap-0.5">
          {links.map((l) => (
            <li key={l.href}>
              <NavLink href={l.href} label={l.label} active={pathname === l.href} />
            </li>
          ))}
        </ul>
      </nav>
      <span aria-hidden className="mx-2 h-5 w-px bg-ink/15" />
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <LogIn className="size-4" aria-hidden />
        {signInLabel}
      </Link>
      <Link
        href="/register"
        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-card transition-all duration-150 hover:bg-teal-700 hover:shadow-lift active:translate-y-px"
      >
        <UserPlus className="size-4" aria-hidden />
        {signUpLabel}
      </Link>
    </div>
  );
}

export function MobileNav({
  links,
  navAriaLabel,
  menuLabel,
  signInLabel,
  signUpLabel,
}: {
  links: NavLinkItem[];
  navAriaLabel: string;
  menuLabel: string;
  signInLabel: string;
  signUpLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click / Escape; return focus to the toggle
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !toggleRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const panel = (
    <div
      ref={panelRef}
      className="absolute inset-x-4 top-16 z-50 rounded-2xl border border-ink/10 bg-white p-3 shadow-lift"
    >
      <nav aria-label={navAriaLabel}>
        <ul className="flex flex-col">
          {links.map((l, i) => (
            <motion.li
              key={l.href}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.18 }}
            >
              <Link href={l.href} className={`block ${linkClasses(pathname === l.href)}`}>
                {l.label}
              </Link>
            </motion.li>
          ))}
          <li className="my-2 border-t border-ink/10" />
          <motion.li
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * links.length, duration: 0.18 }}
          >
            <Link href="/login" className={`${linkClasses(false)} flex items-center gap-2`}>
              <LogIn className="size-4" aria-hidden />
              {signInLabel}
            </Link>
          </motion.li>
          <motion.li
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * (links.length + 1), duration: 0.18 }}
          >
            <Link href="/register" className={`${linkClasses(false)} flex items-center gap-2`}>
              <UserPlus className="size-4" aria-hidden />
              {signUpLabel}
            </Link>
          </motion.li>
        </ul>
      </nav>
    </div>
  );

  return (
    <div className="relative lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        <span className="sr-only">{menuLabel}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2"
          >
            {panel}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
