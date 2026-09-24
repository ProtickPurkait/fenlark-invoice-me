"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/business", label: "Business profile" },
  { href: "/settings/payment", label: "Bank & UPI" },
  { href: "/settings/invoicing", label: "Invoice defaults" },
  { href: "/settings/numbering", label: "Numbering" },
  { href: "/settings/reminders", label: "Reminders & email" },
  { href: "/settings/gateways", label: "Payment gateways" },
  { href: "/settings/team", label: "Team" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "whitespace-nowrap rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            pathname === item.href && "bg-white font-medium text-zinc-900 shadow-xs ring-1 ring-zinc-200",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
