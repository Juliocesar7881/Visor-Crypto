const fs = require('fs');
let code = fs.readFileSync('www/js/news.js', 'utf8');

// remove loading text
code = code.replace(/<p[^>]*>Carregando notÃcias\.\.\.<\/p>/gi, '');
code = code.replace(/<p[^>]*>Carregando notícias\.\.\.<\/p>/gi, '');
code = code.replace(/<p[^>]*>Buscando notÃcias relevantes\.\.\.<\/p>/gi, '');
code = code.replace(/<p[^>]*>Buscando notícias relevantes\.\.\.<\/p>/gi, '');

code = code.replace(/Tentativa \$\{newsRetryCount\}\/\$\{MAX_NEWS_RETRIES\} - Conectando Ãs fontes/, '');
code = code.replace(/<p [^>]*>Tentativa.*?<\/p>/g, '');

code = code.replace(/if \(typeof newsFetchState !== 'undefined' && newsFetchState === 'fetching'\) \{[\s\S]*?\} else \{[\s\S]*?container\.innerHTML = '.*?Nenhuma not.*?';[\s\S]*?\}/g, `if (typeof newsFetchState !== 'undefined' && newsFetchState === 'fetching' || allNews.length === 0 && window.initialNewsFetchNeeded) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    } else {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma notícia nesta categoria</p>';
    }`);

fs.writeFileSync('www/js/news.js', code);
console.log('patched');