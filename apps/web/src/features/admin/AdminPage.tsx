import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, FileText, Hash, Search, Shield, Users, Activity, Radio, Globe, Lock, Plus, VolumeX, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type Tab = 'users' | 'channels' | 'audit' | 'deployment';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

interface AdminChannel {
  id: string;
  name: string;
  description?: string;
  type: string;
  ownerName: string;
  memberCount: number;
  isActive?: boolean;
}

interface ChannelMember {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  user_role: string;
  member_role: string;
  joined_at: string;
  last_seen_at?: string | null;
  is_muted?: boolean;
}

interface AuditLog {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: unknown;
  ip_address: string;
  created_at: string;
}

interface TlsSettings {
  domain: string;
  certExists: boolean;
  keyExists: boolean;
  certUpdatedAt: string | null;
  keyUpdatedAt: string | null;
  canApplyFromApi: boolean;
}

function mapUser(raw: any): AdminUser {
  return {
    id: raw.id,
    email: raw.email ?? '',
    displayName: raw.displayName ?? raw.display_name ?? 'Unknown',
    role: raw.role ?? 'user',
    isActive: raw.isActive ?? raw.is_active ?? true,
  };
}

function mapChannel(raw: any): AdminChannel {
  return {
    id: raw.id,
    name: raw.name ?? 'Unnamed',
    description: raw.description ?? '',
    type: raw.type ?? 'public',
    ownerName: raw.ownerName ?? raw.owner_name ?? 'System',
    memberCount: Number(raw.memberCount ?? raw.member_count ?? 0),
    isActive: raw.isActive ?? raw.is_active ?? true,
  };
}

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-blue-900/50 text-blue-300',
  dispatcher: 'bg-purple-900/50 text-purple-300',
  user: 'bg-slate-800 text-slate-400',
  listener: 'bg-slate-800 text-slate-500',
};

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('users');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tlsSettings, setTlsSettings] = useState<TlsSettings | null>(null);
  const [domain, setDomain] = useState('');
  const [certificatePem, setCertificatePem] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [caBundlePem, setCaBundlePem] = useState('');
  const [applyNow, setApplyNow] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [newChannelType, setNewChannelType] = useState<'public' | 'private'>('public');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserName, setEditingUserName] = useState('');
  const [editingUserEmail, setEditingUserEmail] = useState('');
  const [editingUserPassword, setEditingUserPassword] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [editingChannelDescription, setEditingChannelDescription] = useState('');
  const [editingChannelType, setEditingChannelType] = useState<'public' | 'private'>('public');
  const [managingMembersChannelId, setManagingMembersChannelId] = useState<string | null>(null);
  const [channelMembersById, setChannelMembersById] = useState<Record<string, ChannelMember[]>>({});
  const [memberPickerByChannel, setMemberPickerByChannel] = useState<Record<string, string>>({});
  const [memberRoleByChannel, setMemberRoleByChannel] = useState<Record<string, 'member' | 'admin'>>({});

  useEffect(() => { void loadCurrentTab(); }, [tab]);

  async function loadCurrentTab() {
    setLoading(true);
    try {
      if (tab === 'users') {
        const data: any = await api.get('/admin/users', { limit: '100' });
        setUsers((data.users || []).map(mapUser));
      } else if (tab === 'channels') {
        const data: any = await api.get('/admin/channels', { limit: '100' });
        setChannels((data.channels || []).map(mapChannel));
        if (users.length === 0) {
          const usersData: any = await api.get('/admin/users', { limit: '100' });
          setUsers((usersData.users || []).map(mapUser));
        }
      } else if (tab === 'audit') {
        const data: any = await api.get('/admin/audit-logs', { limit: '100' });
        setLogs(data.logs || []);
      } else if (tab === 'deployment') {
        const data: any = await api.get('/admin/deployment/tls');
        setTlsSettings(data);
        setDomain(data.domain || '');
      }
    } catch (err: any) { toast.error(err.message || 'Failed to load'); } finally { setLoading(false); }
  }

  async function toggleUserActive(userId: string, current: boolean) {
    try {
      await api.patch(`/admin/users/${userId}`, { isActive: !current });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: !current } : u)));
      toast.success(current ? 'User blocked' : 'User unblocked');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function createUser() {
    if (!newUserEmail.trim() || !newUserName.trim() || !newUserPassword.trim()) { toast.error('Fill all fields'); return; }
    try {
      const data: any = await api.post('/admin/users', { email: newUserEmail.trim(), password: newUserPassword, displayName: newUserName.trim(), role: newUserRole });
      setUsers((prev) => [mapUser(data.user), ...prev]);
      setShowCreateUser(false); setNewUserEmail(''); setNewUserName(''); setNewUserPassword(''); setNewUserRole('user');
      toast.success('User created');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function changeRole(userId: string, role: string) {
    try {
      await api.patch(`/admin/users/${userId}`, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success('Role updated');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  function startEditUser(user: AdminUser) { setEditingUserId(user.id); setEditingUserName(user.displayName); setEditingUserEmail(user.email); setEditingUserPassword(''); }
  async function saveUserEdit() {
    if (!editingUserId) return;
    try {
      const payload: Record<string, unknown> = { displayName: editingUserName.trim(), email: editingUserEmail.trim() };
      if (editingUserPassword.trim()) payload.password = editingUserPassword;
      const data: any = await api.patch(`/admin/users/${editingUserId}`, payload);
      setUsers((prev) => prev.map((u) => (u.id === editingUserId ? mapUser(data.user) : u)));
      setEditingUserId(null); toast.success('User updated');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  function startEditChannel(c: AdminChannel) { setEditingChannelId(c.id); setEditingChannelName(c.name); setEditingChannelDescription(c.description ?? ''); setEditingChannelType(c.type === 'private' ? 'private' : 'public'); }
  async function saveChannelEdit() {
    if (!editingChannelId || !editingChannelName.trim()) { toast.error('Name required'); return; }
    try {
      const data: any = await api.patch(`/admin/channels/${editingChannelId}`, { name: editingChannelName.trim(), description: editingChannelDescription.trim(), type: editingChannelType });
      setChannels((prev) => prev.map((c) => (c.id === editingChannelId ? mapChannel(data.channel) : c)));
      setEditingChannelId(null); toast.success('Channel updated');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function loadChannelMembers(channelId: string) {
    const data: any = await api.get(`/channels/${channelId}/members`);
    setChannelMembersById((prev) => ({ ...prev, [channelId]: data.members || [] }));
  }

  async function toggleManageMembers(channelId: string) {
    if (managingMembersChannelId === channelId) { setManagingMembersChannelId(null); return; }
    try {
      await loadChannelMembers(channelId);
      if (users.length === 0) { const d: any = await api.get('/admin/users', { limit: '100' }); setUsers((d.users || []).map(mapUser)); }
      setMemberRoleByChannel((prev) => ({ ...prev, [channelId]: prev[channelId] || 'member' }));
      setManagingMembersChannelId(channelId);
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function addMemberToChannel(channelId: string) {
    const userId = memberPickerByChannel[channelId];
    if (!userId) { toast.error('Select a user'); return; }
    try {
      await api.post(`/channels/${channelId}/members`, { userId, role: memberRoleByChannel[channelId] || 'member' });
      await loadChannelMembers(channelId);
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, memberCount: c.memberCount + 1 } : c)));
      setMemberPickerByChannel((prev) => ({ ...prev, [channelId]: '' }));
      toast.success('User added');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function removeMemberFromChannel(channelId: string, userId: string) {
    try {
      await api.delete(`/channels/${channelId}/members/${userId}`);
      await loadChannelMembers(channelId);
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c)));
      toast.success('User removed');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function toggleMuteMember(channelId: string, userId: string, currentMuted: boolean) {
    try {
      await api.patch(`/channels/${channelId}/members/${userId}/mute`, { muted: !currentMuted });
      await loadChannelMembers(channelId);
      toast.success(currentMuted ? 'User unmuted' : 'User muted');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function deleteChannel(channelId: string) {
    if (!window.confirm('Delete this channel?')) return;
    try { await api.delete(`/admin/channels/${channelId}`); setChannels((prev) => prev.filter((c) => c.id !== channelId)); toast.success('Deleted'); }
    catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function createChannelFromAdmin() {
    if (!newChannelName.trim()) { toast.error('Name required'); return; }
    try {
      const data: any = await api.post('/channels', { name: newChannelName.trim(), description: newChannelDescription.trim(), type: newChannelType });
      setChannels((prev) => [mapChannel({ ...data.channel, owner_name: 'You', member_count: 1 }), ...prev]);
      setShowCreateChannel(false); setNewChannelName(''); setNewChannelDescription(''); setNewChannelType('public');
      toast.success('Channel created');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function deleteChannelAsAdmin(channelId: string) {
    if (!window.confirm('Delete this channel permanently?')) return;
    try { await api.delete(`/admin/channels/${channelId}`); setChannels((prev) => prev.filter((c) => c.id !== channelId)); toast.success('Deleted'); } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  async function saveTlsSettings() {
    if (!domain.trim() || !certificatePem.trim() || !privateKeyPem.trim()) { toast.error('Domain, cert and key required'); return; }
    try {
      const res: any = await api.post('/admin/deployment/tls', { domain: domain.trim(), certificatePem, privateKeyPem, caBundlePem: caBundlePem.trim() || undefined, applyNow });
      toast.success(res.applied ? 'TLS applied' : 'TLS saved'); await loadCurrentTab(); setCertificatePem(''); setPrivateKeyPem(''); setCaBundlePem('');
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  }

  const filteredUsers = useMemo(() => users.filter((u) => u.displayName.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const filteredChannels = useMemo(() => channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.ownerName.toLowerCase().includes(search.toLowerCase())), [channels, search]);

  const tabs: { key: Tab; label: string; icon: typeof Users; color: string; bg: string }[] = [
    { key: 'users', label: 'Users', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10 hover:bg-blue-500/20' },
    { key: 'channels', label: 'Channels', icon: Hash, color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20' },
    { key: 'audit', label: 'Audit', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10 hover:bg-amber-500/20' },
    { key: 'deployment', label: 'TLS', icon: Globe, color: 'text-purple-400', bg: 'bg-purple-500/10 hover:bg-purple-500/20' },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Left sidebar */}
      <aside className="hidden lg:flex w-52 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4">
          <button onClick={() => navigate('/')} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold">Admin</span>
            </div>
            <p className="text-[10px] text-slate-500">System administration</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3">
          {tabs.map(({ key, label, icon: Icon, color, bg }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? `${bg} ${color}` : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tab === key ? bg : 'bg-slate-800'}`}>
                <Icon className={`h-5 w-5 ${tab === key ? color : 'text-slate-400'}`} />
              </div>
              <span>{label}</span>
              {key === 'users' && <span className="ml-auto text-xs text-slate-500">{users.length}</span>}
              {key === 'channels' && <span className="ml-auto text-xs text-slate-500">{channels.length}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <button onClick={() => navigate('/')} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to app
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="rounded p-1 text-slate-400 hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></button>
              <Shield className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold">Admin</span>
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${tab === key ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-white'}`}
                >
                  <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {tab !== 'audit' && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 min-w-0">
                <Search className="h-4 w-4 shrink-0 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === 'users' ? 'Search users...' : 'Search channels...'} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500" />
              </div>
              {tab === 'users' && (
                <button onClick={() => setShowCreateUser((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 shrink-0">
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create user</span>
                </button>
              )}
              {tab === 'channels' && (
                <button onClick={() => setShowCreateChannel((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 shrink-0">
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create channel</span>
                </button>
              )}
            </div>
          )}

          {/* Create user form */}
          {!loading && tab === 'users' && showCreateUser && (
            <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Display name" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="Email" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                <input value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Password" type="password" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500">
                  <option value="user">User</option><option value="dispatcher">Dispatcher</option><option value="admin">Admin</option><option value="listener">Listener</option>
                </select>
                <button onClick={createUser} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">Create</button>
              </div>
            </div>
          )}

          {/* Create channel form */}
          {!loading && tab === 'channels' && showCreateChannel && (
            <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="Channel name" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                <input value={newChannelDescription} onChange={(e) => setNewChannelDescription(e.target.value)} placeholder="Description" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
                <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value as any)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-blue-500">
                  <option value="public">Public</option><option value="private">Private</option>
                </select>
                <button onClick={createChannelFromAdmin} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">Create</button>
              </div>
            </div>
          )}

          {loading && <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>}

          {/* Users tab */}
          {!loading && tab === 'users' && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">User</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Email</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                      <td className="px-4 py-2.5">
                        {editingUserId === u.id ? (
                          <input value={editingUserName} onChange={(e) => setEditingUserName(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                        ) : (
                          <span className="font-medium">{u.displayName}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-sm text-slate-400">
                        {editingUserId === u.id ? (
                          <input value={editingUserEmail} onChange={(e) => setEditingUserEmail(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                        ) : u.email}
                      </td>
                      <td className="px-4 py-2.5">
                        <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none">
                          <option value="user">User</option><option value="dispatcher">Dispatcher</option><option value="admin">Admin</option><option value="listener">Listener</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${u.isActive ? 'bg-emerald-900/50 text-emerald-300' : 'bg-rose-900/50 text-rose-300'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {u.isActive ? 'Active' : 'Blocked'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {editingUserId === u.id ? (
                            <>
                              <button onClick={saveUserEdit} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500">Save</button>
                              <button onClick={() => setEditingUserId(null)} className="rounded border border-slate-700 px-2 py-1 text-xs">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEditUser(u)} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Edit</button>
                              <button onClick={() => toggleUserActive(u.id, u.isActive)} className={`rounded px-2 py-1 text-xs ${u.isActive ? 'border border-rose-700 bg-rose-900/50 text-rose-300 hover:bg-rose-800/50' : 'border border-emerald-700 bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50'}`}>
                                {u.isActive ? 'Block' : 'Unblock'}
                              </button>
                              <button onClick={async () => { if (!window.confirm('Delete permanently?')) return; try { await api.delete(`/admin/users/${u.id}`); setUsers((prev) => prev.filter((x) => x.id !== u.id)); toast.success('Deleted'); } catch (err: any) { toast.error(err.message); } }} className="rounded border border-red-700 bg-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-800/50">Del</button>
                            </>
                          )}
                        </div>
                        {editingUserId === u.id && (
                          <input value={editingUserPassword} onChange={(e) => setEditingUserPassword(e.target.value)} placeholder="New password" type="password" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-blue-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No users found</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Channels tab */}
          {!loading && tab === 'channels' && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Channel</th>
                    <th className="px-4 py-2.5 hidden md:table-cell">Type</th>
                    <th className="px-4 py-2.5">Members</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChannels.map((c) => (
                    <>
                      <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                        <td className="px-4 py-2.5">
                          {editingChannelId === c.id ? (
                            <div className="space-y-1">
                              <input value={editingChannelName} onChange={(e) => setEditingChannelName(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                              <input value={editingChannelDescription} onChange={(e) => setEditingChannelDescription(e.target.value)} placeholder="Description" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                              <select value={editingChannelType} onChange={(e) => setEditingChannelType(e.target.value as any)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none">
                                <option value="public">Public</option><option value="private">Private</option>
                              </select>
                            </div>
                          ) : (
                            <div>
                              <span className="font-medium">{c.name}</span>
                              {c.description && <span className="ml-2 text-xs text-slate-500">{c.description}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className={`rounded px-2 py-0.5 text-xs ${c.type === 'private' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{c.type}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 text-sm text-slate-300"><Users className="h-3.5 w-3.5 text-slate-500" />{c.memberCount}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {editingChannelId === c.id ? (
                              <>
                                <button onClick={saveChannelEdit} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500">Save</button>
                                <button onClick={() => setEditingChannelId(null)} className="rounded border border-slate-700 px-2 py-1 text-xs">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => void toggleManageMembers(c.id)} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">{managingMembersChannelId === c.id ? 'Close' : 'Members'}</button>
                                <button onClick={() => startEditChannel(c)} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Edit</button>
                                <button onClick={() => deleteChannel(c.id)} className="rounded border border-red-700 bg-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-800/50">Del</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {managingMembersChannelId === c.id && (
                        <tr key={`${c.id}-members`}>
                          <td colSpan={4} className="bg-slate-900/50 px-4 py-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <select value={memberPickerByChannel[c.id] || ''} onChange={(e) => setMemberPickerByChannel((prev) => ({ ...prev, [c.id]: e.target.value }))} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none">
                                  <option value="">Select user</option>
                                  {users.filter((u) => !(channelMembersById[c.id] || []).some((m) => m.id === u.id)).map((u) => (
                                    <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
                                  ))}
                                </select>
                                <select value={memberRoleByChannel[c.id] || 'member'} onChange={(e) => setMemberRoleByChannel((prev) => ({ ...prev, [c.id]: e.target.value as 'member' | 'admin' }))} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none">
                                  <option value="member">member</option><option value="admin">admin</option>
                                </select>
                                <button onClick={() => void addMemberToChannel(c.id)} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500">Add</button>
                              </div>
                              <div className="space-y-1">
                                {(channelMembersById[c.id] || []).map((m) => (
                                  <div key={m.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{m.display_name}</span>
                                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${m.member_role === 'owner' ? 'bg-amber-900/50 text-amber-300' : m.member_role === 'admin' ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>{m.member_role}</span>
                                      {m.is_muted && <span className="text-red-400">muted</span>}
                                    </div>
                                    {m.member_role !== 'owner' && (
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => void toggleMuteMember(c.id, m.id, !!m.is_muted)} className={`rounded px-1.5 py-0.5 text-[10px] border ${m.is_muted ? 'border-emerald-700 bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50' : 'border-amber-700 bg-amber-900/50 text-amber-300 hover:bg-amber-800/50'}`} title={m.is_muted ? 'Unmute' : 'Mute'}>
                                          {m.is_muted ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                                        </button>
                                        <button onClick={() => void removeMemberFromChannel(c.id, m.id)} className="rounded border border-red-700 bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-800/50">Remove</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {filteredChannels.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">No channels found</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Audit tab */}
          {!loading && tab === 'audit' && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5 hidden md:table-cell">User</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Type</th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">IP</th>
                    <th className="px-4 py-2.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No audit logs</td></tr>}
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                      <td className="px-4 py-2.5"><span className="font-medium">{l.action}</span></td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-sm text-slate-400">{l.user_name || 'System'}</td>
                      <td className="px-4 py-2.5 hidden sm:table-cell"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{l.entity_type || 'system'}</span></td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-slate-500">{l.ip_address || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Deployment tab */}
          {!loading && tab === 'deployment' && (
            <div className="mx-auto max-w-2xl space-y-4">
              {tlsSettings && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                    <div className="mb-1 text-slate-400">Domain</div>
                    <div className="font-medium">{tlsSettings.domain || 'not set'}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                    <div className="mb-1 text-slate-400">Certificate</div>
                    <div className="font-medium">cert: {tlsSettings.certExists ? 'present' : 'missing'} / key: {tlsSettings.keyExists ? 'present' : 'missing'}</div>
                  </div>
                </div>
              )}
              <div className="space-y-2"><label className="text-sm text-slate-400">Domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ptt.example.com" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500" /></div>
              <div className="space-y-2"><label className="text-sm text-slate-400">Certificate PEM</label><textarea value={certificatePem} onChange={(e) => setCertificatePem(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs outline-none focus:border-blue-500" /></div>
              <div className="space-y-2"><label className="text-sm text-slate-400">Private key PEM</label><textarea value={privateKeyPem} onChange={(e) => setPrivateKeyPem(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs outline-none focus:border-blue-500" /></div>
              <div className="space-y-2"><label className="text-sm text-slate-400">CA bundle (optional)</label><textarea value={caBundlePem} onChange={(e) => setCaBundlePem(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs outline-none focus:border-blue-500" /></div>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} /> Apply now (nginx test + reload)</label>
              <button onClick={saveTlsSettings} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"><Lock className="h-4 w-4" /> Save TLS Settings</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}