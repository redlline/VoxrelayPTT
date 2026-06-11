package com.turkmenportal.voxrelay_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val channelName = "voxrelay/screen_share"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        ScreenShareService.start(this)
                        result.success(null)
                    }
                    "stop" -> {
                        ScreenShareService.stop(this)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
