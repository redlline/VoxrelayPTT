import '../models/channel.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../error/result.dart';

class ChannelRepository {
  final ApiService _api;
  ChannelRepository(this._api);

  Future<Result<List<Channel>>> getChannels() => runCatchingAsync(() => _api.getChannels());
  Future<Result<Channel>> getChannel(String id) => runCatchingAsync(() => _api.getChannel(id));
  Future<Result<List<User>>> getMembers(String id) => runCatchingAsync(() => _api.getChannelMembers(id));
  Future<Result<void>> join(String id) => runCatchingAsync(() => _api.joinChannel(id));
  Future<Result<void>> leave(String id) => runCatchingAsync(() => _api.leaveChannel(id));
  Future<Result<bool>> isRecording(String id) => runCatchingAsync(() => _api.isChannelRecording(id));
  Future<Result<void>> startRecording(String id) => runCatchingAsync(() => _api.startChannelRecording(id));
  Future<Result<void>> stopRecording(String id) => runCatchingAsync(() => _api.stopChannelRecording(id));
  Future<Result<List<Map<String, dynamic>>>> getRecordings(String id) => runCatchingAsync(() => _api.getRecordings(id));
  Future<Result<void>> uploadClientSegment(String id, String base64, int durationMs) =>
      runCatchingAsync(() => _api.uploadClientSegment(id, base64, durationMs));
}
