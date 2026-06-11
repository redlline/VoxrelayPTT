import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

typedef DeepLinkHandler = void Function(String host, Map<String, String> params);

class DeepLinkManager {
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _sub;

  Future<void> initialize(GlobalKey<NavigatorState> navigatorKey, DeepLinkHandler handler) async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) {
        _handleUri(initial, handler);
      }
    } catch (_) {}

    _sub = _appLinks.uriLinkStream.listen((uri) {
      _handleUri(uri, handler);
    });
  }

  void _handleUri(Uri uri, DeepLinkHandler handler) {
    final params = <String, String>{};
    for (final entry in uri.queryParameters.entries) {
      params[entry.key] = entry.value;
    }
    handler(uri.host, params);
  }

  void dispose() {
    _sub?.cancel();
  }
}
