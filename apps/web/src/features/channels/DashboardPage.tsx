import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Plus, Radio, Users, Headphones, Shield, Search, MessageSquare, Hash, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { useAuthStore } from '@/features/auth/store';
import { useChatStore } from '@/features/chat/store';

interface Channel {
  id: string;
  name: string;
  description: string;
  type: string;
  member_count: number;
  member_role?: string;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { conversations } = useChatStore();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [search, setSearch] = useState('');
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    void loadChannels();
    void wsClient.connect();
    return () => {};
  }, []);

  async function loadChannels() {
    try {
      const data: any = await api.get('/channels');
      setChannels(data.channels || []);
    } catch {
      toast.error('Failed to load channels');
    }
  }

  async function handleCreateChannel() {
    if (!newName.trim()) return;
    try {
      const data: any = await api.post('/channels', { name: newName, description: newDesc });
      setChannels((prev) => [data.channel, ...prev]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      toast.success('Channel created');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create channel');
    }
  }

  async function handleJoin(channelId: string) {
    try {
      await api.post(`/channels/${channelId}/join`);
      navigate(`/channel/${channelId}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to join');
    }
  }

  function handleLogout() {
    api.post('/auth/logout').catch(() => {});
    logout();
    wsClient.disconnect();
    navigate('/login');
  }

  const filtered = useMemo(
    () =>
      channels.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.description.toLowerCase().includes(search.toLowerCase()),
      ),
    [channels, search],
  );

  const navItems = [
    { icon: Radio, label: 'Channels', color: 'text-blue-400', bg: 'bg-blue-500/10 hover:bg-blue-500/20', action: () => {} },
    { icon: MessageSquare, label: 'Chat', color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20', action: () => navigate('/chat') },
    ...(user?.role === 'admin' || user?.role === 'dispatcher' ? [{ icon: Headphones, label: 'Dispatcher', color: 'text-amber-400', bg: 'bg-amber-500/10 hover:bg-amber-500/20', action: () => navigate('/dispatcher') }] : []),
    ...(user?.role === 'admin' ? [{ icon: Settings, label: 'Admin', color: 'text-purple-400', bg: 'bg-purple-500/10 hover:bg-purple-500/20', action: () => navigate('/admin') }] : []),
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Left sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20">
            <Radio className="h-5 w-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold">VoxRelay</h1>
            <p className="text-[10px] text-slate-500">Push-to-Talk</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-3">
          {navItems.map(({ icon: Icon, label, color, bg, action }) => (
            <button
              key={label}
              onClick={action}
              className={`flex w-full items-center gap-3 rounded-lg ${bg || 'hover:bg-slate-800'} px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg || 'bg-slate-800'}`}>
                <Icon className={`h-5 w-5 ${color || 'text-blue-400'}`} />
              </div>
              <span>{label}</span>
              {label === 'Chat' && totalUnread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
              {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.displayName}</div>
              <div className="truncate text-[10px] text-slate-500">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile + desktop) */}
        <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
                <Radio className="h-4 w-4 text-blue-400" />
              </div>
              <h1 className="text-base font-semibold lg:hidden">VoxRelay</h1>
              <h1 className="hidden text-lg font-semibold lg:block">Channels</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCreate((v) => !v)} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">Create</span>
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-4 w-full">
            {/* Search */}
            <div className="mb-4 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
                <Search className="h-4 w-4 text-slate-500 shrink-0" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search channels..." className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600" />
              </div>
            </div>

            {/* Create channel form */}
            {showCreate && (
              <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Channel name" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                  <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={handleCreateChannel} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500">Create</button>
                  <button onClick={() => setShowCreate(false)} className="rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
                </div>
              </div>
            )}

            {/* Channel list — table on desktop, cards on mobile */}
            <div className="hidden md:block rounded-lg border border-slate-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Channel</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Members</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{c.name}</div>
                        {c.description && <div className="text-xs text-slate-500 truncate max-w-xs">{c.description}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-2 py-0.5 text-xs ${c.type === 'private' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{c.type}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-sm text-slate-300"><Users className="h-3.5 w-3.5 text-slate-500" />{c.member_count}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {c.member_role ? (
                          <span className={`rounded px-2 py-0.5 text-xs ${c.member_role === 'owner' ? 'bg-amber-900/50 text-amber-300' : c.member_role === 'admin' ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-800 text-slate-400'}`}>{c.member_role}</span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {c.member_role ? (
                          <button onClick={() => navigate(`/channel/${c.id}`)} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500">Open</button>
                        ) : (
                          <button onClick={() => handleJoin(c.id)} className="rounded-md border border-blue-600 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-600/20">Join</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No channels found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => c.member_role ? navigate(`/channel/${c.id}`) : handleJoin(c.id)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-left hover:bg-slate-800/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      {c.description && <div className="truncate text-xs text-slate-500">{c.description}</div>}
                    </div>
                    <span className={`rounded px-2 py-0.5 text-[10px] ${c.type === 'private' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{c.type}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-400"><Users className="h-3 w-3" />{c.member_count}</span>
                    {c.member_role ? (
                      <span className="text-blue-400">{c.member_role === 'owner' ? 'Owner' : c.member_role}</span>
                    ) : (
                      <span className="text-emerald-400">Tap to join</span>
                    )}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No channels found</div>}
            </div>
          </main>

          
        </div>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden flex shrink-0 border-t border-slate-800 bg-slate-900">
          {[
            { icon: Radio, label: 'Channels', action: () => {} },
            { icon: MessageSquare, label: 'Chat', action: () => navigate('/chat'), badge: totalUnread },
            ...(user?.role === 'admin' || user?.role === 'dispatcher' ? [{ icon: Headphones, label: 'Dispatch', action: () => navigate('/dispatcher') }] : []),
            ...(user?.role === 'admin' ? [{ icon: Settings, label: 'Admin', action: () => navigate('/admin') }] : []),
          ].map(({ icon: Icon, label, action, badge }: any) => (
            <button
              key={label}
              onClick={action}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-slate-400 hover:text-white"
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {badge > 0 && <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
              </div>
              {label}
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-slate-400 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </nav>
      </div>
    </div>
  );
}