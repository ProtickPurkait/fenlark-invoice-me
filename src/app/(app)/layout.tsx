import { Sidebar } from "@/components/app/sidebar";
import { requireUser } from "@/lib/auth/session";
import { businessName, getSettings, logoUrl } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <div className="min-h-screen">
      <Sidebar
        brandName={businessName(settings)}
        logoUrl={logoUrl(settings)}
        user={{ name: user.name, email: user.email, role: user.role }}
      />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
