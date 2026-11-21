import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Mail, Trash2, UserPlus, Users } from 'lucide-react';
import type {
  BusinessInvite,
  BusinessMembership,
  BusinessMembershipRole,
  BusinessProfile,
} from '../../types/business';
import {
  createBusinessInvite,
  removeBusinessMember,
  revokeBusinessInvite,
  subscribeBusinessInvitesForBusiness,
  subscribeBusinessMembers,
  updateBusinessMemberRole,
} from '../../services/businessProfiles';
import { syncBusinessChatStaffParticipants } from '../../services/businessChat';
import { Avatar } from '../Avatar';

interface BusinessTeamViewProps {
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  viewerUid: string;
}

const INVITABLE_ROLES: Array<Exclude<BusinessMembershipRole, 'OWNER'>> = [
  'ADMIN',
  'EDITOR',
  'VIEWER',
];

export function BusinessTeamView({
  businessProfile,
  role,
  viewerUid,
}: BusinessTeamViewProps) {
  const [members, setMembers] = useState<BusinessMembership[]>([]);
  const [invites, setInvites] = useState<BusinessInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] =
    useState<Exclude<BusinessMembershipRole, 'OWNER'>>('EDITOR');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const canManageTeam = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    const unsubMembers = subscribeBusinessMembers(businessProfile.id, setMembers);
    const unsubInvites = canManageTeam
      ? subscribeBusinessInvitesForBusiness(businessProfile.id, setInvites)
      : () => {};
    return () => {
      unsubMembers();
      unsubInvites();
    };
  }, [businessProfile.id, canManageTeam]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageTeam || inviteBusy) return;
    setError(null);
    setStatus(null);
    setInviteBusy(true);
    try {
      await createBusinessInvite({
        businessProfileId: businessProfile.id,
        businessName: businessProfile.displayName,
        email: inviteEmail,
        role: inviteRole,
        invitedByUid: viewerUid,
      });
      setInviteEmail('');
      setStatus(
        'Invitation sent. Collaborators will see it in their Identity Switcher and can accept into Business Mode.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send invite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRoleChange = async (
    membership: BusinessMembership,
    nextRole: Exclude<BusinessMembershipRole, 'OWNER'>
  ) => {
    setError(null);
    setStatus(null);
    try {
      await updateBusinessMemberRole(membership, nextRole);
      await syncBusinessChatStaffParticipants(
        businessProfile.id,
        membership.uid,
        businessProfile.ownerUid
      ).catch(() => {});
      setStatus(
        `Updated ${membership.displayName || 'member'} to ${nextRole}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update role.');
    }
  };

  const handleRemoveMember = async (membership: BusinessMembership) => {
    setError(null);
    setStatus(null);
    try {
      await removeBusinessMember(membership.id, {
        businessProfileId: membership.businessProfileId,
        uid: membership.uid,
      });
      await syncBusinessChatStaffParticipants(
        businessProfile.id,
        membership.uid,
        businessProfile.ownerUid
      ).catch(() => {});
      setConfirmRemoveId(null);
      setStatus('Member removed and Business Inbox permissions synced.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove member.');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setError(null);
    setStatus(null);
    try {
      await revokeBusinessInvite(inviteId);
      setStatus('Invitation revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke invite.');
    }
  };

  return (
    <section aria-label="Business Team Management" className="space-y-5">
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span>Team Members & Permissions</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Grant team access to {businessProfile.displayName} without exposing anyone’s personal Looma messages or personal account.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {status && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 w-full">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{status}</span>
        </div>
      )}

      {canManageTeam && (
        <form
          onSubmit={handleInvite}
          className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
        >
          <p className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Invite Collaborator</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              aria-label="Teammate email"
              className="flex-1 min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(
                  e.target.value as Exclude<BusinessMembershipRole, 'OWNER'>
                )
              }
              aria-label="Collaborator role"
              className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
            >
              <option value="ADMIN">Admin (Manage Team, Store & Inbox)</option>
              <option value="EDITOR">Editor (Posts, Catalog & Customer Inbox)</option>
              <option value="VIEWER">Viewer (Read-only Analytics & Posts)</option>
            </select>
            <button
              type="submit"
              disabled={inviteBusy}
              className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{inviteBusy ? 'Sending...' : 'Send Invite'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Active Members List */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
          Active Team ({members.length})
        </h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => {
            const isOwnerRow = member.role === 'OWNER';
            const isSelf = member.uid === viewerUid;
            return (
              <div
                key={member.id}
                className="py-3 first:pt-1 last:pb-1 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={member.avatarUrl || ''}
                    name={member.displayName || 'Team Member'}
                    size="md"
                  />
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {member.displayName || member.uid}
                      {isSelf && (
                        <span className="ml-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                          (You)
                        </span>
                      )}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 truncate">
                      {member.handle ? `@${member.handle}` : member.uid}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canManageTeam && !isOwnerRow && !isSelf ? (
                    <>
                      <select
                        value={member.role}
                        aria-label={`Role for ${member.displayName || member.uid}`}
                        onChange={(e) =>
                          void handleRoleChange(
                            member,
                            e.target.value as Exclude<BusinessMembershipRole, 'OWNER'>
                          )
                        }
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
                      >
                        {INVITABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>

                      {confirmRemoveId === member.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(member)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(member.id)}
                          aria-label={`Remove ${member.displayName || 'member'}`}
                          className="min-h-[36px] px-2.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {member.role}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Invitations */}
      {canManageTeam && invites.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Invitations ({invites.length})
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="py-2.5 first:pt-1 last:pb-1 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {inv.email}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Role: {inv.role} · Status: {inv.status}
                  </p>
                </div>
                {inv.status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeInvite(inv.id)}
                    className="min-h-[32px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
