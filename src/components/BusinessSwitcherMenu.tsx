import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  Check,
  Plus,
  User,
} from 'lucide-react';
import type { UserProfile } from '../types/social';
import { useActiveIdentity } from '../contexts/ActiveIdentityContext';
import { acceptBusinessInvite } from '../services/businessProfiles';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface BusinessSwitcherMenuProps {
  profile: UserProfile;
  onCreateBusiness: () => void;
  onOpenBusinessProfile?: (slug: string) => void;
  align?: 'left' | 'right';
}

export function BusinessSwitcherMenu({
  profile,
  onCreateBusiness,
  align = 'right',
}: BusinessSwitcherMenuProps) {
  const {
    activeIdentity,
    businesses,
    pendingInvites,
    switchToNormal,
    switchToBusiness,
  } = useActiveIdentity();

  const [open, setOpen] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const activeName =
    activeIdentity.type === 'business'
      ? activeIdentity.businessProfile.displayName
      : profile.displayName;
  const activeAvatar =
    activeIdentity.type === 'business'
      ? activeIdentity.businessProfile.logoUrl
      : profile.avatarUrl;

  const handleSelectNormal = () => {
    setStatusError(null);
    switchToNormal();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Switch profile (active: ${activeName})`}
        title={`Switch profile (${activeName})`}
        data-testid="identity-switcher-trigger"
        className="relative inline-flex items-center justify-center rounded-full p-0.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <Avatar src={activeAvatar} name={activeName} size="sm" />
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 border border-white dark:border-slate-950 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-xs"
        >
          <ArrowLeftRight className="w-2.5 h-2.5" />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch active profile"
          data-testid="identity-switcher-popover"
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 space-y-1.5`}
        >
          <div className="px-2.5 pt-1 pb-1.5 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Switch Platform Profile
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Switch between your personal network and business workspaces.
            </p>
          </div>

          {statusError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300">
              {statusError}
            </div>
          )}

          {/* Normal Personal Profile */}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={activeIdentity.type === 'personal'}
            onClick={handleSelectNormal}
            className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
              activeIdentity.type === 'personal'
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar src={profile.avatarUrl} name={profile.displayName} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate inline-flex items-center gap-1 max-w-full">
                  <span className="truncate">{profile.displayName}</span>
                  {profile.isVerified && <VerifiedBadge size={12} />}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                  <User className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">@{profile.handle} · Personal</span>
                </p>
              </div>
            </div>
            {activeIdentity.type === 'personal' && (
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-3 h-3" aria-hidden="true" />
              </span>
            )}
          </button>

          {/* Business Profiles */}
          {businesses.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 space-y-1 max-h-56 overflow-y-auto">
              {businesses.map((biz) => {
                const isActive =
                  activeIdentity.type === 'business' &&
                  activeIdentity.businessProfileId === biz.id;
                return (
                  <button
                    key={biz.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      switchToBusiness(biz.id);
                      setOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={biz.logoUrl} name={biz.displayName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate inline-flex items-center gap-1 max-w-full">
                          <span className="truncate">{biz.displayName}</span>
                          {biz.verified && <VerifiedBadge size={12} />}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">@{biz.slug}</span>
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {pendingInvites.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 space-y-1">
              <p className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
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

          <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateBusiness();
              }}
              className="w-full min-h-[36px] px-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span>Create Business Profile</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
