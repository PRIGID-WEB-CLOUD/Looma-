import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, ExternalLink, ShieldCheck, ShoppingBag, Store } from "lucide-react";

export default function AdminLoginPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_ADMIN")) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-[Manrope]">
      <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900/95 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
            Merchant Seller Portal
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Storefront management, inventory control, and order fulfillment for Looma verified Business Profiles.
          </p>
        </div>

        {/* Informational Guidance */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Single Sign-On (SSO) Secured</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            Standalone seller passwords have been decommissioned. Merchant access is tied directly to your verified Looma identity.
          </p>
          <div className="space-y-2 pt-2 border-t border-slate-800/80 text-slate-300">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Sign in to Looma with your personal account.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Switch to your Business Profile (or create one in Profile Settings).</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Click <strong className="text-white">Seller Portal</strong> to automatically open your merchant workspace.</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <a
            href={
              (import.meta as any).env?.VITE_LOOMA_APP_URL
                ? `${String((import.meta as any).env.VITE_LOOMA_APP_URL).replace(/\/+$/, "")}/profile`
                : "/profile"
            }
            className="w-full min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-emerald-950/50"
          >
            <Building2 className="w-4 h-4" aria-hidden="true" />
            <span>Open Looma Business Profile</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
          <a
            href="/marketplace"
            className="w-full min-h-[44px] px-4 rounded-xl border border-slate-800 hover:bg-slate-800/60 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>Return to Public Marketplace</span>
          </a>
        </div>
      </div>
    </div>
  );
}
