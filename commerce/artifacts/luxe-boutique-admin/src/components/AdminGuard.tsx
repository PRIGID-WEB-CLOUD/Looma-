import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const hasAdminRole = user?.role === "BUSINESS" || user?.role === "BUSINESS_OWNER" || user?.role === "PLATFORM_ADMIN";
  const hasTeamAccess = Boolean(user?.teamRole) || user?.role === "PLATFORM_ADMIN";
  const isAdmin = hasAdminRole && hasTeamAccess;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-[Manrope] text-slate-500 tracking-widest uppercase">Verifying Business Access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/login" replace />;
  }

  return <>{children}</>;
}
