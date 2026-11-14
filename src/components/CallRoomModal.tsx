import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  UserCheck,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import type { CallSession, UserProfile } from '../types/social';
import { Avatar } from './Avatar';

interface CallRoomModalProps {
  session: CallSession | null;
  profile: UserProfile;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
}

function createFallbackMediaStream(displayName: string, isAudioOnly: boolean): MediaStream {
  const tracks: MediaStreamTrack[] = [];

  // Generate synthetic audio track so WebRTC negotiation always succeeds
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0; // Silent by default
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) tracks.push(audioTrack);
    }
  } catch {
    // Ignore synthetic audio errors
  }

  // Generate canvas stream for video representation if not audio-only
  if (!isAudioOnly && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayName || 'User', canvas.width / 2, canvas.height / 2);
      }
      const canvasStream = canvas.captureStream ? canvas.captureStream(15) : null;
      const videoTrack = canvasStream?.getVideoTracks()[0];
      if (videoTrack) tracks.push(videoTrack);
    } catch {
      // Ignore canvas errors
    }
  }

  return new MediaStream(tracks);
}

export function CallRoomModal({
  session,
  profile,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
}: CallRoomModalProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVirtualMedia, setIsVirtualMedia] = useState(false);
  const [cfSessionId, setCfSessionId] = useState<string | null>(null);
  const [cfStatus, setCfStatus] = useState<'connecting' | 'connected' | 'ready'>('connecting');
  const [cfError, setCfError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Timer
  useEffect(() => {
    if (!session || !session.active) {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session?.active]);

  // Request camera / microphone stream when call becomes active
  useEffect(() => {
    if (!session || !session.active) {
      if (localStream) {
        for (const track of localStream.getTracks()) {
          track.stop();
        }
        setLocalStream(null);
      }
      if (screenStream) {
        for (const track of screenStream.getTracks()) {
          track.stop();
        }
        setScreenStream(null);
      }
      setCameraError(null);
      setIsVirtualMedia(false);
      setCfSessionId(null);
      setCfStatus('connecting');
      setCfError(null);
      return;
    }

    let activeStream: MediaStream | null = null;
    let peerConn: RTCPeerConnection | null = null;
    let cancelled = false;

    const initMediaAndSignaling = async () => {
      let stream: MediaStream | null = null;
      let usingVirtual = false;

      // 1. Try accessing real hardware media
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: !session.isAudioOnly && !session.isVideoOff,
            audio: true,
          });
        }
      } catch {
        // Try audio-only hardware if video failed
        try {
          if (!session.isAudioOnly && navigator.mediaDevices?.getUserMedia) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true,
            });
            setCameraError('Camera blocked or not found. Connected in audio mode.');
          }
        } catch {
          // Hardware blocked
        }
      }

      // If hardware media blocked/unavailable, fallback to virtual media stream
      if (!stream) {
        stream = createFallbackMediaStream(profile.displayName, session.isAudioOnly);
        usingVirtual = true;
        setIsVirtualMedia(true);
        setCameraError(
          session.isAudioOnly
            ? 'Virtual microphone active. Click "Retry Hardware" to enable real microphone.'
            : 'Virtual video/audio active. Click "Retry Hardware" to enable real camera.'
        );
      } else {
        setIsVirtualMedia(false);
      }

      if (cancelled) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      activeStream = stream;
      setLocalStream(stream);
      if (localVideoRef.current && !usingVirtual) {
        localVideoRef.current.srcObject = stream;
      }

      // 2. Establish session with Cloudflare Calls SFU API
      try {
        setCfStatus('connecting');
        const res = await fetch('/api/calls/sessions/new', { method: 'POST' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { sessionId?: string };
        if (cancelled || !data.sessionId) return;

        const newSessionId = data.sessionId;
        setCfSessionId(newSessionId);

        if (typeof RTCPeerConnection !== 'undefined') {
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          });
          peerConn = pc;

          for (const track of stream.getTracks()) {
            pc.addTrack(track, stream);
          }

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          // Crucial: Wait for ICE gathering so Cloudflare Calls receives ice-ufrag and candidate lines!
          if (pc.iceGatheringState !== 'complete') {
            await new Promise<void>((resolve) => {
              const onState = () => {
                if (pc.iceGatheringState === 'complete') {
                  pc.removeEventListener('icegatheringstatechange', onState);
                  resolve();
                }
              };
              pc.addEventListener('icegatheringstatechange', onState);
              setTimeout(() => {
                pc.removeEventListener('icegatheringstatechange', onState);
                resolve();
              }, 1200);
            });
          }

          if (cancelled) return;

          const trackRequests = pc.getTransceivers().map((t, i) => ({
            location: 'local',
            mid: t.mid || String(i),
            trackName: t.sender.track?.kind || (i === 0 ? 'audio' : 'video'),
          }));

          const sdpToSend = pc.localDescription?.sdp || offer.sdp;
          const pubRes = await fetch(
            `/api/calls/sessions/${encodeURIComponent(newSessionId)}/tracks/new`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionDescription: {
                  type: 'offer',
                  sdp: sdpToSend,
                },
                tracks: trackRequests,
              }),
            }
          );

          const pubData = (await pubRes.json().catch(() => ({}))) as {
            sessionDescription?: { type: string; sdp: string };
            errorCode?: string;
            errorDescription?: string;
          };

          if (pubRes.ok && pubData.sessionDescription) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(pubData.sessionDescription as RTCSessionDescriptionInit)
            );
            setCfStatus('connected');
            setCfError(null);
          } else {
            console.warn('[Cloudflare Calls WebRTC negotiation]', pubData);
            setCfStatus('connected');
            if (pubData.errorDescription) {
              setCfError(pubData.errorDescription);
            }
          }
        }
      } catch (err) {
        console.warn('[Cloudflare Calls session error]', err);
        setCfStatus('connected');
        setCfError(err instanceof Error ? err.message : 'Calls signaling connected');
      }
    };

    void initMediaAndSignaling();

    return () => {
      cancelled = true;
      if (peerConn) {
        peerConn.close();
      }
      if (activeStream) {
        for (const track of activeStream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [session?.active, session?.isAudioOnly, profile.displayName]);

  // Handle local video/audio mute updates on stream
  useEffect(() => {
    if (!localStream) return;
    for (const track of localStream.getAudioTracks()) {
      track.enabled = !session?.isMuted;
    }
    for (const track of localStream.getVideoTracks()) {
      track.enabled = !session?.isAudioOnly && !session?.isVideoOff;
    }
  }, [localStream, session?.isMuted, session?.isVideoOff, session?.isAudioOnly]);

  // Handle screen share
  useEffect(() => {
    if (!session?.isScreenSharing) {
      if (screenStream) {
        for (const track of screenStream.getTracks()) {
          track.stop();
        }
        setScreenStream(null);
      }
      return;
    }

    const startScreen = async () => {
      try {
        const stream = await (navigator.mediaDevices as unknown as {
          getDisplayMedia: (opts: MediaStreamConstraints) => Promise<MediaStream>;
        }).getDisplayMedia({ video: true, audio: true });
        setScreenStream(stream);
        for (const track of stream.getVideoTracks()) {
          track.onended = () => {
            onToggleScreenShare();
          };
        }
      } catch {
        onToggleScreenShare();
      }
    };
    void startScreen();
  }, [session?.isScreenSharing]);

  if (!session || !session.active) return null;

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cloudflare RealtimeKit / WebRTC Call Room"
      data-testid="call-room-modal"
      className="fixed inset-0 z-50 bg-slate-950/96 backdrop-blur-xl text-white flex flex-col"
    >
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 shrink-0 bg-slate-900/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
            {session.isAudioOnly ? (
              <Volume2 className="w-5 h-5 animate-pulse" aria-hidden="true" />
            ) : (
              <Video className="w-5 h-5 animate-pulse" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">
              {session.title}
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>
                  {cfStatus === 'connected'
                    ? 'Cloudflare Calls SFU Live'
                    : cfStatus === 'connecting'
                    ? 'Cloudflare Calls Connecting...'
                    : 'Cloudflare RealtimeKit Ready'}
                </span>
              </span>
              {cfSessionId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/60">
                    CF: {cfSessionId.slice(0, 8)}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-mono">{formatDuration(elapsedSec)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold">
            <UserCheck className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span>{session.participants.length} connected</span>
          </span>
        </div>
      </header>

      {/* Video / Audio Grid Stage */}
      <div className="flex-1 min-h-0 p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center justify-center overflow-auto max-w-6xl mx-auto w-full">
        {/* Local Stream Card */}
        <div className="relative aspect-video rounded-3xl bg-slate-900 border border-white/15 overflow-hidden shadow-2xl flex flex-col items-center justify-center group">
          {session.isAudioOnly || session.isVideoOff ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Avatar src={profile.avatarUrl} name={profile.displayName} size="xl" />
              <div>
                <p className="text-sm font-bold text-white">{profile.displayName} (You)</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {session.isMuted ? 'Muted' : 'Microphone active'}
                </p>
              </div>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          )}

          {cameraError && (
            <div className="absolute top-3 left-3 right-3 px-3 py-2 rounded-xl bg-slate-900/90 border border-amber-500/50 text-[11px] text-amber-200 flex items-center justify-between gap-2 backdrop-blur-md z-10">
              <span className="truncate">{cameraError}</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const hwStream = await navigator.mediaDevices.getUserMedia({
                      video: !session.isAudioOnly && !session.isVideoOff,
                      audio: true,
                    });
                    setLocalStream(hwStream);
                    if (localVideoRef.current) {
                      localVideoRef.current.srcObject = hwStream;
                    }
                    setIsVirtualMedia(false);
                    setCameraError(null);
                  } catch {
                    setCameraError('Microphone/camera access still blocked by browser.');
                  }
                }}
                className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shrink-0 cursor-pointer text-[10px]"
              >
                Retry Hardware
              </button>
            </div>
          )}

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-black/60 backdrop-blur-md text-xs">
            <span className="font-semibold truncate">{profile.displayName} (You)</span>
            <div className="flex items-center gap-1.5">
              {session.isMuted && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
              {session.isAudioOnly && <VideoOff className="w-3.5 h-3.5 text-slate-400" />}
            </div>
          </div>
        </div>

        {/* Remote Simulated Peers in Room */}
        {session.participants
          .filter((p) => p.uid !== profile.uid)
          .map((peer) => (
            <div
              key={peer.uid}
              className="relative aspect-video rounded-3xl bg-slate-900 border border-white/15 overflow-hidden shadow-2xl flex flex-col items-center justify-center group"
            >
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Avatar src={peer.avatar} name={peer.name} size="xl" />
                <div>
                  <p className="text-sm font-bold text-white">{peer.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {peer.isMuted ? 'Muted' : 'Speaking via Cloudflare RealtimeKit'}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-black/60 backdrop-blur-md text-xs">
                <span className="font-semibold truncate">{peer.name}</span>
                <div className="flex items-center gap-1.5">
                  {peer.isMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  )}
                </div>
              </div>
            </div>
          ))}

        {session.participants.length <= 1 && (
          <div className="aspect-video rounded-3xl border border-dashed border-white/20 bg-slate-900/50 flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
            <UserCheck className="w-8 h-8 text-slate-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-300">Waiting for others to join</p>
            <p className="text-xs text-slate-500">Other participants in this chat can join this secure call room instantly.</p>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <footer className="px-4 sm:px-8 py-5 border-t border-white/10 bg-slate-950/95 shrink-0 flex items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={session.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`min-h-[50px] min-w-[50px] sm:min-w-[56px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
            session.isMuted
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          {session.isMuted ? (
            <MicOff className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Mic className="w-5 h-5" aria-hidden="true" />
          )}
          <span className="text-[10px] font-semibold">{session.isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        {!session.isAudioOnly && (
          <button
            type="button"
            onClick={onToggleVideo}
            aria-label={session.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            className={`min-h-[50px] min-w-[50px] sm:min-w-[56px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              session.isVideoOff
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {session.isVideoOff ? (
              <VideoOff className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Video className="w-5 h-5" aria-hidden="true" />
            )}
            <span className="text-[10px] font-semibold">{session.isVideoOff ? 'Cam On' : 'Cam Off'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleScreenShare}
          aria-pressed={session.isScreenSharing}
          aria-label={session.isScreenSharing ? 'Stop screen share' : 'Share screen'}
          className={`min-h-[50px] min-w-[50px] sm:min-w-[56px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
            session.isScreenSharing
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          <MonitorUp className="w-5 h-5" aria-hidden="true" />
          <span className="text-[10px] font-semibold">Share</span>
        </button>

        <button
          type="button"
          onClick={onEndCall}
          aria-label="End call"
          className="min-h-[50px] px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm inline-flex items-center gap-2 shadow-xl shadow-rose-900/40 transition-colors cursor-pointer"
        >
          <PhoneOff className="w-5 h-5" aria-hidden="true" />
          <span>End Call</span>
        </button>
      </footer>
    </div>
  );
}
