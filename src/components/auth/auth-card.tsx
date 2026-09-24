export function AuthCard({
  brandName,
  logoUrl,
  title,
  subtitle,
  children,
  footer,
}: {
  brandName: string;
  logoUrl?: string | null;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="h-10 w-auto" />
          ) : (
            <span className="text-2xl font-bold tracking-tight text-brand-700">{brandName}</span>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-7 shadow-sm">
          <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-xs text-zinc-500">{footer}</div> : null}
      </div>
    </main>
  );
}
