import '../models/message.dart';
import '../services/api_service.dart';
import '../error/result.dart';

class ChatRepository {
  final ApiService _api;
  ChatRepository(this._api);

  Future<Result<List<Conversation>>> getConversations() => runCatchingAsync(() => _api.getConversations());
  Future<Result<Conversation>> getConversation(String id) => runCatchingAsync(() => _api.getConversation(id));
  Future<Result<Conversation>> createConversation(List<String> participantIds, {String type = 'direct', String? name}) =>
      runCatchingAsync(() => _api.createConversation(participantIds, type: type, name: name));
  Future<Result<List<Message>>> getMessages(String convId, {int offset = 0, int limit = 50}) =>
      runCatchingAsync(() => _api.getMessages(convId, offset: offset, limit: limit));
  Future<Result<Message>> sendMessage(String convId, String content, {String type = 'text', Map<String, dynamic>? metadata}) =>
      runCatchingAsync(() => _api.sendMessage(convId, content, type: type, metadata: metadata));
  Future<Result<String>> uploadFile(String filePath) => runCatchingAsync(() => _api.uploadFile(filePath));
}
