import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, Megaphone, Mic, MicOff, Radio, Users, Volume2, VolumeX, WifiOff, AlertTriangle, X, Camera, CameraOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import LocationMap from './LocationMap';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { playUserJoinedTone, playUserLeftTone } from '@/lib/sfx';
import { useAuthStore } from '@/features/auth/store';
import { usePTTStore } from '@/features/ptt/store';
import { PTTButton } from '@/features/ptt/PTTButton';
import { AudioMeter } from '@/features/ptt/AudioMeter';
import { closeRecvTransport, createConsumer, createVideoProducer } from '@/lib/mediasoup';
import { useChatStore } from '@/features/chat/store';

interface ChannelDetail {
  id: string;
  name: string;
  description: string;
  isDirectCall?: boolean;
  currentUserRole?: string;
  members: Array<{ id: string; displayName: string; avatarUrl: string | null; role: string; isMuted?: boolean }>;
}

interface Member {
  id: string;
  displayName: string;
  isSpeaking: boolean;
  isMuted?: boolean;
}

const MIN_PLAYABLE_RECORDING_BYTES = 192;

export function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s: any) => s.user);
  const accessToken = useAuthStore((s: any) => s.accessToken);
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showRecordings, setShowRecordings] = useState(false);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosAlert, setSosAlert] = useState<{ sosId: string; displayName: string; message: string } | null>(null);
  const {
    isPTTActive, isMicEnabled, floorSpeaker, setFloorSpeaker,
    floorGranted, addConsumer, reset, setFloorGranted, setFloorQueued,
    isReconnecting, setReconnecting, setMicEnabled, setAudioStream, setProducer,
    isMuted, setMuted,
    isCameraEnabled, setCameraEnabled,
    isScreenSharing, setScreenSharing,
    videoStream, setVideoStream,
    videoProducer, setVideoProducer,
    videoConsumers, addVideoConsumer, removeVideoConsumer,
    screenStream, setScreenStream,
    screenProducer, setScreenProducer,
  } = usePTTStore();

  const { onlineUsers, setUserOnline } = useChatStore();

  const isDirectCall = channel?.isDirectCall === true || channel?.description === 'Direct call' || channel?.description === 'Direct PTT call';
  const callActiveRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const hangUpCall = useCallback(() => {
    wsClient.send({ type: 'direct_ptt.end', channelId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    callActiveRef.current = false;
    navigate('/');
  }, [channelId, navigate]);

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingAudioConsumersRef = useRef<Map<string, any>>(new Map());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const joinedRef = useRef(false);
  const realtimeInitRef = useRef(false);

  useEffect(() => {
    if (!channelId) return;
    const onConnected = () => {
      setReconnecting(false);
      if (!joinedRef.current || !channelId) return;
      void joinChannelRealtime();
    };
    const onDisconnected = () => {
      setReconnecting(true);
      setFloorSpeaker(null);
      setFloorGranted(false);
      realtimeInitRef.current = false;
      closeRecvTransport();
    };
    const onSpeakerChanged = (data: any) => {
      if (data.channelId !== channelId) return;
      if (data.activeSpeaker) {
        setFloorSpeaker({ userId: data.activeSpeaker, displayName: data.displayName || '' });
        setMembers((prev) => prev.map((m) => ({ ...m, isSpeaking: m.id === data.activeSpeaker })));
        const consumer = pendingAudioConsumersRef.current.get(data.producerId);
        if (consumer && !audioElementsRef.current.has(data.producerId)) {
          const audio = new Audio();
          audio.srcObject = new MediaStream([consumer.track]);
          audio.play().catch(() => {});
          audioElementsRef.current.set(data.producerId, audio);
        }
        audioElementsRef.current.forEach((audio) => {
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        });
      } else {
        setFloorSpeaker(null);
        setMembers((prev) => prev.map((m) => ({ ...m, isSpeaking: false })));
        audioElementsRef.current.forEach((audio) => {
          audio.pause();
        });
      }
    };
    const onPttGranted = (data: any) => {
      if (data.channelId !== channelId) return;
      if (data.userId && data.userId !== user?.id) {
        setFloorGranted(false);
      } else if (data.userId === user?.id) {
        setFloorQueued(0);
      }
      setFloorSpeaker({
        userId: data.userId || user?.id || '',
        displayName: data.displayName || user?.displayName || 'You',
      });
    };
    const onPttQueued = (data: any) => {
      if (data.channelId !== channelId || !data.position) return;
      setFloorGranted(false);
      setFloorQueued(data.position);
      toast(`Queue position: ${data.position}`);
    };
    const onPttReset = (data: any) => {
      if (data.channelId !== channelId) return;
      // PTTButton manages floorGranted for self; here we just clear speaker UI
      setFloorQueued(0);
      setFloorSpeaker(null);
    };
    const onDispatcherAnnouncement = (data: any) => {
      if (data.channelId !== channelId || !data.text) return;
      setAnnouncement(data.text);
      setTimeout(() => setAnnouncement(null), 7000);
    };
    const onChannelUserJoined = (data: any) => {
      if (data.channelId !== channelId || !data.userId) return;
      setMembers((prev) => {
        if (prev.some((m) => m.id === data.userId)) return prev;
        return [...prev, { id: data.userId, displayName: data.displayName || 'User', isSpeaking: false }];
      });
      playUserJoinedTone();
      if (data.displayName) toast(`${data.displayName} joined channel`);
    };
    const onChannelUserLeft = (data: any) => {
      if (data.channelId !== channelId || !data.userId) return;
      setMembers((prev) => prev.filter((m) => m.id !== data.userId));
      if (floorSpeaker?.userId === data.userId) {
        setFloorSpeaker(null);
      }
      playUserLeftTone();
      if (data.displayName) toast(`${data.displayName} left channel`);
    };
    const onNewConsumer = async (data: any) => {
      if (data.channelId !== channelId || !data.producerId) return;
      try {
        const consumer = await createConsumer(channelId, data.producerId);
        if (!consumer) return;

        if (data.kind === 'video') {
          addVideoConsumer(data.producerId, {
            consumer,
            peerId: data.producerPeerId,
            displayName: data.producerDisplayName,
          });
        } else {
          addConsumer(data.producerId, consumer);
          pendingAudioConsumersRef.current.set(data.producerId, consumer);
          // If this consumer belongs to the current speaker, play immediately
          const currentSpeaker = usePTTStore.getState().floorSpeaker;
          if (currentSpeaker && data.producerPeerId === currentSpeaker.userId && !audioElementsRef.current.has(data.producerId)) {
            const audio = new Audio();
            audio.srcObject = new MediaStream([consumer.track]);
            audio.play().catch(() => {});
            audioElementsRef.current.set(data.producerId, audio);
          }
        }
      } catch {
        toast.error('Consumer creation failed');
      }
    };
    const onConsumerClosed = (data: any) => {
      const key = data.producerId || data.consumerId;
      if (!key) return;

      // Remove video consumer
      removeVideoConsumer(key);

      // Remove audio consumer
      const audio = audioElementsRef.current.get(key);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audioElementsRef.current.delete(key);
      }
    };

    wsClient.on('speaker-changed', onSpeakerChanged);
    wsClient.on('ptt.granted', onPttGranted);
    wsClient.on('ptt.queued', onPttQueued);
    wsClient.on('ptt.force_release', onPttReset);
    wsClient.on('ptt.released', onPttReset);
    wsClient.on('ptt.denied', onPttReset);
    wsClient.on('new-consumer', onNewConsumer);
    wsClient.on('consumer.closed', onConsumerClosed);
    const onSosAlert = (data: any) => {
      if (data.channelId !== channelId) return;
      setSosAlert({ sosId: data.sosId, displayName: data.displayName, message: data.message });
    };
    const onSosResolved = (data: any) => {
      if (data.channelId !== channelId) return;
      setSosAlert(null);
    };

    wsClient.on('dispatcher.announcement', onDispatcherAnnouncement);
    wsClient.on('sos.alert', onSosAlert);
    wsClient.on('sos.resolved', onSosResolved);
    wsClient.on('channel.user_joined', onChannelUserJoined);
    wsClient.on('channel.user_left', onChannelUserLeft);
    wsClient.onLifecycle('connected', onConnected);
    wsClient.onLifecycle('disconnected', onDisconnected);

    const onDirectPttEnded = (data: any) => {
      if (data.channelId !== channelId) return;
      callActiveRef.current = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      navigate('/');
    };
    wsClient.on('direct_ptt.ended', onDirectPttEnded);

    const onUserMuted = (data: any) => {
      if (data.channelId !== channelId) return;
      if (data.userId === user?.id) {
        setMuted(true);
        toast('You have been muted by an admin', { icon: '🔇' });
      }
      setMembers((prev) => prev.map((m) => m.id === data.userId ? { ...m, isSpeaking: false, isMuted: true } : m));
    };
    const onUserUnmuted = (data: any) => {
      if (data.channelId !== channelId) return;
      if (data.userId === user?.id) {
        setMuted(false);
        toast('You have been unmuted', { icon: '🔊' });
      }
      setMembers((prev) => prev.map((m) => m.id === data.userId ? { ...m, isMuted: false } : m));
    };
    wsClient.on('channel.user_muted', onUserMuted);
    wsClient.on('channel.user_unmuted', onUserUnmuted);

    // Subscribe to online/offline events for roster indicators
    const onUserOnline = (data: any) => { if (data?.userId) setUserOnline(data.userId); };
    const onUserOffline = (data: any) => { if (data?.userId) useChatStore.getState().setUserOffline(data.userId); };
    const onOnlineUsers = (data: any) => { if (data?.userIds) data.userIds.forEach((id: string) => setUserOnline(id)); };
    wsClient.on('user.online', onUserOnline);
    wsClient.on('user.offline', onUserOffline);
    wsClient.on('online_users', onOnlineUsers);

    // Request current online users via WebSocket
    wsClient.send({ type: 'get_online_users' });

    joinedRef.current = true;
    void loadChannel();
    void ensureConnectedAndJoin();

    return () => {
      joinedRef.current = false;
      realtimeInitRef.current = false;
      if (isDirectCall && callActiveRef.current) {
        wsClient.send({ type: 'direct_ptt.end', channelId });
        localStreamRef.current?.getTracks().forEach(t => t.stop());
      }
      wsClient.send({ type: 'channel.leave', channelId });
      wsClient.off('speaker-changed', onSpeakerChanged);
      wsClient.off('ptt.granted', onPttGranted);
      wsClient.off('ptt.queued', onPttQueued);
      wsClient.off('ptt.force_release', onPttReset);
      wsClient.off('ptt.released', onPttReset);
      wsClient.off('ptt.denied', onPttReset);
      wsClient.off('new-consumer', onNewConsumer);
      wsClient.off('consumer.closed', onConsumerClosed);
      wsClient.off('dispatcher.announcement', onDispatcherAnnouncement);
      wsClient.off('sos.alert', onSosAlert);
      wsClient.off('sos.resolved', onSosResolved);
      wsClient.off('channel.user_joined', onChannelUserJoined);
      wsClient.off('channel.user_left', onChannelUserLeft);
      wsClient.off('user.online', onUserOnline);
      wsClient.off('user.offline', onUserOffline);
      wsClient.off('online_users', onOnlineUsers);
      wsClient.off('direct_ptt.ended', onDirectPttEnded);
      wsClient.off('channel.user_muted', onUserMuted);
      wsClient.off('channel.user_unmuted', onUserUnmuted);
      wsClient.offLifecycle('connected', onConnected);
      wsClient.offLifecycle('disconnected', onDisconnected);
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioElementsRef.current.clear();
      pendingAudioConsumersRef.current.clear();
      videoElementsRef.current.forEach((video) => {
        video.pause();
        video.srcObject = null;
      });
      videoElementsRef.current.clear();
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
      }
      closeRecvTransport();
      reset();
    };
  }, [channelId, user?.displayName, user?.id]);

  useEffect(() => {
    if (!channelId || !isDirectCall || !channel) return;
    if (callActiveRef.current) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    const startDirectCall = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        callActiveRef.current = true;
        setMicEnabled(true);
        setAudioStream(stream);
        setFloorGranted(true);

        const track = stream.getAudioTracks()[0];
        const { createProducer } = await import('@/lib/mediasoup');
        const p = await createProducer(channelId, track);
        if (p && !cancelled) {
          setProducer(p);
        } else if (p) {
          p.close();
        }
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.name === 'NotAllowedError' ? 'Microphone permission denied.'
          : err?.name === 'NotFoundError' ? 'No microphone found.'
          : 'Failed to start call.';
        toast.error(msg);
        hangUpCall();
      }
    };

    void startDirectCall();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      callActiveRef.current = false;
    };
  }, [channelId, isDirectCall, channel]);

  async function ensureConnectedAndJoin() {
    if (!channelId || !joinedRef.current) return;
    try {
      if (wsClient.isConnected()) {
        await joinChannelRealtime();
        return;
      }
      await wsClient.connect();
    } catch {
      toast.error('Realtime connection failed');
    }
  }

  async function joinChannelRealtime() {
    if (!channelId || realtimeInitRef.current) return;
    realtimeInitRef.current = true;
    try {
      wsClient.send({ type: 'channel.join', channelId });
    } catch (err) {
      realtimeInitRef.current = false;
      throw err;
    }
  }

  useEffect(() => {
    if (videoStream && localVideoRef.current) {
      localVideoRef.current.srcObject = videoStream;
      localVideoRef.current.play().catch(() => {});
    }
    if (!videoStream && localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [videoStream]);

  async function toggleCamera() {
    if (isCameraEnabled) {
      // Turn off camera
      if (videoProducer) {
        videoProducer.close();
        setVideoProducer(null);
      }
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        setVideoStream(null);
      }
      setCameraEnabled(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    } else {
      // Turn on camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
        });
        setVideoStream(stream);
        setCameraEnabled(true);

        const p = await createVideoProducer(channelId!, stream.getVideoTracks()[0]);
        if (p) {
          setVideoProducer(p);
        }
      } catch (err: any) {
        const msg = err?.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : err?.name === 'NotFoundError'
            ? 'No camera found'
            : 'Failed to start camera';
        toast.error(msg);
        setCameraEnabled(false);
        setVideoStream(null);
      }
    }
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      // Stop screen share
      if (screenProducer) {
        screenProducer.close();
        setScreenProducer(null);
      }
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      setScreenSharing(false);
    } else {
      // Start screen share
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 10 },
          },
          audio: false,
        });

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (screenProducer) {
            screenProducer.close();
            setScreenProducer(null);
          }
          setScreenStream(null);
          setScreenSharing(false);
        });

        setScreenStream(stream);
        setScreenSharing(true);

        const p = await createVideoProducer(channelId!, stream.getVideoTracks()[0]);
        if (p) {
          setScreenProducer(p);
        }
      } catch {
        setScreenSharing(false);
      }
    }
  }

  async function loadChannel() {
    if (!channelId) return;
    try {
      const data: any = await api.get(`/channels/${channelId}`);
      setChannel(data.channel);
      setMembers((data.channel.members || []).map((m: any) => ({ id: m.id, displayName: m.displayName, isSpeaking: false, isMuted: !!m.isMuted })));
      const myMember = (data.channel.members || []).find((m: any) => m.id === user?.id);
      if (myMember?.isMuted) setMuted(true);
    } catch {
      toast.error('Failed to load channel');
      navigate('/');
    }
  }

  async function playRecording(filePath: string) {
    try {
      const response = await fetch(`/api/v1/recordings/file/${filePath}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (blob.size < MIN_PLAYABLE_RECORDING_BYTES) {
        throw new Error('Recording is empty or unreadable');
      }
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.onended = () => URL.revokeObjectURL(objectUrl);
      audio.onerror = () => URL.revokeObjectURL(objectUrl);
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  async function playSessionRecording(session: any) {
    try {
      if (session.file_path) {
        const played = await playRecording(session.file_path);
        if (played) return;
      }

      const details: any = await api.get(`/recordings/session/${session.id}`);
      const firstSegment = details.segments?.find((segment: any) => !!segment.file_path);
      if (!firstSegment?.file_path) {
        toast.error('Recording is missing or empty');
        return;
      }

      const played = await playRecording(firstSegment.file_path);
      if (!played) {
        toast.error('Recording is empty or unreadable');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Recording playback failed');
    }
  }

  const speakerName = floorSpeaker?.displayName || 'No active speaker';
  const canManage = channel?.currentUserRole === 'owner' || channel?.currentUserRole === 'admin' || user?.role === 'admin';

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {sosAlert && (
        <div className="border-b border-red-500/50 bg-red-600/20 px-4 py-2 text-sm text-red-200 md:px-6 md:py-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4 animate-pulse text-red-400 md:h-5 md:w-5" />
              SOS from {sosAlert.displayName}{sosAlert.message ? `: ${sosAlert.message}` : ''}
            </span>
            <button onClick={() => setSosAlert(null)} className="rounded p-1 hover:bg-red-500/20">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {announcement && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 md:px-6">
          <span className="inline-flex items-center gap-2"><Megaphone className="h-3 w-3 md:h-4 md:w-4" /> {announcement}</span>
        </div>
      )}
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/70">
        <div className="flex items-center justify-between px-3 py-2 md:px-6 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={() => navigate('/')} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 md:p-2"><ArrowLeft className="h-4 w-4 md:h-5 md:w-5" /></button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold md:text-lg">{channel?.name || 'Channel'}</h1>
              <p className="truncate text-[10px] text-slate-500 md:text-xs">{channel?.description || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            {isReconnecting ? <span className="text-[10px] text-yellow-400 md:text-xs inline-flex items-center gap-1"><WifiOff className="h-3 w-3" /> reconnecting</span> : <span className="text-[10px] text-emerald-400 md:text-xs">live</span>}
            <button
              onClick={async () => {
                const next = !showRecordings;
                setShowRecordings(next);
                if (!next || !channelId) return;

                setRecordingsLoading(true);
                try {
                  const d: any = await api.get(`/recordings/${channelId}`);
                  setRecordings(d.sessions || []);
                } catch {
                  toast.error('Failed to load recordings');
                } finally {
                  setRecordingsLoading(false);
                }
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] md:px-3 md:py-2 md:text-xs"
            >
              <History className="h-3 w-3 md:h-3.5 md:w-3.5" />
            </button>
            <button
              onClick={() => setShowSosModal(true)}
              className="rounded-md border border-red-700 bg-red-900/50 px-2 py-1.5 text-[10px] text-red-300 hover:bg-red-800/50 md:px-3 md:py-2 md:text-xs"
            >
              <AlertTriangle className="h-3 w-3 md:h-3.5 md:w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col lg:flex-row">
          <section className="flex flex-1 flex-col items-center justify-center p-3 lg:p-6">
            <div className="mb-3 hidden w-full grid-cols-3 gap-3 lg:grid">
              <div className="rounded-md border border-slate-800 bg-slate-950 p-2 text-sm">Members: <b>{members.length}</b></div>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-2 text-sm">Speaker: <b className="truncate">{floorSpeaker ? floorSpeaker.displayName : 'None'}</b></div>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-2 text-sm">State: <b>{floorGranted ? 'Granted' : isPTTActive ? 'Requesting...' : 'Idle'}</b></div>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 lg:hidden">
              <div className="rounded-md border border-slate-800 bg-slate-950 p-2 text-[10px]">Members: <b>{members.length}</b></div>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-2 text-[10px]">Speaker: <b className="truncate">{floorSpeaker ? floorSpeaker.displayName : 'None'}</b></div>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-2 text-[10px]">State: <b>{floorGranted ? 'Granted' : isPTTActive ? 'Req...' : 'Idle'}</b></div>
            </div>

            <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-4 lg:min-h-0 lg:w-full">
              {(videoConsumers.size > 0 || (isCameraEnabled && videoStream)) && (
                <div className="mb-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[...videoConsumers.entries()].map(([producerId, vc]) => (
                    <div key={producerId} className="relative aspect-video overflow-hidden rounded-lg bg-black">
                      <video
                        ref={(el) => {
                          if (el && vc.consumer.track) {
                            el.srcObject = new MediaStream([vc.consumer.track]);
                            el.play().catch(() => {});
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                        {vc.displayName}
                      </span>
                    </div>
                  ))}
                  {isCameraEnabled && videoStream && (
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-black ring-2 ring-blue-500/50">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute top-1 right-1 flex items-center gap-1 rounded bg-red-600/80 px-1.5 py-0.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                        <span className="text-[10px] font-medium text-white">LIVE</span>
                      </div>
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                        You
                      </span>
                    </div>
                  )}
                </div>
              )}

              {videoConsumers.size === 0 && !isCameraEnabled && (
                <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20 lg:mb-4 lg:h-20 lg:w-20">
                  {floorSpeaker ? <Radio className="h-7 w-7 animate-pulse text-emerald-400 lg:h-10 lg:w-10" /> : <Users className="h-7 w-7 text-blue-400 lg:h-10 lg:w-10" />}
                </div>
              )}

              <div className="mb-1 text-center">
                <p className="text-sm font-semibold lg:text-lg">{speakerName}</p>
                <p className="text-[10px] text-slate-500 lg:text-sm">{isDirectCall ? (isMicEnabled ? 'Call active' : 'Connecting...') : (floorGranted ? 'You own floor' : 'Push to talk')}</p>
              </div>
              <AudioMeter />
              <div className="mt-3 flex items-center gap-3">
                {isDirectCall ? (
                  <button
                    onClick={hangUpCall}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg transition-all hover:bg-red-500 active:scale-95 lg:h-28 lg:w-28"
                  >
                    <PhoneOff className="h-8 w-8 text-white lg:h-14 lg:w-14" />
                  </button>
                ) : (
                  <PTTButton channelId={channelId!} />
                )}
                <div className="flex flex-col gap-2">
                  {!isDirectCall && (
                    <button
                      onClick={toggleCamera}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors lg:h-10 lg:w-10 ${
                        isCameraEnabled
                          ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title={isCameraEnabled ? 'Disable camera' : 'Enable camera'}
                    >
                      {isCameraEnabled ? <Camera className="h-4 w-4 lg:h-5 lg:w-5" /> : <CameraOff className="h-4 w-4 lg:h-5 lg:w-5" />}
                    </button>
                  )}
                  {!isDirectCall && (
                    <button
                      onClick={toggleScreenShare}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors lg:h-10 lg:w-10 ${
                        isScreenSharing
                          ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                    >
                      {isScreenSharing ? <Monitor className="h-4 w-4 lg:h-5 lg:w-5" /> : <MonitorOff className="h-4 w-4 lg:h-5 lg:w-5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="flex w-full flex-col border-t border-slate-800 lg:w-80 lg:flex-col lg:border-l lg:border-t-0 lg:overflow-y-auto">
            <div className="border-b border-slate-800 bg-slate-900/50 p-3 lg:p-4">
              <h3 className="mb-2 text-xs font-semibold text-slate-300 lg:text-sm">Roster</h3>
              <div className="flex flex-col gap-1 lg:gap-1.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] lg:px-2.5 lg:py-1.5 lg:text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full lg:h-2 lg:w-2 ${onlineUsers.has(m.id) ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span className={`truncate ${m.isSpeaking ? 'text-emerald-400 font-medium' : ''}`}>{m.displayName}{m.id === user?.id ? ' (you)' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {canManage && m.id !== user?.id && !m.isSpeaking && (
                        <button
                          onClick={() => void api.patch(`/channels/${channelId}/members/${m.id}/mute`, { muted: !m.isMuted }).then(() => {
                            setMembers((prev) => prev.map((mm) => mm.id === m.id ? { ...mm, isMuted: !mm.isMuted } : mm));
                            toast.success(m.isMuted ? 'User unmuted' : 'User muted');
                          }).catch(() => toast.error('Failed'))}
                          className={`rounded p-0.5 ${m.isMuted ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-amber-400'}`}
                          title={m.isMuted ? 'Unmute' : 'Mute'}
                        >
                          {m.isMuted ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                        </button>
                      )}
                      {m.isSpeaking ? <Mic className="h-3 w-3 shrink-0 text-emerald-400 lg:h-3.5 lg:w-3.5" /> : m.isMuted ? <VolumeX className="h-3 w-3 shrink-0 text-red-400 lg:h-3.5 lg:w-3.5" /> : <MicOff className="h-3 w-3 shrink-0 text-slate-600 lg:h-3.5 lg:w-3.5" />}
                    </div>
                  </div>
                ))}
                {members.length === 0 && <p className="text-[10px] text-slate-500 lg:text-xs">No members</p>}
              </div>
            </div>
            <div className="border-b border-slate-800 bg-slate-900/50 p-3 lg:p-4">
              <h3 className="mb-2 text-xs font-semibold text-slate-300 lg:text-sm">Recordings</h3>
              {!showRecordings ? (
                <p className="text-[10px] text-slate-500 lg:text-xs">Press record icon to load sessions</p>
              ) : recordingsLoading ? (
                <p className="text-[10px] text-slate-400 lg:text-xs">Loading...</p>
              ) : recordings.length === 0 ? (
                <p className="text-[10px] text-slate-500 lg:text-xs">No recordings yet</p>
              ) : (
                <div className="flex flex-col gap-1 lg:gap-1.5">
                  {recordings.map((r: any) => (
                    <button key={r.id} className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-left text-[10px] hover:bg-slate-900 lg:px-2.5 lg:py-1.5 lg:text-xs" onClick={() => void playSessionRecording(r)}>
                      <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3 text-blue-400" /> {new Date(r.started_at).toLocaleTimeString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {channelId && <div className="flex-1 lg:min-h-0"><LocationMap channelId={channelId} userId={user?.id ?? ''} /></div>}
          </aside>
        </div>
      </main>

      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-red-800 bg-slate-900 p-4 md:p-6">
            <h3 className="mb-1 text-base font-bold text-red-400 md:text-lg">Send SOS Alert</h3>
            <p className="mb-3 text-sm text-slate-400 md:mb-4">All channel members will be notified.</p>
            <textarea
              value={sosMessage}
              onChange={(e) => setSosMessage(e.target.value)}
              placeholder="Optional message..."
              className="mb-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-red-500 md:mb-4"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await api.post(`/channels/${channelId}/sos`, { message: sosMessage });
                    toast.success('SOS sent');
                    setShowSosModal(false);
                    setSosMessage('');
                  } catch {
                    toast.error('Failed to send SOS');
                  }
                }}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Send SOS
              </button>
              <button
                onClick={() => { setShowSosModal(false); setSosMessage(''); }}
                className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      <footer className="shrink-0 border-t border-slate-800 px-4 py-2 text-xs text-slate-400 md:px-6 md:py-3 md:text-sm">
        {isReconnecting ? 'Reconnecting...' : isDirectCall ? (isMicEnabled ? '📞 Call in progress' : 'Connecting...') : (isMicEnabled ? 'Microphone active' : 'Microphone off')}
      </footer>
    </div>
  );
}
