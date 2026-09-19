# Signal monitoring

Version 1.0.9 uses the Cloudflare Worker snapshot and Firebase Cloud Messaging topics as the primary signal path. Android WorkManager performs a network-constrained recovery check every 15 minutes and after app start, foreground return, reboot, or package replacement.

The monitor does not keep a permanent foreground `dataSync` service alive. This avoids the Android 15 six-hour foreground-service timeout and reduces battery use.

## Android limitation

Android **Force stop** disables FCM delivery and scheduled work for the app. This operating-system restriction remains in effect until the user opens Visor Crypto again. A normal swipe from Recents is not equivalent to Force stop.
