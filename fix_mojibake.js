// Script to fix UTF-8 mojibake in Visor Crypto source files
// The files were saved with UTF-8 bytes but read as Latin-1 (Windows-1252),
// producing mojibake like "Ã§" instead of "ç", "ðŸ" instead of emoji, etc.

const fs = require('fs');
const path = require('path');

// Common UTF-8→Latin-1 mojibake mappings
const mojibakeMap = {
    // Portuguese accented chars (2-byte UTF-8 sequences read as Latin-1)
    'Ã¡': 'á', 'Ã ': 'à', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä',
    'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
    'Ã­': 'í', 'Ã¬': 'ì', 'Ã®': 'î', 'Ã¯': 'ï',
    'Ã³': 'ó', 'Ã²': 'ò', 'Ã´': 'ô', 'Ãµ': 'õ', 'Ã¶': 'ö',
    'Ãº': 'ú', 'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü',
    'Ã§': 'ç', 'Ã±': 'ñ',
    // Uppercase
    'Ã\x81': 'Á', 'Ã\x80': 'À', 'Ã\x82': 'Â', 'Ã\x83': 'Ã', 'Ã\x84': 'Ä',
    'Ã\x89': 'É', 'Ã\x88': 'È', 'Ã\x8A': 'Ê', 'Ã\x8B': 'Ë',
    'Ã\x8D': 'Í', 'Ã\x8C': 'Ì', 'Ã\x8E': 'Î', 'Ã\x8F': 'Ï',
    'Ã\x93': 'Ó', 'Ã\x92': 'Ò', 'Ã\x94': 'Ô', 'Ã\x95': 'Õ', 'Ã\x96': 'Ö',
    'Ã\x9A': 'Ú', 'Ã\x99': 'Ù', 'Ã\x9B': 'Û', 'Ã\x9C': 'Ü',
    'Ã\x87': 'Ç', 'Ã\x91': 'Ñ',
    // Special chars
    'â€"': '–', 'â€"': '—', 'â€œ': '"', 'â€\x9D': '"',
    'â€˜': ''', 'â€™': ''', 'â€¢': '•', 'â€¦': '…',
    'â†': '→', 'â†\x90': '←', 'â†\x91': '↑', 'â†\x93': '↓',
    // Box drawing
    'â•': '═', 'â"€': '─', 'â"': '━', 'â––': '▖',
    'â–¼': '▼', 'â–²': '▲', 'â–ˆ': '█',
    // Emojis (4-byte UTF-8)
    'ðŸ"‹': '📋', 'ðŸ¤–': '🤖', 'ðŸ"': '🔍', 'ðŸ˜´': '😴',
    'ðŸ"Š': '📊', 'ðŸ"ˆ': '📈', 'ðŸ"‰': '📉',
    'ðŸ"¥': '🔥', 'ðŸ'°': '💰', 'ðŸ'¹': '💹',
    'ðŸ"¢': '🔢', 'ðŸ"': '🔑', 'ðŸš€': '🚀',
    'ðŸŽ¯': '🎯', 'ðŸ"®': '🔮', 'ðŸ'ª': '💪',
    'ðŸ›¡': '🛡', 'ðŸ"': '📍', 'ðŸ\x92ª': '💪',
    'ðŸ§ ': '🧠', 'ðŸ"°': '📰',
    // Warning/check symbols
    'âš ': '⚠', 'âš¡': '⚡', 'âœ…': '✅', 'âœ"': '✔', 'âŒ': '❌',
    'â„¹': 'ℹ', 'â ': '⬆', 'â¬\x87': '⬇',
    // Currency/misc
    'â‚¿': '₿',
};

function fixMojibakeGeneric(text) {
    // Instead of mapping individual strings, try the systematic approach:
    // Re-interpret the string as Latin-1 bytes and decode as UTF-8
    try {
        // Convert string to Latin-1 byte buffer
        const bytes = Buffer.from(text, 'latin1');
        // Try decoding as UTF-8
        const decoded = bytes.toString('utf8');
        // Verify it decoded properly (no replacement characters)
        if (!decoded.includes('\uFFFD')) {
            return decoded;
        }
    } catch(e) {}
    return text;
}

function processFile(filePath) {
    console.log(`Processing: ${filePath}`);
    
    // Read as binary (Latin-1) to get raw bytes
    const rawBytes = fs.readFileSync(filePath);
    let content = rawBytes.toString('latin1');
    
    // Try to re-decode the entire content as UTF-8
    const utf8Content = rawBytes.toString('utf8');
    
    // Check if the file has mojibake by looking for common patterns
    const hasMojibake = content.includes('Ã§') || content.includes('Ã©') || content.includes('Ã£') ||
                        content.includes('ðŸ') || content.includes('â€') || content.includes('â•');
    
    if (!hasMojibake) {
        console.log(`  No mojibake detected, skipping.`);
        return false;
    }
    
    // The file was likely saved correctly as UTF-8 but the view tool shows mojibake.
    // Let's check: read as UTF-8 and see if it makes sense
    const utf8Check = rawBytes.toString('utf8');
    const hasValidUtf8 = utf8Check.includes('ç') || utf8Check.includes('é') || utf8Check.includes('ã') ||
                         utf8Check.includes('📋') || utf8Check.includes('═');
    
    if (hasValidUtf8) {
        console.log(`  File is already valid UTF-8, no fix needed.`);
        return false;
    }
    
    console.log(`  Mojibake detected! Fixing...`);
    
    // Count changes
    let changeCount = 0;
    
    // Apply mappings
    for (const [wrong, right] of Object.entries(mojibakeMap)) {
        const count = (content.match(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (count > 0) {
            content = content.split(wrong).join(right);
            changeCount += count;
            console.log(`  Fixed: "${wrong}" → "${right}" (${count} occurrences)`);
        }
    }
    
    if (changeCount > 0) {
        // Write back as UTF-8
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  ✅ Fixed ${changeCount} mojibake occurrences in ${path.basename(filePath)}`);
        return true;
    } else {
        console.log(`  No mappings matched despite mojibake patterns.`);
        return false;
    }
}

// Process the affected files
const baseDir = path.join(__dirname, 'www');
const files = [
    path.join(baseDir, 'js', 'technical.js'),
    path.join(baseDir, 'ta-engine-v4.js'),
    path.join(baseDir, 'ta-engine-v3.js'),
    path.join(baseDir, 'js', 'signals.js'),
];

let totalFixed = 0;
for (const f of files) {
    if (fs.existsSync(f)) {
        if (processFile(f)) totalFixed++;
    } else {
        console.log(`File not found: ${f}`);
    }
}

console.log(`\nDone. Fixed ${totalFixed} files.`);
