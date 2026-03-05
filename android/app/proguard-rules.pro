# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ═══════════════════════════════════════════════════════
# Capacitor / Cordova WebView App — ProGuard Rules
# ═══════════════════════════════════════════════════════

# Keep Capacitor classes
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-dontwarn com.getcapacitor.**

# Keep Cordova classes
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# Keep WebView JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep our custom plugins
-keep class com.visorcrypto.app.** { *; }

# Keep AdMob
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**

# Keep Firebase/FCM (if used)
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Keep AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep Google Play Services
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Preserve line numbers for crash stacktraces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Don't warn about missing classes from optional dependencies
-dontwarn javax.annotation.**
-dontwarn kotlin.**
-dontwarn kotlinx.**
