const fs = require('fs');
let code = fs.readFileSync('www/js/charts.js', 'utf8');

const regex = /const dpr = window\.devicePixelRatio \|\| 1;([\s\S]{1,100})canvas\.width = rect\.width \* dpr;([\s\S]{1,100})ctx\.scale\(dpr, dpr\);/g;

let match;
while ((match = regex.exec(code)) !== null) {
    console.log("MATCH:");
    console.log(match[0]);
}

