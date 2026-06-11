class WsEventType {
  static const String ping = 'ping';
  static const String pong = 'pong';

  static const String onlineUsers = 'online_users';
  static const String getOnlineUsers = 'get_online_users';
  static const String userOnline = 'user.online';
  static const String userOffline = 'user.offline';

  static const String updateProfile = 'update-profile';

  static const String channelJoin = 'channel.join';
  static const String channelLeave = 'channel.leave';
  static const String channelUserJoined = 'channel.user_joined';
  static const String channelUserLeft = 'channel.user_left';
  static const String channelUserMuted = 'channel.user_muted';
  static const String channelUserUnmuted = 'channel.user_unmuted';

  static const String pttRequest = 'ptt.request';
  static const String pttRelease = 'ptt.release';
  static const String pttGranted = 'ptt.granted';
  static const String pttDenied = 'ptt.denied';
  static const String pttQueued = 'ptt.queued';
  static const String pttReleased = 'ptt.released';
  static const String pttForceRelease = 'ptt.force_release';

  static const String speakerChanged = 'speaker-changed';
  static const String speakingStarted = 'speaking.started';
  static const String speakingStopped = 'speaking.stopped';

  static const String transportCreate = 'transport.create';
  static const String transportCreated = 'transport.created';
  static const String transportConnect = 'transport.connect';
  static const String transportConnected = 'transport.connected';
  static const String produce = 'produce';
  static const String produced = 'produced';
  static const String consume = 'consume';
  static const String consumed = 'consumed';
  static const String newConsumer = 'new-consumer';
  static const String consumerClosed = 'consumer.closed';
  static const String consumerResume = 'consumer.resume';
  static const String producersList = 'producers.list';
  static const String producers = 'producers';

  static const String messageNew = 'message.new';
  static const String userTyping = 'user:typing';
  static const String typing = 'typing';
  static const String messageRead = 'message.read';
  static const String chatSend = 'chat.send';
  static const String chatRead = 'chat:read';
  static const String chatMessage = 'chat:message';

  static const String locationUpdate = 'location.update';
  static const String locationUpdated = 'location.updated';

  static const String sosAlert = 'sos.alert';
  static const String sosAlertColon = 'sos:alert';
  static const String sosResolved = 'sos.resolved';
  static const String sosResolve = 'sos:resolve';

  static const String directPttCall = 'direct_ptt.call';
  static const String directPttCalling = 'direct_ptt.calling';
  static const String directPttIncoming = 'direct_ptt.incoming';
  static const String directPttAccepted = 'direct_ptt.accept';
  static const String directPttRejected = 'direct_ptt.reject';
  static const String directPttEnded = 'direct_ptt.ended';
  static const String directPttEnd = 'direct_ptt.end';
  static const String callIncoming = 'call:incoming';
  static const String callEnd = 'call:end';

  static const String dispatcherOpenChannel = 'dispatcher.open_channel';
  static const String conversationAdded = 'conversation.added';
  static const String conversationRemoved = 'conversation.removed';

  static const String error = 'error';
}
