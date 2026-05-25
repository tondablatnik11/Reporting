import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <main className="ml-64 flex-1 flex flex-col min-h-screen">
        <Topbar />
        <div className="flex-1 p-6 overflow-x-hidden">
          {children}
        </div>
      </main>
    </>
  );
}
