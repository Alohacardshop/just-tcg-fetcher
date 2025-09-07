import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";

export const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
};