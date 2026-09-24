"use client";

import {
  ChartColumn,
  FileCheck,
  FileMinus,
  FilePlus,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Repeat,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/quotes", label: "Quotes", icon: FileCheck },
  { href: "/credit-notes", label: "Credit notes", icon: FileMinus },
  { href: "/debit-notes", label: "Debit notes", icon: FilePlus },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { divider: true },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/items", label: "Items", icon: Package },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({
  brandName,
  logoUrl,
  user,
}: {
  brandName: string;
  logoUrl: string | null;
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  // The mobile menu is open for the page it was opened on; navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
      {NAV.map((item, i) =>
        "divider" in item ? (
          <div key={`d${i}`} className="my-2 h-px bg-zinc-200" />
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
              (pathname === item.href || pathname.startsWith(`${item.href}/`)) && "bg-brand-50 text-brand-800 hover:bg-brand-50 hover:text-brand-800",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );

  const account = (
    <div className="border-t border-zinc-200 p-3">
      <div className="flex items-center gap-3 rounded-md px-2 py-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
          {initials(user.name || user.email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">{user.name || user.email}</p>
          <p className="truncate text-xs capitalize text-zinc-500">{user.role}</p>
        </div>
        <form action={signOutAction.bind(null, "staff")}>
          <button type="submit" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Sign out" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );

  const brand = (
    <Link href="/dashboard" className="flex h-14 items-center gap-2 border-b border-zinc-200 px-6">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={brandName} className="h-7 w-auto max-w-[140px] object-contain" />
      ) : (
        <span className="text-base font-bold tracking-tight text-brand-700">{brandName}</span>
      )}
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Billing</span>
    </Link>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
        <span className="font-bold text-brand-700">{brandName}</span>
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-zinc-200 bg-white lg:flex">
        {brand}
        {nav}
        {account}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3.5 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Close menu">
              <X className="size-4" />
            </button>
            {brand}
            {nav}
            {account}
          </aside>
        </div>
      ) : null}
    </>
  );
}
