import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Send, Users, ArrowLeft, Plus, Image, MapPin, Phone, Trash2, Mic, Radio, Headphones, Settings, LogOut, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { useAuthStore } from '@/features/auth/store';
import { useChatStore } from '@/features/chat/store';
import { Button } from '@/shared/Button';
import { LocalPttRecorder } from '@/lib/ptt-recorder';

export function ChatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    conversations, activeConversationId, messages, hasMore, loading,
    setConversations, setActiveConversation, addConversation, removeConversation,
    addMessage, prependMessages, setMessages, markRead, incrementUnread, updateLastMessage,
    onlineUsers, setUserOnline,
  } = useChatStore();

  const [content, setContent] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMemberIds, setNewMemberIds] = useState('');
  const [newType, setNewType] = useState<'direct' | 'group'>('direct');
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<LocalPttRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [usersSearchList, setUsersSearchList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchConv, setSearchConv] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    void wsClient.connect();
    api.get('/conversations').then((data: any) => {
      setConversations(data.conversations || []);
    }).catch(() => {});
    wsClient.send({ type: 'get_online_users' });
    return () => {};
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    markRead(activeConversationId);
    api.post(`/conversations/${activeConversationId}/read`).catch(() => {});
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    setLoadingMsgs(true);
    api.get(`/conversations/${activeConversationId}/messages`, { limit: '50' }).then((data: any) => {
      setMessages(
        activeConversationId,
        (data.messages || []).reverse(),
        data.hasMore || false,
      );
    }).catch(() => {}).finally(() => setLoadingMsgs(false));
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[activeConversationId || '']]);

  function handleLogout() {
    api.post('/auth/logout').catch(() => {});
    logout();
    wsClient.disconnect();
    navigate('/login');
  }

  const handleSend = useCallback(async () => {
    if (!content.trim() || !activeConversationId) return;
    const text = content.trim();
    setContent('');
    try {
      const data: any = await api.post(`/conversations/${activeConversationId}/messages`, {
        content: text,
        type: 'text',
      });
      if (data?.message) {
        const msg = {
          id: data.message.id,
          conversationId: activeConversationId,
          senderId: user?.id || '',
          content: data.message.content,
          type: data.message.type || 'text',
          metadata: data.message.metadata || null,
          createdAt: data.message.createdAt,
          sender: { id: user?.id || '', displayName: user?.displayName || '', avatarUrl: user?.avatarUrl || null },
        };
        addMessage(activeConversationId, msg);
        updateLastMessage(activeConversationId, msg);
      }
    } catch {}
  }, [content, activeConversationId, addMessage, updateLastMessage, user]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url } = await uploadRes.json();
      const data: any = await api.post(`/conversations/${activeConversationId}/messages`, {
        content: file.name,
        type: 'image',
        metadata: { url },
      });
      if (data?.message) {
        const msg = {
          id: data.message.id,
          conversationId: activeConversationId,
          senderId: user?.id || '',
          content: data.message.content,
          type: data.message.type || 'image',
          metadata: data.message.metadata || { url },
          createdAt: data.message.createdAt,
          sender: { id: user?.id || '', displayName: user?.displayName || '', avatarUrl: user?.avatarUrl || null },
        };
        addMessage(activeConversationId, msg);
        updateLastMessage(activeConversationId, msg);
      }
    } catch {
      toast.error('Image upload failed');
    }
    if (e.target) e.target.value = '';
  };

  const handleShareLocation = async () => {
    if (!activeConversationId || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          await api.post(`/conversations/${activeConversationId}/messages`, {
            content: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=15`,
            type: 'location',
            metadata: { latitude, longitude },
          });
          toast.success('Location shared');
        } catch {
          toast.error('Failed to share location');
        }
      },
      () => toast.error('Location access denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleVoiceRecord = async () => {
    if (!activeConversationId) return;
    if (isRecording) {
      const recorder = recorderRef.current;
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);

      if (recorder) {
        try {
          const result = await recorder.stop();
          const audioBlob = result?.blob;
          if (!audioBlob || audioBlob.size < 100) {
            toast.error('Voice message is too short');
            return;
          }

          const token = useAuthStore.getState().accessToken;
          const formData = new FormData();
          formData.append('file', audioBlob, `voice-${Date.now()}.wav`);
          let uploadRes = await fetch('/api/v1/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (uploadRes.status === 401) {
            const refreshRes = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              useAuthStore.getState().setAuth(useAuthStore.getState().user!, refreshData.accessToken);
              uploadRes = await fetch('/api/v1/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${refreshData.accessToken}` },
                body: formData,
              });
            }
          }

          if (!uploadRes.ok) {
            const errData = await uploadRes.json().catch(() => ({}));
            throw new Error(errData.error || `Upload failed (${uploadRes.status})`);
          }
          const { url } = await uploadRes.json();
          const data: any = await api.post(`/conversations/${activeConversationId}/messages`, {
            content: 'Voice message',
            type: 'voice',
            metadata: { url, durationMs: result.durationMs },
          });
          if (data?.message) {
            const msg = {
              id: data.message.id,
              conversationId: activeConversationId,
              senderId: user?.id || '',
              content: data.message.content,
              type: data.message.type || 'voice',
              metadata: data.message.metadata || { url, durationMs: result.durationMs },
              createdAt: data.message.createdAt,
              sender: { id: user?.id || '', displayName: user?.displayName || '', avatarUrl: user?.avatarUrl || null },
            };
            addMessage(activeConversationId, msg);
            updateLastMessage(activeConversationId, msg);
          }
        } catch (err: any) {
          toast.error(err?.message || 'Voice message send failed');
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new LocalPttRecorder();
        recorder.start(stream);
        recorderRef.current = recorder;
        setIsRecording(true);
        toast.success('Recording... tap again to send');
      } catch (err: any) {
        const msg = err?.name === 'NotAllowedError' ? 'Microphone access denied' : 'Failed to access microphone';
        toast.error(msg);
      }
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await api.delete(`/conversations/${convId}`);
      removeConversation(convId);
      if (activeConversationId === convId) setActiveConversation(null);
      toast.success('Conversation deleted');
    } catch { toast.error('Failed to delete conversation'); }
  };

  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});

  function ImageMessage({ url, alt }: { url: string; alt: string }) {
    const cached = imageCache[url];
    const imgRef = useRef<HTMLImageElement>(null);
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState(false);

    useEffect(() => {
      if (cached) { setLoading(false); return; }
      const token = useAuthStore.getState().accessToken;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => {
          if (!r.ok) throw new Error('Failed');
          return r.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          setImageCache(prev => ({ ...prev, [url]: blobUrl }));
          setLoading(false);
        })
        .catch(() => { setLoading(false); setError(true); });
    }, [url]);

    if (loading) return <div className="h-40 w-64 animate-pulse rounded bg-slate-700" />;
    if (error) return <div className="text-xs text-red-400">Failed to load image</div>;

    return (
      <img
        ref={imgRef}
        src={cached}
        alt={alt}
        className="max-w-sm cursor-pointer rounded-lg object-cover shadow-sm transition-transform hover:scale-[1.02]"
        style={{ maxHeight: 300 }}
        onClick={() => cached && window.open(cached, '_blank')}
      />
    );
  }

  function VoiceMessage({ url, durationMs }: { url: string; durationMs?: number }) {
    const cached = audioCache[url];
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState(false);

    useEffect(() => {
      if (cached) { setLoading(false); return; }
      const token = useAuthStore.getState().accessToken;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => {
          if (!r.ok) throw new Error('Failed');
          return r.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          setAudioCache(prev => ({ ...prev, [url]: blobUrl }));
          setLoading(false);
        })
        .catch(() => { setLoading(false); setError(true); });
    }, [url]);

    if (loading) return <div className="h-10 w-48 animate-pulse rounded-full bg-slate-700" />;
    if (error) return <div className="text-xs text-red-400">Failed to load audio</div>;

    return (
      <div className="flex items-center gap-3 rounded-full bg-white/5 pr-3">
        <audio controls src={cached} className="max-w-[200px] h-10 custom-audio" />
        {durationMs && <span className="text-xs font-medium opacity-80">{(durationMs / 1000).toFixed(1)}s</span>}
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateConversation = async () => {
    const memberIds = newMemberIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (memberIds.length === 0) return;

    try {
      const data: any = await api.post('/conversations', {
        type: newType,
        name: newType === 'group' ? newName || 'Group' : undefined,
        memberIds,
      });
      if (data.conversation) {
        addConversation({
          id: data.conversation.id,
          type: data.conversation.type,
          name: data.conversation.name,
          createdAt: data.conversation.createdAt,
          updatedAt: data.conversation.updatedAt,
          lastMessage: null,
          unreadCount: 0,
          participants: data.conversation.participants || [],
        });
        setActiveConversation(data.conversation.id);
        setShowCreate(false);
        setNewName('');
        setNewMemberIds('');
      }
    } catch (err: any) {
      const msg = err?.message || err?.response?.error || 'Failed to create conversation';
      toast.error(msg);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const convMessages = messages[activeConversationId || ''] || [];

  const conversationName = (conv: typeof activeConv) => {
    if (!conv) return '';
    if (conv.name) return conv.name;
    if (conv.type === 'direct') {
      const other = conv.participants.find((p) => p.userId !== user?.id);
      return other ? (other.displayName || other.userId.slice(0, 8)) : 'Direct';
    }
    return 'Group';
  };

  const loadMore = async () => {
    if (!activeConversationId || !hasMore[activeConversationId]) return;
    const firstMsg = convMessages[0];
    if (!firstMsg) return;
    setLoadingMsgs(true);
    try {
      const data: any = await api.get(`/conversations/${activeConversationId}/messages`, {
        before: firstMsg.id,
        limit: '50',
      });
      prependMessages(activeConversationId, (data.messages || []).reverse(), data.hasMore || false);
    } catch {} finally {
      setLoadingMsgs(false);
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el || el.scrollTop > 100) return;
    loadMore();
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter(c => conversationName(c).toLowerCase().includes(searchConv.toLowerCase()));
  }, [conversations, searchConv, user?.id]);

  const navItems = [
    { icon: Radio, label: 'Channels', color: 'text-blue-400', action: () => navigate('/') },
    { icon: MessageSquare, label: 'Chat', color: 'text-emerald-400', action: () => {}, active: true },
    ...(user?.role === 'admin' || user?.role === 'dispatcher' ? [{ icon: Headphones, label: 'Dispatcher', color: 'text-amber-400', action: () => navigate('/dispatcher') }] : []),
    ...(user?.role === 'admin' ? [{ icon: Settings, label: 'Admin', color: 'text-purple-400', action: () => navigate('/admin') }] : []),
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Left Sidebar (Desktop) */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900/95 backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20 shadow-inner">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">VoxChat</h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Messaging</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-4">
          {navItems.map(({ icon: Icon, label, color, action, active }) => (
            <button
              key={label}
              onClick={action}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                active 
                  ? 'bg-slate-800/80 text-white shadow-md ring-1 ring-white/10' 
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-slate-700/50' : 'bg-transparent'}`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} />
              </div>
              <span>{label}</span>
              {label === 'Chat' && totalUnread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/40 p-2 border border-slate-700/50">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-sm font-bold shadow-sm">
              {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-200">{user?.displayName}</div>
              <div className="truncate text-[10px] text-slate-500 uppercase tracking-wider">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex flex-1 flex-col overflow-hidden relative bg-slate-950">
        
        <div className="flex flex-1 overflow-hidden">
        {/* Conversations List Column */}
        <div className={`flex flex-col border-r border-slate-800 bg-slate-900/50 w-full md:w-80 lg:w-96 shrink-0 transition-all ${
          activeConversationId ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900">
             <div className="flex items-center gap-2">
               <button onClick={() => navigate('/')} className="rounded p-1 text-slate-400 hover:bg-slate-800">
                 <ArrowLeft className="h-5 w-5" />
               </button>
               <h1 className="text-lg font-bold">Chats</h1>
             </div>
             {totalUnread > 0 && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">{totalUnread} new</span>}
          </div>
          
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between mb-4">
               <h2 className="hidden md:block text-xl font-bold tracking-tight">Messages</h2>
               <button
                onClick={() => setShowCreate(true)}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                title="New Chat"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                value={searchConv}
                onChange={(e) => setSearchConv(e.target.value)}
                placeholder="Search chats..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950/50 py-2 pl-9 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              />
            </div>
          </div>

          {/* Create Chat Modal/Dropdown inline */}
          {showCreate && (
            <div className="p-4 border-b border-slate-800 bg-slate-800/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">New Conversation</span>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white text-xs">Cancel</button>
              </div>
              <div className="flex gap-2 mb-3 bg-slate-950/50 p-1 rounded-lg">
                <button
                  onClick={() => setNewType('direct')}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${newType === 'direct' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Direct
                </button>
                <button
                  onClick={() => setNewType('group')}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${newType === 'group' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Group
                </button>
              </div>
              {newType === 'group' && (
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Group Name"
                  className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              )}
              <div className="relative mb-2">
                <input
                  value={userSearch}
                  onChange={async (e) => {
                    setUserSearch(e.target.value);
                    if (e.target.value.length < 1) { setUsersSearchList([]); return; }
                    setLoadingUsers(true);
                    try {
                      const data: any = await api.get('/users/search', { q: e.target.value });
                      setUsersSearchList(data.users || []);
                    } catch { setUsersSearchList([]); }
                    setLoadingUsers(false);
                  }}
                  placeholder="Search users to add..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                {usersSearchList.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
                    {usersSearchList.map((u: any) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          const existing = newMemberIds ? newMemberIds.split(',').map(s => s.trim()).filter(Boolean) : [];
                          if (!existing.includes(u.display_name || u.email)) {
                            existing.push(u.display_name || u.email);
                            setNewMemberIds(existing.join(', '));
                          }
                          setUserSearch('');
                          setUsersSearchList([]);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors"
                      >
                        <span className="font-medium text-slate-200">{u.display_name}</span>
                        <span className="text-xs text-slate-500 truncate">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={newMemberIds}
                onChange={(e) => setNewMemberIds(e.target.value)}
                placeholder="Selected users..."
                className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <Button onClick={handleCreateConversation} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg">Start Chat</Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6 text-center">
                <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">No conversations found</p>
                <p className="text-xs mt-1 opacity-70">Start a new chat to connect with your team.</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredConversations.map((conv) => {
                  const isActive = activeConversationId === conv.id;
                  const other = conv.type === 'direct' ? conv.participants.find((p) => p.userId !== user?.id) : null;
                  const isOnline = other ? onlineUsers.has(other.userId) : false;
                  
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConversation(conv.id)}
                      className={`group relative flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                        isActive 
                          ? 'bg-emerald-600/10 ring-1 ring-emerald-500/30' 
                          : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 shadow-sm border border-slate-700/50">
                        {conv.type === 'group' ? (
                          <Users className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <span className="text-lg font-bold text-slate-300">{conversationName(conv).charAt(0).toUpperCase()}</span>
                        )}
                        {conv.type === 'direct' && (
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        )}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`truncate text-[15px] font-semibold ${isActive ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {conversationName(conv)}
                          </span>
                          {conv.lastMessage && (
                            <span className="text-[10px] text-slate-500 ml-2 shrink-0">
                              {new Date(conv.lastMessage.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className={`truncate text-xs ${conv.unreadCount > 0 ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                            {conv.lastMessage?.content || 'Say hi 👋'}
                          </div>
                          {conv.unreadCount > 0 && (
                            <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                          className="rounded-full p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shadow-sm"
                          title="Delete Chat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Active Chat Column */}
        <div className={`flex flex-col flex-1 bg-[url('/bg-pattern.svg')] bg-center bg-cover bg-no-repeat bg-opacity-5 transition-all ${
          !activeConversationId ? 'hidden md:flex' : 'flex'
        }`}>
          {!activeConversationId ? (
            <div className="flex flex-col items-center justify-center h-full bg-slate-900/40 backdrop-blur-sm">
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 flex flex-col items-center shadow-xl max-w-sm text-center">
                <div className="h-16 w-16 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <MessageSquare className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">VoxChat Desktop</h3>
                <p className="text-sm text-slate-400 mb-6">Select a conversation from the left to start messaging, or create a new one to connect with your team.</p>
                <Button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-6 py-2 shadow-lg hover:shadow-emerald-500/25 transition-all">
                  Start Messaging
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-10 shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveConversation(null)} className="md:hidden rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 shadow-sm border border-slate-700/50">
                      {activeConv?.type === 'group' ? <Users className="h-5 w-5 text-emerald-400" /> : <span className="text-lg font-bold text-slate-300">{conversationName(activeConv).charAt(0).toUpperCase()}</span>}
                    </div>
                    <div>
                      <h2 className="text-[15px] font-bold text-slate-100">{conversationName(activeConv)}</h2>
                      {activeConv?.type === 'direct' && (
                        <p className="text-[11px] text-emerald-400 font-medium tracking-wide">
                          {onlineUsers.has(activeConv.participants.find((p:any) => p.userId !== user?.id)?.userId || '') ? 'Online' : 'Offline'}
                        </p>
                      )}
                      {activeConv?.type === 'group' && (
                        <p className="text-[11px] text-slate-500 font-medium tracking-wide">
                          {activeConv.participants.length} members
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeConv?.type === 'direct' && (
                    <button
                      onClick={() => {
                        const other = activeConv.participants.find((p: any) => p.userId !== user?.id);
                        if (!other) return;
                        wsClient.send({ type: 'direct_ptt.call', targetUserId: other.userId, conversationId: activeConv.id });
                      }}
                      className="flex items-center justify-center h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                      title="PTT Call"
                    >
                      <Phone className="h-4.5 w-4.5" />
                    </button>
                  )}
                  <button 
                    className="md:hidden flex items-center justify-center h-9 w-9 rounded-full text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
                    onClick={() => handleDeleteConversation(activeConversationId)}
                  >
                     <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div 
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth custom-scrollbar"
                style={{
                  backgroundImage: 'radial-gradient(circle at center, rgba(15, 23, 42, 0) 0%, rgba(2, 6, 23, 0.6) 100%)'
                }}
              >
                {loadingMsgs && convMessages.length === 0 && (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  </div>
                )}
                
                {hasMore[activeConversationId] && (
                  <div className="flex justify-center mb-6">
                    <button
                      onClick={loadMore}
                      className="rounded-full bg-slate-800/80 backdrop-blur border border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition-all shadow-sm"
                    >
                      Load previous messages
                    </button>
                  </div>
                )}

                <div className="flex flex-col space-y-4">
                  {convMessages.map((msg, idx) => {
                    let meta = msg.metadata;
                    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
                    
                    const isMine = msg.senderId === user?.id;
                    const prevMsg = convMessages[idx - 1];
                    const showHeader = !prevMsg || prevMsg.senderId !== msg.senderId || (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 5 * 60 * 1000);

                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                          {showHeader && !isMine && (
                            <div className="ml-1 mb-1 text-[11px] font-semibold text-slate-400 tracking-wide">
                              {msg.sender?.displayName || msg.senderId.slice(0, 8)}
                            </div>
                          )}
                          
                          <div className={`relative px-4 py-2.5 shadow-sm text-[15px] leading-relaxed ${
                            isMine 
                              ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm' 
                              : 'bg-slate-800 text-slate-100 rounded-2xl rounded-tl-sm border border-slate-700/50'
                          }`}>
                            {msg.type === 'image' && meta?.url ? (
                              <ImageMessage url={meta.url} alt={msg.content} />
                            ) : msg.type === 'voice' && meta?.url ? (
                              <VoiceMessage url={meta.url} durationMs={meta?.durationMs} />
                            ) : msg.type === 'location' && msg.content ? (
                              <a
                                href={msg.content}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 font-medium underline underline-offset-2 ${isMine ? 'text-emerald-100 hover:text-white' : 'text-blue-400 hover:text-blue-300'}`}
                              >
                                <MapPin className="h-4.5 w-4.5" />
                                View location on Map
                              </a>
                            ) : (
                              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                            )}
                            
                            <div className={`flex items-center gap-1 mt-1 justify-end text-[10px] ${isMine ? 'text-emerald-200' : 'text-slate-500'}`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} className="h-1" />
                </div>
              </div>

              {/* Chat Input */}
              <div className="bg-slate-900/90 backdrop-blur-md border-t border-slate-800 p-3 md:p-4 z-10 shrink-0">
                <div className="flex items-end gap-2 max-w-4xl mx-auto">
                  <div className="flex gap-1 shrink-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center h-10 w-10 rounded-full text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                      title="Attach Image"
                    >
                      <Image className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleShareLocation}
                      className="hidden sm:flex items-center justify-center h-10 w-10 rounded-full text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                      title="Share Location"
                    >
                      <MapPin className="h-5 w-5" />
                    </button>
                  </div>
                  
                  <div className="flex-1 relative">
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Write a message..."
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-2xl px-4 py-3 text-[15px] outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none overflow-hidden max-h-32 placeholder:text-slate-500 custom-scrollbar"
                      rows={1}
                      style={{ minHeight: '44px' }}
                    />
                  </div>
                  
                  <div className="flex gap-1 shrink-0">
                    {content.trim() ? (
                      <button
                        onClick={handleSend}
                        className="flex items-center justify-center h-10 w-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] hover:scale-105"
                      >
                        <Send className="h-4.5 w-4.5 ml-0.5" />
                      </button>
                    ) : (
                      <button
                        onClick={handleVoiceRecord}
                        className={`flex items-center justify-center h-10 w-10 rounded-full transition-all ${
                          isRecording 
                            ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.5)]' 
                            : 'bg-slate-800 text-emerald-400 hover:bg-slate-700 hover:text-emerald-300'
                        }`}
                        title={isRecording ? 'Stop Recording' : 'Record Voice Message'}
                      >
                        {isRecording ? <div className="h-3 w-3 rounded-sm bg-white" /> : <Mic className="h-5 w-5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex shrink-0 border-t border-slate-800 pb-safe pt-2 bg-slate-900 justify-around">
            {[
              { icon: Radio, label: 'Channels', action: () => navigate('/') },
              { icon: MessageSquare, label: 'Chat', action: () => {}, active: true, badge: totalUnread },
              ...(user?.role === 'admin' || user?.role === 'dispatcher' ? [{ icon: Headphones, label: 'Dispatch', action: () => navigate('/dispatcher') }] : []),
              ...(user?.role === 'admin' ? [{ icon: Settings, label: 'Admin', action: () => navigate('/admin') }] : []),
            ].map(({ icon: Icon, label, action, badge, active }: any) => (
              <button
                key={label}
                onClick={action}
                className={`flex flex-col items-center gap-1 py-1 text-[10px] ${active ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
                </div>
                {label}
              </button>
            ))}
        </nav>
      </div>
    </div>
  );
}
