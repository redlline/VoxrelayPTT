import '../models/sos.dart';
import '../services/api_service.dart';
import '../error/result.dart';

class SosRepository {
  final ApiService _api;
  SosRepository(this._api);

  Future<Result<List<SosAlert>>> getAlerts(String channelId) => runCatchingAsync(() => _api.getSosAlerts(channelId));
  Future<Result<void>> sendChannelSos(String channelId, {String? message}) =>
      runCatchingAsync(() => _api.sendChannelSos(channelId, message: message));
  Future<Result<void>> resolve(String channelId, String sosId) =>
      runCatchingAsync(() => _api.resolveSos(channelId, sosId));
}
