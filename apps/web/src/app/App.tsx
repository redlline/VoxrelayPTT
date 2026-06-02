import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { useChatStore } from '@/features/chat/store';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/features/channels/DashboardPage';
import { ChannelPage } from '@/features/channels/ChannelPage';
import { AdminPage } from '@/features/admin/AdminPage';
import { DispatcherPage } from '@/features/dispatcher/DispatcherPage';
import { ChatPage } from '@/features/chat/ChatPage';
import { ProtectedRoute } from '@/shared/ProtectedRoute';
import { wsClient } from '@/lib/ws';
import { Phone, PhoneOff } from 'lucide-react';
import toast from 'react-hot-toast';

export function App() {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<{ callId: string; channelId: string; callerName: string; callerId: string; conversationId: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void wsClient.connect().catch(() => {});

    const onOpenChannel = (data: any) => {
      if (!data?.channelId) return;
      toast(`Dispatcher moved you to ${data.channelName || 'channel'}`);
      navigate(`/channel/${data.channelId}`);
    };

    const onMessageNew = (data: any) => {
      const raw = data.message;
      if (!raw) return;
      const store = useChatStore.getState();
      const msg = { ...raw, type: raw.messageType || raw.type || 'text' };
      store.addMessage(msg.conversationId, msg);
      store.updateLastMessage(msg.conversationId, msg);
      if (store.activeConversationId !== msg.conversationId) {
        store.incrementUnread(msg.conversationId);
      }
      if (raw.senderId !== user?.id) {
        toast(`${msg.sender?.displayName || 'Someone'}: ${(msg.content || '').slice(0, 80)}`, { id: `msg-${msg.id}` });
      }
    };

    const onDirectPttIncoming = (data: any) => {
      setIncomingCall({
        callId: data.callId,
        channelId: data.channelId,
        callerName: data.callerName,
        callerId: data.callerId,
        conversationId: data.conversationId,
      });
      toast(`Incoming PTT call from ${data.callerName}`);
    };

    const onDirectPttCalling = (data: any) => {
      toast('Call connected');
      navigate(`/channel/${data.channelId}`);
    };

    const onDirectPttEnded = (data: any) => {
      toast('Call ended');
      setIncomingCall(null);
      if (location.pathname.startsWith('/channel/')) {
        navigate('/');
      }
    };

    const onOnlineUsers = (data: any) => {
      if (data?.userIds) {
        const store = useChatStore.getState();
        data.userIds.forEach((id: string) => store.setUserOnline(id));
        // Also mark ourselves as online
        if (user?.id) store.setUserOnline(user.id);
      }
    };
    const onUserOnline = (data: any) => {
      if (data?.userId) useChatStore.getState().setUserOnline(data.userId);
    };
    const onUserOffline = (data: any) => {
      if (data?.userId) useChatStore.getState().setUserOffline(data.userId);
    };

    // Mark self as online immediately after connecting
    const markSelfOnline = () => {
      if (user?.id) useChatStore.getState().setUserOnline(user.id);
    };
    wsClient.onLifecycle('connected', markSelfOnline);
    // Mark self online right now if already connected
    if (user?.id) useChatStore.getState().setUserOnline(user.id);

    wsClient.on('dispatcher.open_channel', onOpenChannel);
    wsClient.on('message.new', onMessageNew);
    wsClient.on('direct_ptt.incoming', onDirectPttIncoming);
    wsClient.on('direct_ptt.calling', onDirectPttCalling);
    wsClient.on('direct_ptt.ended', onDirectPttEnded);
    wsClient.on('online_users', onOnlineUsers);
    wsClient.on('user.online', onUserOnline);
    wsClient.on('user.offline', onUserOffline);
    return () => {
      wsClient.off('dispatcher.open_channel', onOpenChannel);
      wsClient.off('message.new', onMessageNew);
      wsClient.off('direct_ptt.incoming', onDirectPttIncoming);
      wsClient.off('direct_ptt.calling', onDirectPttCalling);
      wsClient.off('direct_ptt.ended', onDirectPttEnded);
      wsClient.off('online_users', onOnlineUsers);
      wsClient.off('user.online', onUserOnline);
      wsClient.off('user.offline', onUserOffline);
      wsClient.offLifecycle('connected', markSelfOnline);
    };
  }, [isAuthenticated, navigate]);

  return (
    <>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <RegisterPage />} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/channel/:channelId" element={<ProtectedRoute><ChannelPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/dispatcher" element={<ProtectedRoute requireDispatcher><DispatcherPage /></ProtectedRoute>} />
        <Route path="/admin/*" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-lg bg-slate-800 p-6 text-center shadow-xl">
            <div className="mb-4 text-3xl">
              <Phone className="mx-auto h-10 w-10 text-green-400" />
            </div>
            <div className="mb-1 text-lg font-semibold">Incoming PTT Call</div>
            <div className="mb-4 text-sm text-slate-400">{incomingCall.callerName}</div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigate(`/channel/${incomingCall.channelId}`);
                  setIncomingCall(null);
                }}
                className="flex items-center gap-1 rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-600"
              >
                <Phone className="h-4 w-4" /> Accept
              </button>
              <button
                onClick={() => {
                  wsClient.send({ type: 'direct_ptt.end', callId: incomingCall.callId, channelId: incomingCall.channelId });
                  setIncomingCall(null);
                }}
                className="flex items-center gap-1 rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                <PhoneOff className="h-4 w-4" /> Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
