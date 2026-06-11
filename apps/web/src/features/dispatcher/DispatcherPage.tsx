import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, Megaphone, Mic, MicOff, Radio,
  Search, Users, WifiOff, Circle, Zap, Clock, Bell, Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { Panel } from '@/shared/Panel';
import { Badge } from '@/shared/Badge';
import { Button } from '@/shared/Button';

interface DispatcherChannel {
  id: string;
  name: string;
  memberCount: number;
  isRecording: boolean;
  priority: 'normal' | 'high' | 'emergency';
}

interface DispatcherUser {
  id: string;
  displayName: string;
  role: string;
  isOnline: boolean;
}

interface EventItem {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'critical';
  text: string;
}

const priorityConfig = {
  emergency: {
    border: 'border-slate-700',
    bg: 'bg-slate-900',
    hover: 'hover:bg-slate-800',
    active: 'border-blue-500 bg-slate-900 text-slate-100',
    badge: 'bg-slate-800 text-slate-300',
    label: 'EMERG',
    glow: '',
  },
  high: {
    border: 'border-slate-700',
    bg: 'bg-slate-900',
    hover: 'hover:bg-slate-800',
    active: 'border-blue-500 bg-slate-900 text-slate-100',
    badge: 'bg-slate-800 text-slate-300',
    label: 'HIGH',
    glow: '',
  },
  normal: {
    border: 'border-slate-700',
    bg: 'bg-slate-900',
    hover: 'hover:bg-slate-800',
    active: 'border-blue-500 bg-slate-900 text-slate-100',
    badge: 'bg-slate-800 text-slate-300',
    label: 'NORM',
    glow: '',
  },
};

export function DispatcherPage() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<DispatcherChannel[]>([]);
  const [users, setUsers] = useState<DispatcherUser[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [announceText, setAnnounceText] = useState('');
  const [search, setSearch] = useState('');
  const [isLive, setIsLive] = useState(true);
  const [speakers, setSpeakers] = useState<Record<string, { userId: string; displayName: string }>>({});
  const [events, setEvents] = useState<EventItem[]>([]);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('dispatcher_muted_channels');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem('dispatcher_muted_channels', JSON.stringify([...mutedChannels]));
  }, [mutedChannels]);

  function toggleChannelMute(channelId: string) {
    setMutedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  }

  useEffect(() => {
    wsClient.connect();
    void loadData();
    pushEvent('info', 'Dispatcher console initialized');

    const onSpeakerChanged = (data: any) => {
      if (data.activeSpeaker) {
        setSpeakers((prev) => ({ ...prev, [data.channelId]: { userId: data.activeSpeaker, displayName: data.displayName || data.activeSpeaker } }));
        pushEvent('warn', `[${data.channelId}] ${data.displayName || data.activeSpeaker} started speaking`);
      } else {
        setSpeakers((prev) => { const n = { ...prev }; delete n[data.channelId]; return n; });
        pushEvent('info', `[${data.channelId}] speaking stopped`);
      }
    };
    const onConnected = () => { setIsLive(true); pushEvent('info', 'Realtime link restored'); void loadData(); };
    const onDisconnected = () => { setIsLive(false); pushEvent('critical', 'Realtime link lost'); };

    wsClient.on('speaker-changed', onSpeakerChanged);
    wsClient.onLifecycle('connected', onConnected);
    wsClient.onLifecycle('disconnected', onDisconnected);
    return () => {
      wsClient.off('speaker-changed', onSpeakerChanged);
      wsClient.offLifecycle('connected', onConnected);
      wsClient.offLifecycle('disconnected', onDisconnected);
    };
  }, []);

  function pushEvent(level: EventItem['level'], text: string) {
    setEvents((prev) => [{ id: `${Date.now()}-${Math.random()}`, ts: Date.now(), level, text }, ...prev].slice(0, 120));
  }

  async function loadData() {
    try {
      const [chData, usrData] = await Promise.all([api.get('/dispatcher/channels'), api.get('/dispatcher/users')]);
      const mapped = ((chData as any).channels || []).map((c: any, idx: number) => ({
        ...c,
        priority: c.name?.toLowerCase().includes('emergency') ? 'emergency' : idx === 0 ? 'high' : 'normal',
      }));
      setChannels(mapped);
      setUsers((usrData as any).users || []);
    } catch { toast.error('Failed to load dispatcher data'); }
  }

  function forcePTT(userId: string) {
    if (!selectedChannel) return;
    wsClient.send({ type: 'dispatcher.force_ptt', channelId: selectedChannel, targetUserId: userId });
    pushEvent('warn', `Force PTT on user ${userId}`);
  }

  async function moveUserToSelectedChannel(userId: string) {
    if (!selectedChannel) return;
    try {
      const data: any = await api.post('/dispatcher/move-user', {
        channelId: selectedChannel,
        targetUserId: userId,
      });
      pushEvent('info', data.message || `User moved to channel`);
      toast.success(data.message || 'User moved to channel');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to move user');
    }
  }

  async function forceRelease() {
    if (!selectedChannel) return;
    wsClient.send({ type: 'dispatcher.force_release_any', channelId: selectedChannel });
    pushEvent('warn', `Force release on channel ${selectedChannel}`);
  }

  async function toggleRecording() {
    if (!selectedChannel) return;
    const channel = channels.find((c) => c.id === selectedChannel);
    if (!channel) return;
    try {
      if (channel.isRecording) {
        await api.post(`/recordings/${selectedChannel}/stop`);
        pushEvent('info', `Recording stopped for ${channel.name}`);
      } else {
        await api.post(`/recordings/${selectedChannel}/start`);
        pushEvent('critical', `Recording started for ${channel.name}`);
      }
      setChannels((prev) => prev.map((c) => (c.id === selectedChannel ? { ...c, isRecording: !c.isRecording } : c)));
    } catch (err: any) { toast.error(err.message || 'Recording action failed'); }
  }

  function sendAnnouncement() {
    if (!selectedChannel || !announceText.trim()) return;
    const target = channels.find((c) => c.id === selectedChannel);
    const targetLabel = target?.name || selectedChannel.slice(0, 8);
    wsClient.send({ type: 'dispatcher.announcement', channelId: selectedChannel, text: announceText.trim() });
    pushEvent('info', `Announcement to ${targetLabel}: ${announceText.trim()}`);
    setAnnounceText('');
    toast.success('Announcement sent');
  }

  const selected = channels.find((c) => c.id === selectedChannel) || null;
  const emergencyChannels = useMemo(() => channels.filter((c) => c.priority === 'emergency'), [channels]);
  const onlineUsers = useMemo(() => users.filter((u) => u.isOnline), [users]);
  const filteredUsers = useMemo(() => onlineUsers.filter((u) => u.displayName.toLowerCase().includes(search.toLowerCase())), [onlineUsers, search]);

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="relative shrink-0 overflow-hidden border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(59,130,246,0.10) 0%, transparent 60%)' }} />
        <div className="relative flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-600 p-1.5">
                <Radio className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-wide">DISPATCH</h1>
                <p className="text-[10px] text-slate-400">Command Center</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <div className="flex items-center gap-2 text-slate-300/70">
              <Users className="h-3 w-3" /><span>{onlineUsers.length} <span className="text-slate-500">online</span></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300/70">
              <Radio className="h-3 w-3" /><span>{channels.length} <span className="text-slate-500">channels</span></span>
            </div>
            {isLive ? (
              <Badge variant="connection-live" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
                <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="connection-offline" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
                <WifiOff className="h-3 w-3" />
                OFFLINE
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/30 px-4 py-1.5 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {Object.keys(speakers).length} active
        </span>
        <span>{channels.length} channels</span>
        <span>{onlineUsers.length} online</span>
        <span className="ml-auto">{mutedChannels.size} muted</span>
        <span>{new Date().toLocaleTimeString()}</span>
      </div>

      {emergencyChannels.length > 0 && (
        <div className="relative shrink-0 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 shrink-0">
              <AlertTriangle className="h-3 w-3 animate-breathe" /> Emergency
            </div>
            {emergencyChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] transition-all ${
                  selectedChannel === ch.id
                    ? 'border-blue-500 bg-slate-800 text-slate-100'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="font-semibold">{ch.name}</div>
                <div className="opacity-60">{ch.memberCount} members</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden p-2.5">
        <div className="grid h-full grid-cols-12 gap-2.5">
          <Panel className="col-span-12 flex flex-col overflow-hidden lg:col-span-3">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Radio className="h-3 w-3" /> Channels
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
              {channels.map((ch) => {
                const cfg = priorityConfig[ch.priority];
                const active = selectedChannel === ch.id;
                const speaker = speakers[ch.id];
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannel(ch.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-all duration-200 ${
                      active ? `${cfg.active} ${cfg.glow}` : `${cfg.border} ${cfg.bg} ${cfg.hover}`
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{ch.name}</span>
                      <Badge variant={ch.priority === 'emergency' ? 'priority-emergency' : ch.priority === 'high' ? 'priority-high' : 'priority-normal'} className="text-[9px]">
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-indigo-300/40">
                      <span>{ch.memberCount} users</span>
                      <span className="flex items-center gap-1">
                        {mutedChannels.has(ch.id) ? (
                          <span className="text-amber-400" onClick={(e) => { e.stopPropagation(); toggleChannelMute(ch.id); }}>MUTED</span>
                        ) : (
                          <span className="text-slate-600 hover:text-slate-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleChannelMute(ch.id); }}>mute</span>
                        )}
                        {ch.isRecording && <span className="flex items-center gap-1 text-rose-400"><Circle className="h-2 w-2 animate-recording fill-rose-400" /> REC</span>}
                      </span>
                    </div>
                    {speaker && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400">
                        <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-emerald-400" />
                        {speaker.displayName}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="col-span-12 flex flex-col overflow-hidden lg:col-span-6">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Activity className="h-3 w-3" /> Operations
            </div>
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-xs text-indigo-400/30">Select a channel to begin</div>
            ) : (
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  {[
                    { label: 'Channel', value: selected.name, color: 'from-cyan-500 to-blue-600' },
                    { label: 'Members', value: selected.memberCount, color: 'from-purple-500 to-pink-500' },
                    { label: 'Recording', value: selected.isRecording ? 'ACTIVE' : 'OFF', color: selected.isRecording ? 'from-rose-500 to-orange-500' : 'from-slate-500 to-gray-500' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/5 p-2">
                      <div className="text-indigo-300/40 uppercase tracking-wider">{s.label}</div>
                      <div className={`mt-0.5 text-sm font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{String(s.value)}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={forceRelease} variant="danger" size="sm" className="hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                    <MicOff className="h-3.5 w-3.5" /> Force Release
                  </Button>
                  <Button onClick={toggleRecording} variant={selected.isRecording ? 'danger' : 'secondary'} size="sm" className={selected.isRecording ? 'hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]' : ''}>
                    <Circle className={`h-3 w-3 ${selected.isRecording ? 'animate-recording fill-white' : ''}`} />
                    {selected.isRecording ? 'Stop REC' : 'Start REC'}
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Megaphone className="h-3 w-3" /> Broadcast
                  </div>
                  <div className="flex gap-2">
                    <input value={announceText} onChange={(e) => setAnnounceText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendAnnouncement()} placeholder="Type broadcast message..." className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs outline-none placeholder:text-slate-500 focus:border-blue-500 transition-all" />
                    <Button onClick={sendAnnouncement} variant="primary" size="sm" className="hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                      <Zap className="h-3.5 w-3.5" /> Send
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
                    <Search className="h-3 w-3 text-indigo-400/50" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find agent..." className="w-full bg-transparent text-xs outline-none placeholder:text-indigo-400/20" />
                    <span className="text-[10px] text-indigo-400/30">{filteredUsers.length} online</span>
                  </div>
                  <div className="max-h-48 space-y-0.5 overflow-y-auto p-1.5">
                    {filteredUsers.map((u) => (
                      <div key={u.id} className="group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all hover:bg-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                          <span className="text-slate-200">{u.displayName}</span>
                          <span className="text-indigo-400/30">{u.role}</span>
                        </div>
                        <button onClick={() => forcePTT(u.id)} className="flex items-center gap-1 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-all hover:from-blue-500 hover:to-blue-600">
                          <Mic className="h-2.5 w-2.5" /> PTT
                        </button>
                        <button onClick={() => void moveUserToSelectedChannel(u.id)} className="ml-1 flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-slate-600">
                          <Radio className="h-2.5 w-2.5" /> Move
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel className="col-span-12 flex flex-col overflow-hidden lg:col-span-3">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Bell className="h-3 w-3" /> Event Stream
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {events.map((e) => (
                <div key={e.id} className="animate-slide-up rounded-lg border border-white/5 bg-black/20 p-2 text-[10px]">
                  <div className={`flex items-center gap-1.5 mb-0.5 ${
                    e.level === 'critical' ? 'text-rose-400' : e.level === 'warn' ? 'text-amber-400' : 'text-indigo-400/50'
                  }`}>
                    <Activity className="h-2.5 w-2.5" />
                    <span className="font-bold uppercase text-[9px]">{e.level}</span>
                    <span className="ml-auto text-indigo-400/30">{new Date(e.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-300">{e.text}</div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="flex items-center justify-center py-10 text-indigo-400/20 text-[10px]">No events</div>
              )}
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
