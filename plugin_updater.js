const fs = require('fs');
let content = fs.readFileSync('android/app/src/main/java/com/visorcrypto/app/BackgroundScanPlugin.java', 'utf8');

content = content.replace(
  /public void start\(PluginCall call\) \{\s*try \{\s*getContext\(\)\.getSharedPreferences\(PREFS, android\.content\.Context\.MODE_PRIVATE\)\s*\.edit\(\)\s*\.putBoolean\(PREF_SERVICE_ENABLED, true\)\s*\.apply\(\);/,
  \public void start(PluginCall call) {
        int minConfidence = 70;
        if (call.hasOption("minConfidence")) {
            minConfidence = call.getInt("minConfidence", 70);
        }
        try {
            getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_SERVICE_ENABLED, true)
                .putInt("min_confidence", minConfidence)
                .apply();\
);

fs.writeFileSync('android/app/src/main/java/com/visorcrypto/app/BackgroundScanPlugin.java', content, 'utf8');
