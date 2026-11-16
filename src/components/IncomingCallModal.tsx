import { useEffect, useState } from 'react';
import { PhoneIncoming, PhoneOff, Video } from 'lucide-react';
import type { IncomingCallInvite } from '../types/social';
import { Avatar } from './Avatar';

function playRingingTone(): () => void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return () => {};
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    const interval = window.setInterval(() => {
      try {
        gain.gain.setValueAtTime(gain.gain.value === 0.05 ? 0 : 0.05, ctx.currentTime);
      } catch {}
    }, 1000);

    return () => {
      window.clearInterval(interval);
      try {
        osc.stop();
        ctx.close();
      } catch {}
    };
  } catch {
    return () => {};
  }
}

interface IncomingCallModalProps {
  invite: IncomingCallInvite | null;
  onAccept: (invite: IncomingCallInvite) => Promise<void> | void;
  onDecline: (invite: IncomingCallInvite) => Promise<void> | void;
}

export function IncomingCallModal({
  invite,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (!invite) return;
    const stopTone = playRingingTone();
    return () => {
      stopTone();
    };
  }, [invite]);

  if (!invite) return null;

  const handleAccept = async () => {
    if (busy) return;
    setBusy('accept');
    try {
      await onAccept(invite);
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    if (busy) return;
    setBusy('decline');
    try {
      await onDecline(invite);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Incoming ${invite.isAudioOnly ? 'audio' : 'video'} call from ${invite.callerName}`}
      data-testid="incoming-call-modal"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-3xl bg-slate-900 border border-white/15 text-white p-5 shadow-2xl backdrop-blur-xl space-y-4"
    >
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0">
          <Avatar
            src={invite.callerAvatar}
            name={invite.callerName}
            size="lg"
            online={true}
          />
          <span
            className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full text-white flex items-center justify-center border-2 border-slate-900 ${
              invite.isAudioOnly ? 'bg-emerald-600' : 'bg-blue-600'
            }`}
          >
            {invite.isAudioOnly ? (
              <PhoneIncoming className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Video className="w-3 h-3" aria-hidden="true" />
            )}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              invite.isAudioOnly ? 'text-emerald-400' : 'text-blue-400'
            }`}
          >
            Incoming {invite.isAudioOnly ? 'Voice' : 'Video'} Call
          </p>
          <h2 className="font-display text-base font-bold text-white truncate">
            {invite.callerName}
          </h2>
          <p className="text-xs text-slate-400 truncate">
            Room: {invite.title}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={handleDecline}
          className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
        >
          <PhoneOff className="w-4 h-4" aria-hidden="true" />
          <span>{busy === 'decline' ? 'Declining...' : 'Decline'}</span>
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={handleAccept}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
        >
          {invite.isAudioOnly ? (
            <PhoneIncoming className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Video className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{busy === 'accept' ? 'Joining...' : 'Accept'}</span>
        </button>
      </div>
    </div>
  );
}
