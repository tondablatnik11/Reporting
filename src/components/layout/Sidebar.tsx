"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackageSearch,
  Box,
  TrendingUp,
  Settings,
  Upload,
  Tv,
  Users2,
  Clock,
  BarChart3,
  Truck
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/" && (pathname === "/" || pathname === "/dashboard")) {
      return true;
    }
    return path !== "/" && pathname.startsWith(path);
  };

  return (
    <aside className="w-64 bg-[#080d1c] border-r border-white/5 fixed h-full flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-white/5 mb-6">
        <img src="/image_45bc26.png" alt="Hellmann Logo" className="w-40 h-auto object-contain" />
      </div>

      <nav className="flex-1 p-6 space-y-2">
        <div className="nav-category">Dashboard</div>
        <Link
          href="/"
          className={`nav-item ${isActive("/") ? "active" : ""}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          Přehled
        </Link>

        <div className="nav-category">Denní Analytika & Trendy</div>
        <Link
          href="/analytics/trends"
          className={`nav-item ${isActive("/analytics/trends") ? "active" : ""}`}
        >
          <TrendingUp className="w-5 h-5" />
          Denní Trendy
        </Link>

        <Link
          href="/analytics/shifts"
          className={`nav-item ${isActive("/analytics/shifts") ? "active" : ""}`}
        >
          <BarChart3 className="w-5 h-5" />
          Benchmarking Směn
        </Link>

        <Link
          href="/analytics/operators"
          className={`nav-item ${isActive("/analytics/operators") ? "active" : ""}`}
        >
          <Users2 className="w-5 h-5" />
          Analytika Operátorů
        </Link>

        <div className="nav-category">Live Pohledy (Staré)</div>
        <Link
          href="/picking"
          className={`nav-item ${isActive("/picking") ? "active" : ""}`}
        >
          <PackageSearch className="w-5 h-5" />
          Picking
        </Link>

        <Link
          href="/packing"
          className={`nav-item ${isActive("/packing") ? "active" : ""}`}
        >
          <Box className="w-5 h-5" />
          Packing
        </Link>

        <div className="nav-category">Procesní Kvalita</div>

        <Link
          href="/analytics/pack"
          className={`nav-item ${isActive("/analytics/pack") ? "active" : ""}`}
        >
          <Box className="w-5 h-5" />
          Pack Analytika
        </Link>

        <Link
          href="/analytics/delivery"
          className={`nav-item ${isActive("/analytics/delivery") ? "active" : ""}`}
        >
          <Truck className="w-5 h-5" />
          Delivery Analytika
        </Link>

        <Link
          href="/analytics/predictions"
          className={`nav-item ${isActive("/analytics/predictions") ? "active" : ""}`}
        >
          <TrendingUp className="w-5 h-5" />
          Predikce & Plánování
        </Link>

        <div className="nav-category">Nástroje</div>
        <Link
          href="/upload"
          className={`nav-item ${isActive("/upload") ? "active" : ""}`}
        >
          <Upload className="w-5 h-5" />
          Import SAP
        </Link>

        <Link
          href="/tv-mode"
          className={`nav-item ${isActive("/tv-mode") ? "active" : ""}`}
        >
          <Tv className="w-5 h-5" />
          TV Režim
        </Link>

        <div className="nav-category">Správa</div>
        <Link
          href="/settings/targets"
          className={`nav-item ${isActive("/settings/targets") ? "active" : ""}`}
        >
          <Settings className="w-5 h-5" />
          Cíle
        </Link>

        <Link
          href="/settings/operators"
          className={`nav-item ${isActive("/settings/operators") ? "active" : ""}`}
        >
          <Users2 className="w-5 h-5" />
          Operátoři
        </Link>

        <Link
          href="/settings/shifts"
          className={`nav-item ${isActive("/settings/shifts") ? "active" : ""}`}
        >
          <Clock className="w-5 h-5" />
          Směny
        </Link>
      </nav>

      <div className="p-6 border-t border-white/5">
        <p className="text-xs text-white/30">
          © {new Date().getFullYear()} Hellmann Worldwide Logistics
        </p>
      </div>
    </aside>
  );
}