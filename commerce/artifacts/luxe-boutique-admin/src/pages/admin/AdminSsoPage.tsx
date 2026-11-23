import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth, type User } from "@/contexts/AuthContext";
import { getLoomaMarketplaceUrl, getLoomaProfileUrl } from "@/lib/loomaUrl";

export default function AdminSsoPage() {
  const [, navigate] = useLocation();
  const { refetch, completeSsoSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const initialCodeRef = useRef<string | null>(null);
  const profileUrl = getLoomaProfileUrl();
  const marketplaceUrl = getLoomaMarketplaceUrl();

  if (initialCodeRef.current === null && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search || "");
    initialCodeRef.current = (params.get("code") || "").trim();
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const code = (initialCodeRef.current || "").trim();
    if (!code) {
      setError("Missing one-time Looma authorization code. Please launch the Seller Portal from your Business Profile.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/looma/exchange", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          sessionToken?: string;
          user?: User;
          error?: string;
        };

        try {
          window.history.replaceState({}, document.title, "/seller/sso");
        } catch {
          // Ignore history errors in sandboxed iframes
        }

        if (!res.ok || !payload.ok) {
          setError(payload.error || "Unable to verify Looma Seller Portal authorization.");
          return;
        }

        if (payload.user) {
          completeSsoSession(payload.user, payload.sessionToken);
        }

        const verifiedUser = await refetch();
        const activeUser = verifiedUser || payload.user || null;
        const role = (activeUser?.role || "").toUpperCase();
        const hasTeamAccess = Boolean(activeUser?.teamRole) || role === "PLATFORM_ADMIN";
        if (!activeUser || !["BUSINESS", "BUSINESS_OWNER", "PLATFORM_ADMIN"].includes(role) || !hasTeamAccess) {
          setError(
            "Your authorization succeeded, but your merchant session could not be verified. Please return to your Looma Business Profile and relaunch."
          );
          return;
        }

        navigate("/", { replace: true });
      } catch {
        setError("Network error while connecting to the Merchant Seller Portal.");
      }
    })();
  }, [completeSsoSession, navigate, refetch]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center space-y-4 shadow-2xl">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-white">Seller Portal Authorization Failed</h1>
            <p className="text-sm text-slate-300 leading-relaxed">{error}</p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {profileUrl ? (
                <a
                  href={profileUrl}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors"
                >
                  Return to Business Profile
                </a>
              ) : (
                <a
                  href="/seller/login"
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors"
                >
                  Portal Sign-In Help
                </a>
              )}
              {marketplaceUrl && (
                <a
                  href={marketplaceUrl}
                  className="px-4 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 transition-colors"
                >
                  Looma Marketplace
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <h1 className="text-lg font-semibold text-white">Authorizing Merchant Workspace</h1>
            <p className="text-xs text-slate-400">
              Verifying your Looma Business Profile permissions and establishing a secure HTTP-only session…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
