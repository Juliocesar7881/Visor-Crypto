const fs = require('fs');
let code = fs.readFileSync('www/js/charts.js', 'utf8');

const regex = /const dpr = window\.devicePixelRatio \|\| 1;\s*const rect = canvas\.getBoundingClientRect\(\);\s*canvas\.width = rect\.width \* dpr;\s*canvas\.height = rect\.height \* dpr;\s*ctx\.scale\(dpr, dpr\);/g;

const replacement = \const dpr = window.devicePixelRatio || 1;
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

code = code.replace(regex, replacement);

fs.writeFileSync('www/js/charts.js', code);
console.log('Fixed multiple matches via regex');
