import Link from "next/link";

export function PublicShell({
  brandName,
  logoUrl,
  children,
  right,
}: {
  brandName: string;
  logoUrl: string | null;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="h-8 w-auto max-w-[180px] object-contain" />
          ) : (
            <span className="text-lg font-bold tracking-tight text-brand-700">{brandName}</span>
          )}
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-center text-xs text-zinc-400 sm:px-6">
        {brandName} ·{" "}
        <Link href="/portal" className="hover:text-zinc-600">
          Client portal
        </Link>
      </footer>
    </div>
  );
}
