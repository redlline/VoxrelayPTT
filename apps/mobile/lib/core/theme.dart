import 'package:flutter/material.dart';

class AppTheme {
  // Core palette - inspired by AURA military tactical + voiceping-router naval
  static const Color background = Color(0xFF0A0A0F);
  static const Color surface = Color(0xFF12121A);
  static const Color surfaceLight = Color(0xFF1A1A2E);
  static const Color surfaceLighter = Color(0xFF242438);
  static const Color primary = Color(0xFF3B82F6);
  static const Color primaryDark = Color(0xFF2563EB);
  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFEAB308);
  static const Color danger = Color(0xFFEF4444);
  static const Color emergency = Color(0xFFDC2626);
  static const Color info = Color(0xFF06B6D4);

  // Text colors
  static const Color text = Color(0xFFF1F5F9);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color textDim = Color(0xFF64748B);
  static const Color textVeryDim = Color(0xFF475569);
  static const Color textBright = Color(0xFFFFFFFF);

  // Border
  static const Color border = Color(0xFF1E293B);
  static const Color borderLight = Color(0xFF334155);

  // Glass
  static const Color glassBg = Color(0x0DFFFFFF);
  static const Color glassBorder = Color(0x1FFFFFFF);

  // Glow colors
  static Color glowGreen = const Color(0xFF22C55E).withOpacity(0.3);
  static Color glowBlue = const Color(0xFF3B82F6).withOpacity(0.3);
  static Color glowRed = const Color(0xFFEF4444).withOpacity(0.3);
  static Color glowYellow = const Color(0xFFEAB308).withOpacity(0.3);

  static ThemeData get dark {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      colorScheme: const ColorScheme.dark(
        primary: primary,
        secondary: primary,
        surface: surface,
        error: danger,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: text,
        onError: Colors.white,
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: text, letterSpacing: -0.5),
        headlineMedium: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: text, letterSpacing: 0),
        headlineSmall: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: text, letterSpacing: 0.5),
        titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: text),
        titleMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: text, letterSpacing: 0.5),
        titleSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: textMuted, letterSpacing: 1),
        bodyLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w400, color: text),
        bodyMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w400, color: textMuted),
        bodySmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w400, color: textDim),
        labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: text, letterSpacing: 1),
        labelMedium: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: textMuted, letterSpacing: 2),
        labelSmall: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: textDim, letterSpacing: 2),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceLight,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: danger),
        ),
        hintStyle: const TextStyle(color: textDim, fontSize: 14),
        labelStyle: const TextStyle(color: textMuted, fontSize: 13),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 1),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: text,
          side: const BorderSide(color: border),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: 1),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primary,
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        foregroundColor: text,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: text, letterSpacing: 0.5),
        toolbarHeight: 56,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: primary,
        unselectedItemColor: textDim,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      dividerTheme: const DividerThemeData(color: border, thickness: 1, space: 0),
      cardTheme: CardTheme(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: border),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surfaceLight,
        labelStyle: const TextStyle(fontSize: 12, color: text),
        side: const BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceLight,
        contentTextStyle: const TextStyle(color: text, fontSize: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
      tabBarTheme: const TabBarTheme(
        labelColor: primary,
        unselectedLabelColor: textDim,
        indicatorColor: primary,
      ),
    );
  }
}

class AppShadows {
  static List<BoxShadow> card = [
    BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4)),
  ];
  static List<BoxShadow> glow(Color color) {
    return [
      BoxShadow(color: color, blurRadius: 20, spreadRadius: 2),
      BoxShadow(color: color.withOpacity(0.3), blurRadius: 40, spreadRadius: 4),
    ];
  }
}
