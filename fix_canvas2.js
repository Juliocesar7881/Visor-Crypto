const fs = require('fs');
let code = fs.readFileSync('www/js/charts.js', 'utf8');

const replacement = \// Ajustar canvas para DPI da tela
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const newWidth = Math.floor(rect.width * dpr);
            const newHeight = Math.floor(rect.height * dpr);
            if (canvas.width !== newWidth || canvas.height !== newHeight) {
                canvas.width = newWidth;
                canvas.height = newHeight;
                ctx.scale(dpr, dpr);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height); // Garante a limpeza caso ja esteja dimensionado
            }\;

const parts = code.split('// Ajustar canvas para DPI da tela');
if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
        // Find the end of ctx.scale(dpr, dpr);
        const endIndex = parts[i].indexOf('ctx.scale(dpr, dpr);');
        if (endIndex !== -1) {
             const remainder = parts[i].substring(endIndex + 20);
             parts[i] = "\n" + replacement.replace('// Ajustar canvas para DPI da tela', '').trim() + remainder;
        }
    }
    code = parts.join('// Ajustar canvas para DPI da tela');
    fs.writeFileSync('www/js/charts.js', code);
    console.log('Fixed via index splitting');
} else { console.log('cant split'); }
