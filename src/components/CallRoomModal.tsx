import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  RotateCcw,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth } from '../services/firebase';
import type { CallParticipant, CallSession, UserProfile } from '../types/social';
import {
  collectPendingRemoteTrackSubscriptions,
  extractCallsErrorMessage,
  formatRenegotiatePayload,
  formatSubscribeTracksPayload,
  formatTracksClosePayload,
  validateIceServersConfig,
} from '../utils/callsLogic';
import { Avatar } from './Avatar';

interface CallRoomModalProps {
  session: CallSession | null;
  profile: UserProfile;
  isLocalAutostart?: boolean;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onPublishPeerSession?: (
    callId: string,
    payload: {
      cfSessionId: string;
      audioTrackName?: string;
      videoTrackName?: string;
      isMuted: boolean;
      isVideoOff: boolean;
      isScreenSharing: boolean;
      state: 'joined' | 'declined' | 'left';
    }
  ) => Promise<void>;
  onSubscribeCallPeers?: (
    callId: string,
    onPeers: (peers: CallParticipant[]) => void
  ) => () => void;
}

type SfuConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

function createFallbackMediaStream(
  displayName: string,
  isAudioOnly: boolean
): MediaStream {
  const tracks: MediaStreamTrack[] = [];

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) tracks.push(audioTrack);
    }
  } catch {
    // Ignore audio context restriction errors
  }

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
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayName || 'Looma', canvas.width / 2, canvas.height / 2);
      }
      const canvasStream = canvas.captureStream ? canvas.captureStream(15) : null;
      const videoTrack = canvasStream?.getVideoTracks()[0];
      if (videoTrack) tracks.push(videoTrack);
    } catch {
      // Ignore canvas stream errors
    }
  }

  return new MediaStream(tracks);
}

function RemoteVideoPlayer({
  stream,
  muted,
}: {
  stream: MediaStream;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={Boolean(muted)}
      className="w-full h-full object-cover"
    />
  );
}

function RemoteAudioPlayer({
  stream,
  muted,
}: {
  stream: MediaStream;
  muted?: boolean;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline muted={Boolean(muted)} className="hidden" />;
}

interface RingingToneController {
  setMuted: (muted: boolean) => void;
  stop: () => void;
}

function playRingingTone(initialMuted: boolean): RingingToneController {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return { setMuted: () => {}, stop: () => {} };
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let muted = initialMuted;
    let toneOn = true;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(muted ? 0 : 0.04, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    const interval = window.setInterval(() => {
      toneOn = !toneOn;
      try {
        gain.gain.setValueAtTime(muted || !toneOn ? 0 : 0.04, ctx.currentTime);
      } catch {}
    }, 1200);

    return {
      setMuted: (nextMuted: boolean) => {
        muted = nextMuted;
        try {
          gain.gain.setValueAtTime(muted || !toneOn ? 0 : 0.04, ctx.currentTime);
        } catch {}
      },
      stop: () => {
        window.clearInterval(interval);
        try {
          osc.stop();
          ctx.close();
        } catch {}
      },
    };
  } catch {
    return { setMuted: () => {}, stop: () => {} };
  }
}

export function CallRoomModal({
  session,
  profile,
  isLocalAutostart = false,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onPublishPeerSession,
  onSubscribeCallPeers,
}: CallRoomModalProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isUsingFallbackStream, setIsUsingFallbackStream] = useState(false);
  const [cfSessionId, setCfSessionId] = useState<string | null>(null);
  const [cfStatus, setCfStatus] = useState<SfuConnectionStatus>('connecting');
  const [cfError, setCfError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [showParticipantsDrawer, setShowParticipantsDrawer] = useState(false);
  const [swappedLocalToMain, setSwappedLocalToMain] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const cfSessionIdRef = useRef<string | null>(null);
  const publishedMidsRef = useRef<string[]>([]);
  const subscribedTrackKeysRef = useRef<Set<string>>(new Set());
  const midToPeerUidRef = useRef<Map<string, string>>(new Map());
  const peersRef = useRef<CallParticipant[]>([]);
  const subscribeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioTrackNameRef = useRef<string>('');
  const videoTrackNameRef = useRef<string>('');
  const onPublishPeerRef = useRef(onPublishPeerSession);
  const onSubscribePeersRef = useRef(onSubscribeCallPeers);
  const ringingToneRef = useRef<RingingToneController | null>(null);
  const speakerMutedRef = useRef(isSpeakerMuted);

  useEffect(() => {
    speakerMutedRef.current = isSpeakerMuted;
    ringingToneRef.current?.setMuted(isSpeakerMuted);
  }, [isSpeakerMuted]);

  useEffect(() => {
    onPublishPeerRef.current = onPublishPeerSession;
  }, [onPublishPeerSession]);

  useEffect(() => {
    onSubscribePeersRef.current = onSubscribeCallPeers;
  }, [onSubscribeCallPeers]);

  useEffect(() => {
    peersRef.current = session?.participants || [];
  }, [session?.participants]);

  const joinedParticipantsCount =
    session?.participants.filter((p) => p.connectionState === 'joined').length || 0;

  // Call timer starts only when session.status === 'active' and at least 2 parties have accepted/joined
  useEffect(() => {
    if (
      !session ||
      !session.active ||
      session.status !== 'active' ||
      joinedParticipantsCount < 2
    ) {
      setElapsedSec(0);
      if (!session || !session.active) {
        setIsSpeakerMuted(false);
        setShowParticipantsDrawer(false);
        setSwappedLocalToMain(false);
      }
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session?.active, session?.status, joinedParticipantsCount]);

  // Ringing tone while waiting for call to be answered
  useEffect(() => {
    if (!session || !session.active || session.status !== 'ringing') {
      ringingToneRef.current?.stop();
      ringingToneRef.current = null;
      return;
    }
    const controller = playRingingTone(speakerMutedRef.current);
    ringingToneRef.current = controller;
    return () => {
      controller.stop();
      if (ringingToneRef.current === controller) {
        ringingToneRef.current = null;
      }
    };
  }, [session?.active, session?.status]);

  // Keep local video element synchronized when toggling camera / screen share / stage swap
  useEffect(() => {
    if (!localVideoRef.current) return;
    const displayStream = session?.isScreenSharing && screenStream ? screenStream : localStream;
    localVideoRef.current.srcObject = displayStream || null;
  }, [
    localStream,
    screenStream,
    session?.isScreenSharing,
    session?.isVideoOff,
    session?.isAudioOnly,
    swappedLocalToMain,
  ]);

  // Main hardware capture + authenticated Cloudflare Calls WebRTC negotiation
  useEffect(() => {
    if (!session || !session.active) {
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          track.stop();
        }
        localStreamRef.current = null;
        setLocalStream(null);
      }
      setScreenStream((prev) => {
        if (prev) {
          for (const t of prev.getTracks()) t.stop();
        }
        return null;
      });
      setCameraError(null);
      setCfSessionId(null);
      cfSessionIdRef.current = null;
      sessionTokenRef.current = null;
      publishedMidsRef.current = [];
      subscribedTrackKeysRef.current.clear();
      midToPeerUidRef.current.clear();
      setRemoteStreams({});
      setCfStatus('connecting');
      setCfError(null);
      return;
    }

    let activeStream: MediaStream | null = null;
    let peerConn: RTCPeerConnection | null = null;
    let unsubPeers: (() => void) | null = null;
    let cancelled = false;
    const callId = session.callId || session.chatId;
    const idempotencyKey = `looma-${callId}-${profile.uid}-${retryNonce}`;

    const initMediaAndSignaling = async () => {
      let stream: MediaStream | null = null;
      let hardwareIssue: string | null = null;

      // 1. Request hardware camera / microphone
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: !session.isAudioOnly,
            audio: true,
          });
        } catch (err) {
          if (!session.isAudioOnly) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true,
              });
              hardwareIssue =
                'Camera permission denied or unavailable. Running with audio only.';
            } catch {
              const name = err instanceof Error ? err.name : '';
              hardwareIssue =
                name === 'NotAllowedError'
                  ? 'Camera and microphone permissions were denied by your browser.'
                  : 'No active camera or microphone detected by your browser.';
            }
          } else {
            const name = err instanceof Error ? err.name : '';
            hardwareIssue =
              name === 'NotAllowedError'
                ? 'Microphone permission was denied by your browser.'
                : 'No active microphone detected by your browser.';
          }
        }
      } else {
        hardwareIssue = 'This browser does not support getUserMedia hardware capture.';
      }

      if (!stream) {
        stream = createFallbackMediaStream(profile.displayName, session.isAudioOnly);
        setIsUsingFallbackStream(true);
        setCameraError(
          hardwareIssue
            ? `${hardwareIssue} Using silent fallback stream.`
            : 'Using fallback media stream. Click Retry Hardware to attach mic/cam.'
        );
      } else {
        setIsUsingFallbackStream(false);
        setCameraError(hardwareIssue);
      }

      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      for (const track of stream.getAudioTracks()) {
        track.enabled = !session.isMuted;
      }
      for (const track of stream.getVideoTracks()) {
        track.enabled = !session.isAudioOnly && !session.isVideoOff;
      }

      activeStream = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Require authenticated Firebase ID token before calling protected Calls endpoints
      setCfStatus('connecting');
      setCfError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setCfStatus('error');
        setCfError(
          isLocalAutostart
            ? 'Sign in with a verified account to establish a live call connection.'
            : 'Authentication required to connect this call.'
        );
        return;
      }

      try {
        const idToken = await currentUser.getIdToken();
        if (cancelled) return;

        const res = await fetch('/api/calls/sessions/new', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ callId, idempotencyKey }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          sessionId?: string;
          sessionToken?: string;
          iceServers?: RTCIceServer[];
          error?: string;
          errorDescription?: string;
        };

        if (!res.ok || !data.sessionId || !data.sessionToken) {
          throw new Error(extractCallsErrorMessage(data, res.status));
        }
        if (cancelled) return;

        const newSessionId = data.sessionId;
        const newSessionToken = data.sessionToken;
        cfSessionIdRef.current = newSessionId;
        sessionTokenRef.current = newSessionToken;
        setCfSessionId(newSessionId);

        if (typeof RTCPeerConnection === 'undefined') {
          throw new Error('WebRTC RTCPeerConnection is not supported in this browser.');
        }

        const iceValidation = validateIceServersConfig(data.iceServers);
        if (!iceValidation.valid) {
          throw new Error(
            iceValidation.error ||
              'Server returned invalid ICE/TURN server configuration.'
          );
        }

        const pc = new RTCPeerConnection({
          iceServers: iceValidation.iceServers,
        });
        peerConn = pc;
        peerConnRef.current = pc;

        let iceRestartCount = 0;

        const handleConnectionRecovery = (stateLabel: string) => {
          if (cancelled) return;
          if (stateLabel === 'connected' || stateLabel === 'completed') {
            iceRestartCount = 0;
            setCfStatus('connected');
            setCfError(null);
          } else if (stateLabel === 'disconnected') {
            setCfStatus('reconnecting');
            setCfError('Connection interrupted. Attempting ICE reconnection...');
            if (iceRestartCount < 2 && typeof pc.restartIce === 'function') {
              iceRestartCount += 1;
              try {
                pc.restartIce();
              } catch {
                // Ignore restartIce errors on closing connections
              }
            }
          } else if (stateLabel === 'failed') {
            if (iceRestartCount < 1 && typeof pc.restartIce === 'function') {
              iceRestartCount += 1;
              setCfStatus('reconnecting');
              setCfError('Network path failed. Restarting ICE connection...');
              try {
                pc.restartIce();
              } catch {
                setCfStatus('error');
                setCfError(
                  'WebRTC peer connection failed. Check network or TURN credentials.'
                );
              }
            } else {
              setCfStatus('error');
              setCfError(
                'WebRTC peer connection failed. Check network or TURN credentials.'
              );
            }
          }
        };

        pc.onconnectionstatechange = () => {
          handleConnectionRecovery(pc.connectionState);
        };

        pc.oniceconnectionstatechange = () => {
          handleConnectionRecovery(pc.iceConnectionState);
        };

        pc.ontrack = (event) => {
          if (cancelled) return;
          const mid = event.transceiver?.mid || '';
          const matchedUid =
            (mid && midToPeerUidRef.current.get(mid)) ||
            peersRef.current.find(
              (p) => p.uid !== profile.uid && p.connectionState === 'joined'
            )?.uid ||
            `remote-${mid || event.track.id}`;

          setRemoteStreams((prev) => {
            const existing = prev[matchedUid];
            if (existing) {
              if (!existing.getTracks().some((t) => t.id === event.track.id)) {
                existing.addTrack(event.track);
              }
              return { ...prev, [matchedUid]: new MediaStream(existing.getTracks()) };
            }
            const nextStream = event.streams?.[0]
              ? event.streams[0]
              : new MediaStream([event.track]);
            return { ...prev, [matchedUid]: nextStream };
          });
        };

        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (pc.iceGatheringState !== 'complete') {
          await new Promise<void>((resolve) => {
            const onState = () => {
              if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', onState);
                resolve();
              }
            };
            pc.addEventListener('icegatheringstatechange', onState);
            window.setTimeout(() => {
              pc.removeEventListener('icegatheringstatechange', onState);
              resolve();
            }, 1400);
          });
        }

        if (cancelled) return;

        const audioName = `audio-${profile.uid}`;
        const videoName = `video-${profile.uid}`;
        let hasAudio = false;
        let hasVideo = false;
        const trackRequests = pc
          .getTransceivers()
          .filter((t) => t.sender.track)
          .map((t, i) => {
            const kind = t.sender.track?.kind === 'video' ? 'video' : 'audio';
            if (kind === 'audio') hasAudio = true;
            if (kind === 'video') hasVideo = true;
            return {
              location: 'local' as const,
              mid: t.mid || String(i),
              trackName: kind === 'audio' ? audioName : videoName,
            };
          });

        audioTrackNameRef.current = hasAudio ? audioName : '';
        videoTrackNameRef.current = hasVideo ? videoName : '';

        const sdpToSend = pc.localDescription?.sdp || offer.sdp || '';
        const pubRes = await fetch(
          `/api/calls/sessions/${encodeURIComponent(newSessionId)}/tracks/new`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'X-Call-Session-Token': newSessionToken,
              'Content-Type': 'application/json',
            },
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
          tracks?: Array<{ mid?: string; errorCode?: string; errorDescription?: string }>;
          error?: string;
          errorCode?: string;
          errorDescription?: string;
        };

        const trackFailure = Array.isArray(pubData.tracks)
          ? pubData.tracks.find((t) => Boolean(t.errorCode || t.errorDescription))
          : undefined;

        if (!pubRes.ok || !pubData.sessionDescription || pubData.errorCode || trackFailure) {
          throw new Error(extractCallsErrorMessage(pubData, pubRes.status));
        }

        await pc.setRemoteDescription(
          new RTCSessionDescription(
            pubData.sessionDescription as RTCSessionDescriptionInit
          )
        );

        publishedMidsRef.current = trackRequests.map((t) => t.mid);
        if (cancelled) return;

        // Only transition to connected strictly after SFU session + SDP answer succeed
        setCfStatus('connected');
        setCfError(null);

        if (onPublishPeerRef.current && session.callId) {
          await onPublishPeerRef.current(session.callId, {
            cfSessionId: newSessionId,
            audioTrackName: audioTrackNameRef.current,
            videoTrackName: videoTrackNameRef.current,
            isMuted: session.isMuted,
            isVideoOff: session.isVideoOff,
            isScreenSharing: session.isScreenSharing,
            state: 'joined',
          });
        }

        // Subscribe to remote peers via Firestore room peers subcollection
        if (onSubscribePeersRef.current && session.callId) {
          unsubPeers = onSubscribePeersRef.current(session.callId, (peers) => {
            peersRef.current = peers;
            const pending = collectPendingRemoteTrackSubscriptions(
              peers,
              profile.uid,
              subscribedTrackKeysRef.current
            );
            if (pending.length === 0) return;

            for (const item of pending) {
              subscribedTrackKeysRef.current.add(item.key);
            }

            subscribeQueueRef.current = subscribeQueueRef.current
              .then(async () => {
                if (cancelled || !peerConnRef.current || !cfSessionIdRef.current) return;
                const freshToken = (await auth.currentUser?.getIdToken()) || idToken;
                const subPayload = formatSubscribeTracksPayload(
                  pending.map((p) => ({
                    sessionId: p.sessionId,
                    trackName: p.trackName,
                  }))
                );
                if (subPayload.tracks.length === 0) return;

                const subRes = await fetch(
                  `/api/calls/sessions/${encodeURIComponent(
                    cfSessionIdRef.current
                  )}/tracks/new`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${freshToken}`,
                      'X-Call-Session-Token': newSessionToken,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(subPayload),
                  }
                );

                const subData = (await subRes.json().catch(() => ({}))) as {
                  requiresImmediateRenegotiation?: boolean;
                  sessionDescription?: { type: string; sdp: string };
                  tracks?: Array<{ mid?: string; trackName?: string; sessionId?: string }>;
                };
                if (!subRes.ok) {
                  for (const item of pending) {
                    subscribedTrackKeysRef.current.delete(item.key);
                  }
                  return;
                }

                if (Array.isArray(subData.tracks)) {
                  subData.tracks.forEach((returnedTrack, idx) => {
                    const matched = pending[idx];
                    if (returnedTrack.mid && matched) {
                      midToPeerUidRef.current.set(returnedTrack.mid, matched.uid);
                    }
                  });
                }

                if (subData.requiresImmediateRenegotiation && subData.sessionDescription) {
                  await peerConnRef.current.setRemoteDescription(
                    new RTCSessionDescription(
                      subData.sessionDescription as RTCSessionDescriptionInit
                    )
                  );
                  const answer = await peerConnRef.current.createAnswer();
                  await peerConnRef.current.setLocalDescription(answer);
                  const answerSdp = peerConnRef.current.localDescription?.sdp || answer.sdp || '';

                  await fetch(
                    `/api/calls/sessions/${encodeURIComponent(
                      cfSessionIdRef.current
                    )}/renegotiate`,
                    {
                      method: 'PUT',
                      headers: {
                        Authorization: `Bearer ${freshToken}`,
                        'X-Call-Session-Token': newSessionToken,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(formatRenegotiatePayload(answerSdp)),
                    }
                  );
                }
              })
              .catch((subErr) => {
                console.warn('[Cloudflare Calls remote subscription error]', subErr);
              });
          });
        }
      } catch (err) {
        if (cancelled) return;
        setCfStatus('error');
        setCfError(
          err instanceof Error
            ? err.message
            : 'Unable to establish live call connection.'
        );
      }
    };

    void initMediaAndSignaling();

    return () => {
      cancelled = true;
      if (unsubPeers) unsubPeers();
      const closingSessionId = cfSessionIdRef.current;
      const closingToken = sessionTokenRef.current;
      const closingMids = [...publishedMidsRef.current];
      if (closingSessionId && closingToken && closingMids.length > 0 && auth.currentUser) {
        void auth.currentUser
          .getIdToken()
          .then((token) =>
            fetch(
              `/api/calls/sessions/${encodeURIComponent(closingSessionId)}/tracks/close`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'X-Call-Session-Token': closingToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(formatTracksClosePayload(closingMids, true)),
              }
            )
          )
          .catch(() => {});
      }

      if (peerConn) {
        peerConn.close();
      }
      peerConnRef.current = null;
      if (activeStream) {
        for (const track of activeStream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [
    session?.active,
    session?.callId,
    session?.chatId,
    session?.isAudioOnly,
    profile.uid,
    profile.displayName,
    isLocalAutostart,
    retryNonce,
  ]);

  // Apply mute & camera enabled toggles + notify peers in Firestore
  useEffect(() => {
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getAudioTracks()) {
        track.enabled = !session?.isMuted;
      }
      for (const track of stream.getVideoTracks()) {
        track.enabled = !session?.isAudioOnly && !session?.isVideoOff;
      }
    }

    if (
      session?.active &&
      session.callId &&
      cfSessionIdRef.current &&
      cfStatus === 'connected' &&
      onPublishPeerRef.current
    ) {
      void onPublishPeerRef.current(session.callId, {
        cfSessionId: cfSessionIdRef.current,
        audioTrackName: audioTrackNameRef.current,
        videoTrackName: videoTrackNameRef.current,
        isMuted: Boolean(session.isMuted),
        isVideoOff: Boolean(session.isVideoOff),
        isScreenSharing: Boolean(session.isScreenSharing),
        state: 'joined',
      });
    }
  }, [
    session?.active,
    session?.callId,
    session?.isMuted,
    session?.isVideoOff,
    session?.isAudioOnly,
    session?.isScreenSharing,
    cfStatus,
  ]);

  // Screen share acquisition & sender track replacement
  useEffect(() => {
    const findVideoSender = () => {
      const pc = peerConnRef.current;
      if (!pc) return undefined;
      return (
        pc.getSenders().find((s) => s.track?.kind === 'video') ||
        pc
          .getTransceivers()
          .find(
            (t) =>
              t.sender.track?.kind === 'video' || t.receiver.track?.kind === 'video'
          )?.sender
      );
    };

    if (!session?.isScreenSharing) {
      setScreenStream((prev) => {
        if (prev) {
          for (const track of prev.getTracks()) track.stop();
        }
        return null;
      });
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      const videoSender = findVideoSender();
      if (camTrack && videoSender) {
        void videoSender.replaceTrack(camTrack).catch(() => {});
      }
      return;
    }

    let cancelled = false;
    const startScreen = async () => {
      try {
        if (
          typeof navigator === 'undefined' ||
          !(navigator.mediaDevices as { getDisplayMedia?: unknown } | undefined)
            ?.getDisplayMedia
        ) {
          throw new Error('Screen sharing is not supported in this browser.');
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        setScreenStream(stream);
        const screenTrack = stream.getVideoTracks()[0];
        if (screenTrack) {
          const videoSender = findVideoSender();
          if (videoSender) {
            await videoSender.replaceTrack(screenTrack).catch(() => {});
          }
          screenTrack.onended = () => {
            onToggleScreenShare();
          };
        }
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? err.message
            : 'Screen sharing permission was declined or unavailable.'
        );
        onToggleScreenShare();
      }
    };
    void startScreen();
    return () => {
      cancelled = true;
    };
  }, [session?.isScreenSharing]);

  // If user turns Cam On while current stream has no video tracks (e.g. started with audio-only hardware fallback), try acquiring camera
  useEffect(() => {
    if (
      !session?.active ||
      session.isAudioOnly ||
      session.isVideoOff ||
      session.isScreenSharing
    ) {
      return;
    }
    const currentStream = localStreamRef.current;
    if (!currentStream || currentStream.getVideoTracks().length > 0) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then(async (camStream) => {
        if (cancelled) {
          for (const t of camStream.getTracks()) t.stop();
          return;
        }
        const newVideoTrack = camStream.getVideoTracks()[0];
        if (!newVideoTrack) return;
        const baseStream = localStreamRef.current || new MediaStream();
        baseStream.addTrack(newVideoTrack);
        localStreamRef.current = baseStream;
        const updatedStream = new MediaStream(baseStream.getTracks());
        setLocalStream(updatedStream);
        setIsUsingFallbackStream(false);
        setCameraError(null);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = updatedStream;
        }
        if (peerConnRef.current) {
          const videoSender =
            peerConnRef.current
              .getSenders()
              .find((s) => s.track?.kind === 'video') ||
            peerConnRef.current
              .getTransceivers()
              .find(
                (t) =>
                  t.sender.track?.kind === 'video' ||
                  t.receiver.track?.kind === 'video'
              )?.sender;
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack).catch(() => {});
          } else {
            peerConnRef.current.addTrack(newVideoTrack, updatedStream);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    session?.active,
    session?.isAudioOnly,
    session?.isVideoOff,
    session?.isScreenSharing,
  ]);

  if (!session || !session.active) return null;

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRetryHardware = async () => {
    try {
      const hwStream = await navigator.mediaDevices.getUserMedia({
        video: !session.isAudioOnly && !session.isVideoOff,
        audio: true,
      });
      if (peerConnRef.current) {
        const nextAudio = hwStream.getAudioTracks()[0];
        const nextVideo = hwStream.getVideoTracks()[0];
        for (const transceiver of peerConnRef.current.getTransceivers()) {
          const kind =
            transceiver.sender.track?.kind || transceiver.receiver.track?.kind;
          if (kind === 'audio' && nextAudio) {
            await transceiver.sender.replaceTrack(nextAudio);
          } else if (kind === 'video' && nextVideo) {
            await transceiver.sender.replaceTrack(nextVideo);
          }
        }
      }
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
      localStreamRef.current = hwStream;
      setLocalStream(hwStream);
      setIsUsingFallbackStream(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = hwStream;
      }
      setCameraError(null);
    } catch {
      setCameraError('Microphone/camera access still blocked by browser permissions.');
    }
  };

  const remoteParticipants = session.participants.filter(
    (p) => p.uid !== profile.uid
  );

  const statusMeta =
    session.status === 'active' && cfStatus === 'connected'
      ? { dot: 'bg-emerald-400', textColor: 'text-emerald-400', label: 'Live Call' }
      : session.status === 'ringing'
        ? { dot: 'bg-amber-400', textColor: 'text-amber-300', label: 'Ringing / Calling...' }
        : cfStatus === 'reconnecting'
          ? { dot: 'bg-amber-400', textColor: 'text-amber-300', label: 'Reconnecting...' }
          : cfStatus === 'error'
            ? { dot: 'bg-rose-500', textColor: 'text-rose-400', label: 'Connection Error' }
            : { dot: 'bg-blue-400', textColor: 'text-blue-300', label: 'Connecting...' };

  const getPeerStatusText = (peer: CallParticipant) =>
    peer.connectionState === 'declined'
      ? 'Declined call'
      : peer.connectionState === 'left'
        ? 'Left the room'
        : peer.connectionState === 'invited'
          ? 'Ringing / Invited...'
          : peer.isScreenSharing
            ? 'Sharing screen'
            : peer.isMuted
              ? 'Joined · Muted'
              : 'Joined · Live audio';

  const renderLocalVideoTile = (className: string, isCompact = false) => {
    const showAvatarPlaceholder =
      (session.isVideoOff || isUsingFallbackStream) && !session.isScreenSharing;
    return (
      <div
        className={`relative rounded-3xl bg-slate-900 border border-white/15 overflow-hidden shadow-2xl flex flex-col items-center justify-center ${className}`}
      >
        {showAvatarPlaceholder ? (
          <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName}
              size={isCompact ? 'md' : 'xl'}
            />
            {!isCompact && (
              <div>
                <p className="font-display text-base font-bold text-white">
                  {profile.displayName} (You)
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {isUsingFallbackStream
                    ? 'Camera unavailable — silent stream active'
                    : 'Camera turned off'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              session.isScreenSharing ? '' : 'scale-x-[-1]'
            }`}
          />
        )}

        <div
          className={`absolute ${
            isCompact
              ? 'bottom-2 left-2 right-2 px-2.5 py-1.5 rounded-xl text-[11px]'
              : 'bottom-3 left-3 right-3 px-3.5 py-2 rounded-2xl text-xs'
          } flex items-center justify-between gap-2 bg-black/65 backdrop-blur-md border border-white/10`}
        >
          <span className="font-semibold truncate">
            {isCompact ? 'You' : `${profile.displayName} (You)`}
            {session.isScreenSharing ? ' · Screen' : ''}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {session.isMuted ? (
              <MicOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            )}
            {session.isVideoOff && (
              <VideoOff className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRemoteVideoTile = (
    peer: CallParticipant,
    className: string,
    isCompact = false
  ) => {
    const remoteStream = remoteStreams[peer.uid];
    const hasRemoteVideo =
      Boolean(remoteStream?.getVideoTracks().length) && !peer.isVideoOff;

    return (
      <div
        key={peer.uid}
        className={`relative rounded-3xl bg-slate-900 border border-white/15 overflow-hidden shadow-2xl flex flex-col items-center justify-center ${className}`}
      >
        {remoteStream && hasRemoteVideo ? (
          <RemoteVideoPlayer stream={remoteStream} muted={isSpeakerMuted} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <Avatar
              src={peer.avatar}
              name={peer.name}
              size={isCompact ? 'md' : 'xl'}
            />
            {!isCompact && (
              <div>
                <p className="font-display text-base font-bold text-white">
                  {peer.name}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {getPeerStatusText(peer)}
                </p>
              </div>
            )}
          </div>
        )}

        {remoteStream &&
          !hasRemoteVideo &&
          remoteStream.getAudioTracks().length > 0 && (
            <RemoteAudioPlayer stream={remoteStream} muted={isSpeakerMuted} />
          )}

        <div
          className={`absolute ${
            isCompact
              ? 'bottom-2 left-2 right-2 px-2.5 py-1.5 rounded-xl text-[11px]'
              : 'bottom-3 left-3 right-3 px-3.5 py-2 rounded-2xl text-xs'
          } flex items-center justify-between gap-2 bg-black/65 backdrop-blur-md border border-white/10`}
        >
          <span className="font-semibold truncate">{peer.name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {peer.isMuted ? (
              <MicOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        session.isAudioOnly
          ? 'Looma Voice Call Room'
          : 'Looma Video Call Room'
      }
      data-testid="call-room-modal"
      data-call-mode={session.isAudioOnly ? 'audio' : 'video'}
      className="fixed inset-0 z-50 h-[100dvh] w-screen bg-slate-950 text-white flex flex-col overflow-hidden"
    >
      {/* Top Studio Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 bg-slate-950/90 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
              session.isAudioOnly
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
            }`}
          >
            {session.isAudioOnly ? (
              <Phone className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Video className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-bold text-white truncate">
              {session.title}
            </h2>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
              <span
                data-testid="calls-connection-status"
                className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.textColor}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
                <span>{statusMeta.label}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-mono text-slate-200">
                {formatDuration(elapsedSec)}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowParticipantsDrawer((v) => !v)}
          aria-expanded={showParticipantsDrawer}
          aria-label="Toggle call participants list"
          className="min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <Users className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <span className="tabular-nums">{session.participants.length} in call</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Honest Error & Hardware Banners (No Overlapping Over Controls) */}
          {(cfError || cameraError) && (
            <div className="px-4 sm:px-6 pt-3 space-y-2 max-w-5xl mx-auto w-full shrink-0">
              {cfError && (
                <div
                  role="alert"
                  data-testid="calls-error-banner"
                  className="px-4 py-2.5 rounded-2xl bg-rose-950/85 border border-rose-500/40 text-xs text-rose-100 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                    <span>{cfError}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cfStatus === 'error' && (
                      <button
                        type="button"
                        onClick={() => setRetryNonce((n) => n + 1)}
                        className="min-h-[34px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Retry Connection</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCfError(null)}
                      aria-label="Dismiss connection notice"
                      className="min-h-[34px] min-w-[34px] rounded-xl bg-white/10 hover:bg-white/20 text-rose-100 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="px-4 py-2.5 rounded-2xl bg-amber-950/70 border border-amber-500/40 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate">{cameraError}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleRetryHardware}
                      className="min-h-[34px] px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold cursor-pointer text-xs"
                    >
                      Retry Hardware
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraError(null)}
                      aria-label="Dismiss hardware notice"
                      className="min-h-[34px] min-w-[34px] rounded-xl bg-white/10 hover:bg-white/20 text-amber-100 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main Stage: Distinct Audio Call Studio vs Adaptive Video Call Stage */}
          {session.isAudioOnly ? (
            <main
              data-testid="audio-call-stage"
              className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto relative"
            >
          {/* Always mount hidden audio tracks for every remote participant */}
          {remoteParticipants.map((peer) => {
            const remoteStream = remoteStreams[peer.uid];
            if (!remoteStream || remoteStream.getAudioTracks().length === 0) {
              return null;
            }
            return (
              <RemoteAudioPlayer
                key={`audio-${peer.uid}`}
                stream={remoteStream}
                muted={isSpeakerMuted}
              />
            );
          })}

          {remoteParticipants.length <= 1 ? (() => {
            const primaryPartner = remoteParticipants[0];
            const focalName = primaryPartner ? primaryPartner.name : session.title;
            const focalAvatar = primaryPartner
              ? primaryPartner.avatar
              : profile.avatarUrl;
            const focalStatus = primaryPartner
              ? getPeerStatusText(primaryPartner)
              : isUsingFallbackStream
                ? 'Microphone unavailable — waiting for others'
                : session.isMuted
                  ? 'Microphone muted · Waiting for partner'
                  : 'Voice ready · Waiting for partner';

            return (
              <div className="flex flex-col items-center text-center max-w-md w-full space-y-6">
                <div className="relative flex items-center justify-center">
                  <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-full border border-white/10 flex items-center justify-center bg-slate-900/40">
                    <div
                      className={`w-40 h-40 sm:w-44 sm:h-44 rounded-full border flex items-center justify-center transition-colors ${
                        cfStatus === 'connected' && !session.isMuted
                          ? 'border-emerald-400/50 bg-emerald-500/10'
                          : 'border-white/15 bg-slate-900/80'
                      }`}
                    >
                      <Avatar
                        src={focalAvatar}
                        name={focalName}
                        size="xl"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    {primaryPartner ? 'Voice Call' : 'Voice Room'}
                  </p>
                  <h3 className="font-display text-2xl sm:text-3xl font-bold text-white">
                    {focalName}
                  </h3>
                  <p className="text-sm text-slate-300">{focalStatus}</p>
                </div>

                <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900 border border-white/10 text-xs text-slate-300">
                  {session.isMuted ? (
                    <MicOff className="w-4 h-4 text-rose-400" aria-hidden="true" />
                  ) : (
                    <Mic className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  )}
                  <span>
                    {profile.displayName} (You) ·{' '}
                    {session.isMuted ? 'Muted' : 'Mic active'}
                  </span>
                </div>
              </div>
            );
          })() : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl w-full">
              {/* Self Card */}
              <div className="rounded-3xl bg-slate-900 border border-white/15 p-5 flex flex-col items-center text-center gap-3">
                <Avatar
                  src={profile.avatarUrl}
                  name={profile.displayName}
                  size="lg"
                />
                <div className="min-w-0 w-full">
                  <p className="text-sm font-bold text-white truncate">
                    {profile.displayName} (You)
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 inline-flex items-center gap-1">
                    {session.isMuted ? (
                      <>
                        <MicOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        <span>Mic active</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {remoteParticipants.map((peer) => (
                <div
                  key={peer.uid}
                  className="rounded-3xl bg-slate-900 border border-white/15 p-5 flex flex-col items-center text-center gap-3"
                >
                  <Avatar src={peer.avatar} name={peer.name} size="lg" />
                  <div className="min-w-0 w-full">
                    <p className="text-sm font-bold text-white truncate">
                      {peer.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 inline-flex items-center gap-1">
                      {peer.isMuted ? (
                        <MicOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      )}
                      <span className="truncate">{getPeerStatusText(peer)}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      ) : (
        <main
          data-testid="video-call-stage"
          className="flex-1 min-h-0 p-3 sm:p-5 flex flex-col overflow-hidden relative"
        >
          {remoteParticipants.length === 0 && (
            <div className="relative flex-1 min-h-0 max-w-5xl mx-auto w-full flex flex-col">
              {renderLocalVideoTile('w-full flex-1 min-h-0')}
              <div className="mt-3 flex items-center justify-center">
                <p className="text-xs text-slate-400 bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2">
                  Room is ready · Invited participants will appear automatically when they join
                </p>
              </div>
            </div>
          )}

          {remoteParticipants.length === 1 && (() => {
            const partner = remoteParticipants[0];
            return (
              <div className="relative flex-1 min-h-0 max-w-6xl mx-auto w-full">
                {swappedLocalToMain
                  ? renderLocalVideoTile('w-full h-full')
                  : renderRemoteVideoTile(partner, 'w-full h-full')}

                <button
                  type="button"
                  onClick={() => setSwappedLocalToMain((v) => !v)}
                  aria-label="Swap main video and self preview"
                  className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 w-36 sm:w-56 aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 border-white/25 hover:border-blue-400 transition-colors cursor-pointer z-20 text-left group"
                >
                  {swappedLocalToMain
                    ? renderRemoteVideoTile(partner, 'w-full h-full rounded-none border-0', true)
                    : renderLocalVideoTile('w-full h-full rounded-none border-0', true)}
                  <span className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </button>
              </div>
            );
          })()}

          {remoteParticipants.length >= 2 && (
            <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 auto-rows-fr overflow-y-auto">
              {renderLocalVideoTile('min-h-[200px] h-full')}
              {remoteParticipants.map((peer) =>
                renderRemoteVideoTile(peer, 'min-h-[200px] h-full')
              )}
            </div>
          )}
        </main>
      )}

        </div>

        {/* Slide-Over / Side-Docked Participants Drawer */}
        {showParticipantsDrawer && (
          <aside
            aria-label="Participants in call"
            data-testid="call-participants-drawer"
            className="absolute inset-0 sm:static sm:inset-auto w-full sm:w-80 shrink-0 bg-slate-900/95 backdrop-blur-xl border-l border-white/15 z-40 flex flex-col shadow-2xl"
          >
            <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-white">
                Participants ({session.participants.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowParticipantsDrawer(false)}
                aria-label="Close participants drawer"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {session.participants.map((p) => {
                const isSelf = p.uid === profile.uid;
                return (
                  <div
                    key={p.uid}
                    className="p-3 rounded-2xl bg-slate-950/60 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={p.avatar} name={p.name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {p.name} {isSelf ? '(You)' : ''}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {isSelf
                            ? session.isMuted
                              ? 'Muted'
                              : 'Mic active'
                            : getPeerStatusText(p)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(isSelf ? session.isMuted : p.isMuted) ? (
                        <MicOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      )}
                      {!session.isAudioOnly &&
                        ((isSelf ? session.isVideoOff : p.isVideoOff) ? (
                          <VideoOff className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        ) : (
                          <Video className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* Floating Studio Control Dock */}
      <footer className="relative z-50 px-4 py-4 pb-5 bg-slate-950/95 border-t border-white/10 shrink-0 flex justify-center">
        <div className="inline-flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 rounded-3xl bg-slate-900 border border-white/15 shadow-2xl">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={session.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`min-h-[52px] min-w-[58px] px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              session.isMuted
                ? 'bg-rose-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {session.isMuted ? (
              <MicOff className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Mic className="w-5 h-5" aria-hidden="true" />
            )}
            <span className="text-[10px] font-semibold">
              {session.isMuted ? 'Unmute' : 'Mute'}
            </span>
          </button>

          {!session.isAudioOnly && (
            <button
              type="button"
              onClick={onToggleVideo}
              aria-label={session.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              className={`min-h-[52px] min-w-[58px] px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                session.isVideoOff
                  ? 'bg-rose-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {session.isVideoOff ? (
                <VideoOff className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Video className="w-5 h-5" aria-hidden="true" />
              )}
              <span className="text-[10px] font-semibold">
                {session.isVideoOff ? 'Cam On' : 'Cam Off'}
              </span>
            </button>
          )}

          {!session.isAudioOnly && (
            <button
              type="button"
              onClick={onToggleScreenShare}
              aria-pressed={session.isScreenSharing}
              aria-label={session.isScreenSharing ? 'Stop screen share' : 'Share screen'}
              className={`min-h-[52px] min-w-[58px] px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                session.isScreenSharing
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <MonitorUp className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-semibold">Share</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSpeakerMuted((v) => !v)}
            aria-pressed={isSpeakerMuted}
            aria-label={isSpeakerMuted ? 'Unmute call speaker' : 'Mute call speaker'}
            className={`min-h-[52px] min-w-[58px] px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              isSpeakerMuted
                ? 'bg-amber-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {isSpeakerMuted ? (
              <VolumeX className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Volume2 className="w-5 h-5" aria-hidden="true" />
            )}
            <span className="text-[10px] font-semibold">
              {isSpeakerMuted ? 'Audio Off' : 'Speaker'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowParticipantsDrawer((v) => !v)}
            aria-pressed={showParticipantsDrawer}
            aria-label="View call participants"
            className={`min-h-[52px] min-w-[58px] px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              showParticipantsDrawer
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Users className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] font-semibold">People</span>
          </button>

          <button
            type="button"
            onClick={onEndCall}
            aria-label="End call"
            className="min-h-[52px] px-5 sm:px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
          >
            <PhoneOff className="w-5 h-5" aria-hidden="true" />
            <span>End Call</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
