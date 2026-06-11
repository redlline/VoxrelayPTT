import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'bootstrap.dart';
import 'core/theme.dart';
import 'core/services/api_service.dart';
import 'core/services/websocket_service.dart';
import 'core/services/mediasoup_service.dart';
import 'core/services/audio_service.dart';
import 'core/services/location_service.dart';
import 'core/services/deep_link_manager.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/channel_provider.dart';
import 'core/providers/chat_provider.dart';
import 'core/providers/ptt_provider.dart';
import 'core/providers/sos_provider.dart';
import 'core/providers/media_controls_provider.dart';
import 'core/providers/video_source_provider.dart';
import 'core/models/message.dart';
import 'features/login/login_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/channels/screens/channels_screen.dart';
import 'features/chat/screens/chat_list_screen.dart';
import 'features/chat/screens/chat_messages_screen.dart';
import 'features/ptt/screens/ptt_screen.dart';
import 'features/map/map_screen.dart';
import 'features/sos/sos_screen.dart';
import 'features/dispatcher/screens/dispatcher_screen.dart';
import 'features/admin/screens/admin_screen.dart';
import 'features/recordings/screens/recordings_screen.dart';
import 'features/calls/incoming_call.dart';
import 'shared/splash.dart';

class VoxRelayApp extends StatefulWidget {
  final AppDependencies deps;
  const VoxRelayApp({super.key, required this.deps});

  @override
  State<VoxRelayApp> createState() => _VoxRelayAppState();
}

class _VoxRelayAppState extends State<VoxRelayApp> {
  AuthProvider? _authProvider;
  bool _initialized = false;
  IncomingCallData? _incomingCall;
  StreamSubscription<WsEvent>? _wsEventSub;
  final _navigatorKey = GlobalKey<NavigatorState>();
  late final DeepLinkManager _deepLinks = DeepLinkManager();

  AppDependencies get deps => widget.deps;

  @override
  void initState() {
    super.initState();
    _authProvider = AuthProvider(deps.api, deps.ws, deps.authRepo);
    _authProvider!.addListener(_onAuthChanged);
    _authProvider!.checkAuth().then((_) {
      if (mounted) {
        setState(() => _initialized = true);
        _deepLinks.initialize(_navigatorKey, _onDeepLink);
      }
    });
  }

  void _onDeepLink(String host, Map<String, String> params) {
    if (!mounted) return;
    if (host == 'join') {
      final channelId = params['channelId'];
      if (channelId != null && channelId.isNotEmpty) {
        _navigatorKey.currentState?.pushNamed('/ptt', arguments: channelId);
      }
    }
  }

  void _onAuthChanged() {
    if (!mounted) return;
    try {
      final pp = context.read<PttProvider>();
      pp.setSelfUserId(_authProvider?.user?.id);
    } catch (_) {}
  }

  @override
  void dispose() {
    _authProvider?.removeListener(_onAuthChanged);
    _wsEventSub?.cancel();
    _deepLinks.dispose();
    super.dispose();
  }

  void _listenForCalls(WsService ws) {
    _wsEventSub?.cancel();
    _wsEventSub = ws.events.listen((event) {
      if (event.type == 'call:incoming' || event.type == 'direct_ptt.incoming') {
        setState(() {
          _incomingCall = IncomingCallData(
            callId: event.data['callId'] as String? ?? '',
            channelId: event.data['channelId'] as String? ?? '',
            callerName: event.data['callerName'] as String? ?? 'Unknown',
            callerId: event.data['callerId'] as String? ?? '',
            conversationId: event.data['conversationId'] as String?,
          );
        });
      } else if (event.type == 'direct_ptt.ended' || event.type == 'call:end') {
        setState(() => _incomingCall = null);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: deps.api),
        Provider<WsService>.value(value: deps.ws),
        Provider<MediasoupService>.value(value: deps.ms),
        Provider<AudioService>.value(value: deps.audioService),
        Provider<LocationService>.value(value: deps.locationService),
        ChangeNotifierProvider<AuthProvider>.value(value: _authProvider!),
        ChangeNotifierProvider<ChannelProvider>(create: (_) {
          final cp = ChannelProvider(deps.api, deps.ws, deps.channelRepo);
          cp.init();
          return cp;
        }),
        ChangeNotifierProvider<ChatProvider>(create: (_) {
          final cp = ChatProvider(deps.api, deps.ws, deps.chatRepo);
          cp.init();
          return cp;
        }),
        ChangeNotifierProvider<MediaControlsProvider>(create: (_) {
          return MediaControlsProvider(deps.ms);
        }),
        ChangeNotifierProvider<VideoSourceProvider>(create: (_) {
          return VideoSourceProvider(deps.ms);
        }),
        ChangeNotifierProvider<PttProvider>(create: (_) {
          final pp = PttProvider(deps.ws, deps.ms);
          pp.init();
          WidgetsBinding.instance.addPostFrameCallback((_) {
            try {
              final media = context.read<MediaControlsProvider>();
              final video = context.read<VideoSourceProvider>();
              pp.setMedia(media);
              pp.setVideo(video);
            } catch (_) {}
          });
          return pp;
        }),
        ChangeNotifierProvider<SosProvider>(create: (_) {
          final sp = SosProvider(deps.api, deps.ws, deps.locationService, deps.sosRepo);
          sp.init();
          return sp;
        }),
        ProxyProvider2<ChannelProvider, SosProvider, void>(
          update: (_, cp, sp, __) {
            sp.bindChannelProvider(cp);
          },
        ),
      ],
      child: IncomingCallHandler(
        incomingCall: _incomingCall,
        ws: deps.ws,
        onDismiss: () => setState(() => _incomingCall = null),
        child: MaterialApp(
          navigatorKey: _navigatorKey,
          title: 'VoxRelay',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.dark,
          home: !_initialized
              ? const SplashScreen()
              : Consumer<AuthProvider>(
                  builder: (context, auth, _) {
                    if (auth.isAuthenticated) {
                      _listenForCalls(deps.ws);
                      return const DashboardScreen();
                    }
                    return const LoginScreen();
                  },
                ),
          onGenerateRoute: _onGenerateRoute,
        ),
      ),
    );
  }

  Route<dynamic>? _onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case '/login':
        return MaterialPageRoute(builder: (_) => const LoginScreen());
      case '/dashboard':
        return MaterialPageRoute(builder: (_) => const DashboardScreen());
      case '/channels':
        return MaterialPageRoute(builder: (_) => const ChannelsScreen());
      case '/chat':
        return MaterialPageRoute(builder: (_) => const ChatListScreen());
      case '/ptt':
        final channelId = settings.arguments as String?;
        return MaterialPageRoute(builder: (_) => PttScreen(channelId: channelId));
      case '/map':
        return MaterialPageRoute(builder: (_) => const MapScreen());
      case '/sos':
        return MaterialPageRoute(builder: (_) => const SosScreen());
      case '/dispatcher':
        return MaterialPageRoute(builder: (_) => const DispatcherScreen());
      case '/admin':
        return MaterialPageRoute(builder: (_) => const AdminScreen());
      case '/recordings':
        return MaterialPageRoute(builder: (_) => const RecordingsScreen());
      case '/chat/messages':
        final args = settings.arguments;
        String? convId;
        String? convName;
        if (args is Map<String, dynamic>) {
          convId = args['id'] as String?;
          convName = args['name'] as String?;
        } else if (args is Conversation) {
          convId = args.id;
          convName = args.name;
        }
        return MaterialPageRoute(
          builder: (_) => ChatMessagesScreen(
            conversationId: convId ?? '',
            conversationName: convName ?? 'Chat',
          ),
        );
      default:
        return MaterialPageRoute(builder: (_) => const DashboardScreen());
    }
  }
}
