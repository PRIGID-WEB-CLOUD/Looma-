import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ExternalLink,
  Plus,
  Store,
  User,
} from 'lucide-react';
import type { UserProfile } from '../types/social';
import { useActiveIdentity } from '../contexts/ActiveIdentityContext';
import { acceptBusinessInvite, launchCommerceDashboardSso } from '../services/businessProfiles';
import { Avatar } from './Avatar';

interface BusinessSwitcherMenuProps {
  profile: UserProfile;
  onCreateBusiness: () => void;
  onOpenBusinessProfile: (slug: string) => void;
  compact?: boolean;
}

export function BusinessSwitcherMenu({
  profile,
  onCreateBusiness,
  onOpenBusinessProfile,
  compact = false,
}: BusinessSwitcherMenuProps) {
  const {
    activeIdentity,
    businesses,
    memberships,
    pendingInvites,
    switchToPersonal,
    switchToBusiness,
  } = useActiveIdentity();

  const [open, setOpen] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [launchingSsoId, setLaunchingSsoId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const activeName =
    activeIdentity.type === 'business'
      ? activeIdentity.businessProfile.displayName
      : profile.displayName;
  const activeAvatar =
    activeIdentity.type === 'business'
      ? activeIdentity.businessProfile.logoUrl
      : profile.avatarUrl;
  const activeSubLabel =
    activeIdentity.type === 'business'
      ? `Business · /${activeIdentity.businessProfile.slug}`
      : `Personal · @${profile.handle}`;

  const handleOpenCommercePortal = async (bpId: string) => {
    setStatusError(null);
    setLaunchingSsoId(bpId);
    try {
      await launchCommerceDashboardSso(bpId);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to launch Seller Portal.');
      setLaunchingSsoId(null);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Switch active Personal or Business identity"
        data-testid="identity-switcher-trigger"
        className={`flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer text-left ${
          compact ? 'min-h-[38px] px-2.5 py-1' : 'min-h-[44px] w-full px-3 py-2'
        }`}
      >
        <Avatar src={activeAvatar} name={activeName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[150px]">
              {activeName}
            </span>
            {activeIdentity.type === 'business' && (
              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider shrink-0">
                Biz
              </span>
            )}
          </div>
          {!compact && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {activeSubLabel}
            </p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          data-testid="identity-switcher-popover"
          className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 space-y-2"
        >
          {statusError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300">
              {statusError}
            </div>
          )}

          <div>
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Personal Account
            </p>
            <button
              type="button"
              onClick={() => {
                switchToPersonal();
                setOpen(false);
              }}
              className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                activeIdentity.type === 'personal'
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar src={profile.avatarUrl} name={profile.displayName} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{profile.displayName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                    <User className="w-3 h-3" aria-hidden="true" />
                    @{profile.handle}
                  </p>
                </div>
              </div>
              {activeIdentity.type === 'personal' && (
                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <div className="px-2 py-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Business Profiles ({businesses.length})
              </p>
            </div>
            {businesses.length === 0 ? (
              <p className="px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                No Business Profiles yet. Create one to build a brand presence or open a store.
              </p>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {businesses.map((biz) => {
                  const isActive =
                    activeIdentity.type === 'business' &&
                    activeIdentity.businessProfileId === biz.id;
                  const role =
                    memberships.find((m) => m.businessProfileId === biz.id)?.role || 'MEMBER';
                  return (
                    <div
                      key={biz.id}
                      className={`rounded-xl p-1.5 transition-colors ${
                        isActive
                          ? 'bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          switchToBusiness(biz.id);
                          setOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 text-left px-1 py-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={biz.logoUrl} name={biz.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {biz.displayName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              /{biz.slug} · {role}
                            </p>
                          </div>
                        </div>
                        {isActive && (
                          <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1 px-1">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenBusinessProfile(biz.slug);
                            setOpen(false);
                          }}
                          className="flex-1 min-h-[28px] px-2 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Building2 className="w-3 h-3" aria-hidden="true" />
                          <span>View Page</span>
                        </button>
                        <button
                          type="button"
                          disabled={launchingSsoId === biz.id}
                          onClick={() => void handleOpenCommercePortal(biz.id)}
                          className="flex-1 min-h-[28px] px-2 rounded-lg text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Store className="w-3 h-3" aria-hidden="true" />
                          <span>{launchingSsoId === biz.id ? 'Opening...' : 'Seller Portal'}</span>
                          <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {pendingInvites.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 space-y-1">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Pending Business Invites ({pendingInvites.length})
              </p>
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{inv.businessName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Role: {inv.role}</p>
                  </div>
                  <button
                    type="button"
                    disabled={acceptingInviteId === inv.id}
                    onClick={async () => {
                      setAcceptingInviteId(inv.id);
                      try {
                        await acceptBusinessInvite({
                          invite: inv,
                          uid: profile.uid,
                          displayName: profile.displayName,
                          handle: profile.handle,
                          avatarUrl: profile.avatarUrl,
                        });
                        switchToBusiness(inv.businessProfileId);
                        setOpen(false);
                      } catch (err) {
                        setStatusError(
                          err instanceof Error ? err.message : 'Unable to accept invite.'
                        );
                      } finally {
                        setAcceptingInviteId(null);
                      }
                    }}
                    className="min-h-[30px] px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {acceptingInviteId === inv.id ? 'Joining...' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
