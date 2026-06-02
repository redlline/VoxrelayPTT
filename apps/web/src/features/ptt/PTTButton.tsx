import { useEffect, useRef, useCallback, useState } from 'react';
import { Mic, MicOff, Loader2, WifiOff, VolumeX } from 'lucide-react';
import { usePTTStore } from './store';
import { wsClient } from '@/lib/ws';
import { createProducer, closeTransports, createSendTransport } from '@/lib/mediasoup';
import { playPttDownTone, playPttUpTone } from '@/lib/sfx';
import { LocalPttRecorder } from '@/lib/ptt-recorder';
import { useAuthStore } from '@/features/auth/store';
import toast from 'react-hot-toast';

interface Props {
  channelId: string;
}

export function PTTButton({ channelId }: Props) {
  const accessToken = useAuthStore((s: any) => s.accessToken);
  const userId = useAuthStore((s: any) => s.user?.id);
  const {
    setPTTActive,
    setMicEnabled,
    setAudioStream,
    setAudioLevel,
    producer, setProducer,
    setFloorGranted, setFloorQueued,
    floorQueued, isReconnecting, setReconnecting,
    isMicEnabled,
    isMuted,
  } = usePTTStore();

  const [ready, setReady] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const isSecureAudioContext =
    window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const localRecorderRef = useRef<LocalPttRecorder | null>(null);
  const readyRef = useRef(false);
  const holdingRef = useRef(false);
  /** Incremented only on stop — in-flight start checks this token */
  const cancelTokenRef = useRef(0);
  const handlePTTStartRef = useRef<(token: number) => void>(() => {});
  const handlePTTStopRef = useRef<() => void>(() => {});
  const unbindEndRef = useRef<(() => void) | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isLive = (token: number) => token === cancelTokenRef.current && holdingRef.current;

  function finishHold() {
    const { isMicEnabled, isPTTActive, floorGranted } = usePTTStore.getState();
    const active = holdingRef.current || isMicEnabled || isPTTActive || floorGranted;
    if (!active) return;
    holdingRef.current = false;
    unbindEndHold();
    handlePTTStopRef.current();
  }

  function unbindEndHold() {
    unbindEndRef.current?.();
    unbindEndRef.current = null;
  }

  function bindEndHold() {
    unbindEndHold();
    const onEnd = () => finishHold();
    const opts = { capture: true } as const;
    const btn = buttonRef.current;
    document.addEventListener('mouseup', onEnd, opts);
    document.addEventListener('touchend', onEnd, opts);
    document.addEventListener('touchcancel', onEnd, opts);
    document.addEventListener('pointerup', onEnd, opts);
    document.addEventListener('pointercancel', onEnd, opts);
    window.addEventListener('blur', onEnd);
    if (btn) {
      btn.addEventListener('mouseup', onEnd);
      btn.addEventListener('mouseleave', onEnd);
      btn.addEventListener('touchend', onEnd);
      btn.addEventListener('pointerup', onEnd);
    }
    unbindEndRef.current = () => {
      document.removeEventListener('mouseup', onEnd, opts);
      document.removeEventListener('touchend', onEnd, opts);
      document.removeEventListener('touchcancel', onEnd, opts);
      document.removeEventListener('pointerup', onEnd, opts);
      document.removeEventListener('pointercancel', onEnd, opts);
      window.removeEventListener('blur', onEnd);
      if (btn) {
        btn.removeEventListener('mouseup', onEnd);
        btn.removeEventListener('mouseleave', onEnd);
        btn.removeEventListener('touchend', onEnd);
        btn.removeEventListener('pointerup', onEnd);
      }
    };
  }

  async function initTransport() {
    try {
      await createSendTransport(channelId);
      setReady(true);
      readyRef.current = true;
    } catch (err) {
      console.error('Failed to create send transport:', err);
    }
  }

  useEffect(() => {
    initTransport();

    const onConnected = () => {
      setReconnecting(false);
      resetAll();
      initTransport();
    };
    const onDisconnected = () => {
      setReconnecting(true);
      resetAll();
    };

    wsClient.onLifecycle('connected', onConnected);
    wsClient.onLifecycle('disconnected', onDisconnected);

    return () => {
      if (holdingRef.current || usePTTStore.getState().isMicEnabled) {
        wsClient.send({ type: 'ptt.release', channelId });
      }
      unbindEndHold();
      wsClient.offLifecycle('connected', onConnected);
      wsClient.offLifecycle('disconnected', onDisconnected);
      closeTransports();
      stopMic();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    const onReset = (data?: any) => {
      if (data?.channelId && data.channelId !== channelId) return;
      resetAll();
    };
    const onGranted = (data: any) => {
      if (data?.channelId !== channelId) return;
      if (data?.userId && userId && data.userId !== userId) return;
      if (!holdingRef.current) {
        wsClient.send({ type: 'ptt.release', channelId });
        resetAll();
      }
    };

    wsClient.on('ptt.released', onReset);
    wsClient.on('ptt.force_release', onReset);
    wsClient.on('ptt.denied', onReset);
    wsClient.on('ptt.granted', onGranted);

    return () => {
      wsClient.off('ptt.released', onReset);
      wsClient.off('ptt.force_release', onReset);
      wsClient.off('ptt.denied', onReset);
      wsClient.off('ptt.granted', onGranted);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || holdingRef.current) return;
      if (usePTTStore.getState().isMicEnabled) return;
      e.preventDefault();
      beginHold();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Escape') return;
      if (!holdingRef.current) return;
      e.preventDefault();
      holdingRef.current = false;
      unbindEndHold();
      handlePTTStopRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  async function ensureMicPrimed() {
    const current = micStreamRef.current;
    const track = current?.getAudioTracks()[0];
    if (current && track && track.readyState === 'live') {
      track.enabled = false;
      return current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    stream.getAudioTracks().forEach((t) => { t.enabled = false; });
    micStreamRef.current = stream;
    return stream;
  }

  function setupAudioMeter(stream: MediaStream) {
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length / 255);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function deactivateMic() {
    cancelAnimationFrame(rafRef.current);
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
    setMicEnabled(false);
    setAudioLevel(0);
  }

  function stopMic() {
    cancelAnimationFrame(rafRef.current);
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    localRecorderRef.current = null;
    setAudioStream(null);
    setMicEnabled(false);
    setAudioLevel(0);
  }

  function resetAll() {
    unbindEndHold();
    holdingRef.current = false;
    cancelTokenRef.current += 1;
    setIsRequesting(false);
    try {
      const p = usePTTStore.getState().producer;
      if (p) p.pause().catch(() => {});
    } catch {}
    deactivateMic();
    setPTTActive(false);
    setFloorGranted(false);
  }

  async function uploadLocalRecording(blob: Blob, durationMs: number) {
    if (!accessToken || !blob.size) return;
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    await fetch(`/api/v1/recordings/${channelId}/client-segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      body: JSON.stringify({ base64, durationMs, contentType: blob.type || 'audio/wav' }),
    });
  }

  const handlePTTStart = useCallback(async (token: number) => {
    if (!readyRef.current || isReconnecting) return;
    if (usePTTStore.getState().isMuted) return;
    if (usePTTStore.getState().isMicEnabled) return;
    if (!isSecureAudioContext) {
      toast.error('Microphone requires HTTPS.');
      holdingRef.current = false;
      unbindEndHold();
      return;
    }

    setIsRequesting(true);
    setPTTActive(true);
    let floorAcquired = false;

    try {
      const stream = await ensureMicPrimed();
      if (!isLive(token)) { stopMic(); return; }

      const grantResult = await new Promise<'granted' | 'denied'>((resolve) => {
        const cleanup = () => {
          wsClient.off('ptt.granted', onGranted);
          wsClient.off('ptt.denied', onDenied);
          wsClient.off('ptt.force_release', onFR);
          wsClient.off('ptt.released', onRel);
          wsClient.off('ptt.queued', onQueued);
        };
        const onGranted = (d: any) => {
          if (d.channelId !== channelId) return;
          cleanup();
          resolve('granted');
        };
        const onDenied = (d: any) => {
          if (d.channelId !== channelId) return;
          cleanup();
          resolve('denied');
        };
        const onFR = (d: any) => {
          if (d.channelId !== channelId) return;
          cleanup();
          resolve('denied');
        };
        const onRel = (d: any) => {
          if (d.channelId !== channelId) return;
          cleanup();
          resolve('denied');
        };
        const onQueued = (d: any) => {
          if (d.channelId !== channelId) return;
          setFloorQueued(d.position || 0);
        };
        wsClient.on('ptt.granted', onGranted);
        wsClient.on('ptt.denied', onDenied);
        wsClient.on('ptt.force_release', onFR);
        wsClient.on('ptt.released', onRel);
        wsClient.on('ptt.queued', onQueued);
        if (!wsClient.send({ type: 'ptt.request', channelId })) { cleanup(); resolve('denied'); }
      });

      if (!isLive(token) || grantResult !== 'granted') {
        deactivateMic();
        setPTTActive(false);
        return;
      }

      floorAcquired = true;
      setFloorGranted(true);
      setIsRequesting(false);

      if (!isLive(token)) {
        if (floorAcquired) wsClient.send({ type: 'ptt.release', channelId });
        deactivateMic();
        setPTTActive(false);
        setFloorGranted(false);
        return;
      }

      stream.getAudioTracks().forEach((t) => { t.enabled = true; });
      playPttDownTone();
      setMicEnabled(true);
      setAudioStream(stream);
      setupAudioMeter(stream);
      const recorder = new LocalPttRecorder();
      recorder.start(stream);
      localRecorderRef.current = recorder;

      const track = stream.getAudioTracks()[0];
      if (!producer) {
        const p = await createProducer(channelId, track);
        if (!isLive(token)) {
          if (p) p.pause().catch(() => {});
          stopMic();
          setPTTActive(false);
          setFloorGranted(false);
          if (floorAcquired) wsClient.send({ type: 'ptt.release', channelId });
          return;
        }
        if (p) { setProducer(p); await p.resume(); }
      } else {
        if (!isLive(token)) {
          stopMic();
          setPTTActive(false);
          setFloorGranted(false);
          if (floorAcquired) wsClient.send({ type: 'ptt.release', channelId });
          return;
        }
        await producer.resume();
      }
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' ? 'Microphone permission denied.'
        : err?.name === 'NotFoundError' ? 'No microphone found.'
        : 'Failed to start microphone.';
      toast.error(msg);
      deactivateMic();
      setPTTActive(false);
      setFloorGranted(false);
      if (floorAcquired) wsClient.send({ type: 'ptt.release', channelId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, isReconnecting, producer, isSecureAudioContext]);

  const handlePTTStop = useCallback(() => {
    const { isMicEnabled: micOn, floorGranted: floorOn, isPTTActive } = usePTTStore.getState();
    const hadSession = micOn || floorOn || isPTTActive || holdingRef.current;

    holdingRef.current = false;
    cancelTokenRef.current += 1;
    unbindEndHold();
    setIsRequesting(false);

    if (hadSession) {
      wsClient.send({ type: 'ptt.release', channelId });
      if (micOn) {
        try { playPttUpTone(); } catch {}
      }
    }

    try {
      if (producer) producer.pause().catch(() => {});
    } catch {}

    deactivateMic();
    setPTTActive(false);
    setFloorGranted(false);

    const recorder = localRecorderRef.current;
    localRecorderRef.current = null;
    if (recorder) {
      recorder.stop().then(async ({ blob, durationMs }) => {
        if (blob && blob.size > 0) await uploadLocalRecording(blob, durationMs);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, producer]);

  handlePTTStartRef.current = handlePTTStart;
  handlePTTStopRef.current = handlePTTStop;

  function beginHold() {
    if (usePTTStore.getState().isMuted) {
      toast.error('You are muted by an admin');
      return;
    }
    if (usePTTStore.getState().isMicEnabled || usePTTStore.getState().floorGranted) {
      finishHold();
      return;
    }
    if (holdingRef.current) return;

    holdingRef.current = true;
    const token = cancelTokenRef.current;
    bindEndHold();
    void handlePTTStartRef.current(token);
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    beginHold();
  }

  function onMouseUp(e: React.MouseEvent) {
    if (e.button !== 0) return;
    finishHold();
  }

  function onTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    beginHold();
  }

  function onTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    finishHold();
  }

  const isTransmitting = isMicEnabled;
  const showBusy = isRequesting && !isTransmitting;

  if (!ready) {
    return (
      <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-800">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (isReconnecting) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-yellow-600/20 ring-2 ring-yellow-600/50">
          <WifiOff className="h-12 w-12 text-yellow-400" />
        </div>
        <span className="text-sm text-yellow-400">Reconnecting...</span>
      </div>
    );
  }

  if (isMuted) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-red-900/30 ring-2 ring-red-500/50">
          <VolumeX className="h-16 w-16 text-red-400" />
        </div>
        <span className="text-sm text-red-400">Muted by admin</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {floorQueued > 0 && (
        <div className="rounded-full bg-yellow-600/20 px-4 py-1 text-sm text-yellow-400">
          Queue: {floorQueued}
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        className={`
          touch-none select-none
          relative flex h-32 w-32 items-center justify-center rounded-full
          transition-all duration-100
          ${isTransmitting
            ? 'bg-green-600 shadow-[0_0_40px_rgba(34,197,94,0.5)] scale-95'
            : showBusy
              ? 'bg-amber-600 shadow-lg scale-95'
              : 'bg-blue-600 shadow-lg hover:bg-blue-500 active:scale-95'
          }
        `}
      >
        {isTransmitting
          ? <Mic className="h-16 w-16 text-white animate-pulse" />
          : showBusy
            ? <Loader2 className="h-16 w-16 text-white animate-spin" />
            : <MicOff className="h-16 w-16 text-white/80" />
        }
        <span className="absolute -bottom-8 whitespace-nowrap text-sm text-gray-400">
          {isTransmitting ? 'Release to stop' : showBusy ? 'Requesting...' : 'Hold to talk'}
        </span>
      </button>
    </div>
  );
}
