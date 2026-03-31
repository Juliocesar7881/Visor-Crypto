const fs = require('fs');

['www/js/technical.js', 'www/macro-section.js'].forEach(file => {
    let cnt = fs.readFileSync(file + '.bak', 'utf8');
    cnt = cnt.replace(/\x00/g, ''); // strip null bytes

    const fixes = {
        'Ã§': 'ç', 'Ã£': 'ã', 'Ãª': 'ê', 'Ã©': 'é', 'Ã³': 'ó', 'Ã¡': 'á', 
        'Ã\xad': 'í', 'Ã¢': 'â', 'Ãº': 'ú', 'Ã‰': 'É', 'Ã\x81': 'Á', 'Ã“': 'Ó', 
        'Ã\x8a': 'Ê', 'NÃƒO': 'NÃO', 'Ãƒ': 'Ã', 'Ãµ': 'õ', 'NÃƒ': 'NÃ'
    };

    for (const [bad, good] of Object.entries(fixes)) {
        cnt = cnt.split(bad).join(good);
    }

    // specific words
    cnt = cnt.replace(/ANÃLISE/g, 'ANÁLISE');
    cnt = cnt.replace(/ConfianÃ§a:/g, 'Confiança:');
    cnt = cnt.replace(/ConfluÃªncia/g, 'Confluência');
    cnt = cnt.replace(/nÃ£o/g, 'não');

    // emojis
    cnt = cnt.replace(/âš ï¸\x8f/g, '⚠️');
    cnt = cnt.replace(/âš ï¸/g, '⚠️');
    cnt = cnt.replace(/âšª/g, '⚪');
    cnt = cnt.replace(/â€”/g, '—');
    cnt = cnt.replace(/â–¼/g, '▼');
    cnt = cnt.replace(/ðŸ˜´/g, '😴');
    cnt = cnt.replace(/âœ“/g, '✓');
    cnt = cnt.replace(/âš–ï¸\x8f/g, '⚖️');
    cnt = cnt.replace(/âš–ï¸/g, '⚖️');
    cnt = cnt.replace(/ðŸ’Ž/g, '💎');
    cnt = cnt.replace(/ðŸ“‰/g, '📉');
    cnt = cnt.replace(/ðŸ“ˆ/g, '📈');
    cnt = cnt.replace(/ðŸ“Š/g, '📊');
    cnt = cnt.replace(/ðŸŒ¡ï¸/g, '🌡️');

    fs.writeFileSync(file, cnt, 'utf8');
    console.log('Fixed', file);
});
