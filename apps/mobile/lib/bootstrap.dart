import 'package:flutter/material.dart';
import 'core/services/api_service.dart';
import 'core/services/websocket_service.dart';
import 'core/services/mediasoup_service.dart';
import 'core/services/audio_service.dart';
import 'core/services/location_service.dart';
import 'core/repositories/auth_repository.dart';
import 'core/repositories/channel_repository.dart';
import 'core/repositories/chat_repository.dart';
import 'core/repositories/sos_repository.dart';
import 'core/repositories/user_repository.dart';
import 'app.dart';

class AppDependencies {
  final ApiService api;
  final WsService ws;
  final MediasoupService ms;
  final AudioService audioService;
  final LocationService locationService;
  final AuthRepository authRepo;
  final ChannelRepository channelRepo;
  final ChatRepository chatRepo;
  final SosRepository sosRepo;
  final UserRepository userRepo;

  AppDependencies({
    required this.api,
    required this.ws,
    required this.ms,
    required this.audioService,
    required this.locationService,
    required this.authRepo,
    required this.channelRepo,
    required this.chatRepo,
    required this.sosRepo,
    required this.userRepo,
  });
}

Future<AppDependencies> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiService();
  final ws = WsService();
  final ms = MediasoupService(ws, api);
  final audioService = AudioService();
  final locationService = LocationService();
  final deps = AppDependencies(
    api: api,
    ws: ws,
    ms: ms,
    audioService: audioService,
    locationService: locationService,
    authRepo: AuthRepository(api, ws),
    channelRepo: ChannelRepository(api),
    chatRepo: ChatRepository(api),
    sosRepo: SosRepository(api),
    userRepo: UserRepository(api),
  );
  runApp(VoxRelayApp(deps: deps));
  return deps;
}
