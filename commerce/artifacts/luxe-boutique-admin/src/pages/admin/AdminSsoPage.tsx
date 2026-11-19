import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminSsoPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search || "");
    const code = (params.get("code") || "").trim();

    try {
      window.history.replaceState({}, document.title, "/seller/sso");
    } catch {
      // Ignore history errors in sandboxed iframes
    }

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

        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(payload.error || "Unable to verify Looma Seller Portal authorization.");
          return;
        }

        await refetch();
        navigate("/");
      } catch {
        setError("Network error while connecting to the Merchant Seller Portal.");
      }
    })();
  }, [navigate, refetch]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center space-y-4 shadow-2xl">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-white">Seller Portal Authorization Failed</h1>
            <p className="text-sm text-slate-300 leading-relaxed">{error}</p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <a
                href="/marketplace"
                className="px-4 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 transition-colors"
              >
                Return to Looma Marketplace
              </a>
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
