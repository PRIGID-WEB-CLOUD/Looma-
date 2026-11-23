import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getLoomaMarketplaceUrl, getLoomaProfileUrl } from "@/lib/loomaUrl";
import { ExternalLink, PlusCircle, ShoppingBag, Store } from "lucide-react";

export default function AdminRegisterPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const profileUrl = getLoomaProfileUrl();
  const marketplaceUrl = getLoomaMarketplaceUrl();

  useEffect(() => {
    const hasAdminRole = user?.role === "BUSINESS" || user?.role === "BUSINESS_OWNER" || user?.role === "PLATFORM_ADMIN";
    const hasTeamRole = Boolean(user?.teamRole) || user?.role === "PLATFORM_ADMIN";
    if (!authLoading && hasAdminRole && hasTeamRole) {
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
            Open a Merchant Store
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Merchant stores on Looma are created through verified Business Profiles.
          </p>
        </div>

        {/* Guidance */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3 text-xs text-slate-300">
          <p className="leading-relaxed">
            You do not need to register a separate merchant account with a new email and password. Your personal Looma account can own and manage multiple Business Profiles.
          </p>
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Go to <strong className="text-white">Profile Settings</strong> in Looma.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Click <strong className="text-white">Create Business Profile</strong> and enter your brand details.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Check <strong className="text-white">Provision Merchant Commerce Store</strong> to automatically set up your catalog.</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {profileUrl ? (
            <a
              href={profileUrl}
              className="w-full min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-emerald-950/50"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              <span>Create Business in Looma</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-800/60 rounded-xl px-3.5 py-2.5 text-center">
              Looma return URL is not configured (set VITE_LOOMA_APP_URL or LOOMA_APP_URL). Open Looma directly to create a Business Profile.
            </p>
          )}
          {marketplaceUrl && (
            <a
              href={marketplaceUrl}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-800 hover:bg-slate-800/60 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span>Browse Looma Marketplace</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
