const fs = require('fs');
let content = fs.readFileSync('android/app/src/main/java/com/visorcrypto/app/ScanForegroundService.java', 'utf8');

// Update DEDUP_MS to 60 * 60 * 1000
content = content.replace(
  /private static final long DEDUP_MS \= \d+ \* 60 \* 1000;/g,
  'private static final long DEDUP_MS = 60 * 60 * 1000;'
);

// Get it in performNativeScan
content = content.replace(
  /SharedPreferences prefsCheck \= getSharedPreferences\(PREFS, MODE_PRIVATE\);\s*if \(\!prefsCheck\.getBoolean\(PREF_SERVICE_ENABLED, false\)\) \{/,
  'SharedPreferences prefsCheck = getSharedPreferences(PREFS, MODE_PRIVATE);\n        final int userMinConf = prefsCheck.getInt("min_confidence", 70);\n        if (!prefsCheck.getBoolean(PREF_SERVICE_ENABLED, false)) {'
);

// And replace in the analyze logic
content = content.replace(
  /if \(result \!\= null \&\& result\.confidence \>\= 75\) \{/g,
  'if (result != null && result.confidence >= userMinConf) {'
);

fs.writeFileSync('android/app/src/main/java/com/visorcrypto/app/ScanForegroundService.java', content, 'utf8');
