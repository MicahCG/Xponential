import { requireAuth } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getCurrentBrand, listBrandsForUser } from "@/lib/brand-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const [currentBrand, brands] = await Promise.all([
    getCurrentBrand(session.user!.id!),
    listBrandsForUser(session.user!.id!),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar currentBrand={currentBrand} brands={brands} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
