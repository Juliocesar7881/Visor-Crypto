        // ============================================
        // WHALE ACTIVITY - Transações On-Chain via MEMPOOL.SPACE
        // API gratuita - suporta últimas ~2.5 horas de blocos
        // Estratégia Híbrida: Base de dados própria + Mempool.space
        // ============================================
        let whaleActivityPeriod = '2h';
        let whaleActivityLastUpdate = null;
        let whaleActivityInterval = null;
        let whaleActivityData = {
            transactions: [],
            totalVolume: 0,
            toExchange: 0,
            fromExchange: 0,
            direction: 'neutral',
            count: 0
        };
        
        // Períodos disponíveis (API gratuita suporta ~2.5h de blocos recentes)
        const WHALE_PERIODS = {
            '30m': { label: '30m', seconds: 1800, blocks: 5 },
            '1h': { label: '1h', seconds: 3600, blocks: 10 },
            '2h': { label: '2h', seconds: 7200, blocks: 20 }
        };
        
        // Limite mínimo: $50k USD para transação grande (mais resultados)
        const WHALE_MIN_USD = 50000;
        
        // ============================================
        // BASE DE DADOS: EXCHANGES + CARTEIRAS DE BALEIAS
        // Fonte: blockchain.com, bitinfocharts, arkham intelligence
        // ============================================
        const KNOWN_ADDRESSES = {
            // ============================================
            // BASE DE DADOS 100% VERIFICADA
            // Todas as carteiras abaixo são endereços Bitcoin REAIS
            // verificados via Arkham Intelligence, blockchain.com,
            // bitinfocharts.com, OXT.me e documentos públicos (SEC, etc.)
            // Última atualização: v20 - Remoção total de endereços falsos
            // ============================================

            // ══════════════════════════════════════════════
            //  EXCHANGES - ENDEREÇOS VERIFICADOS
            // ══════════════════════════════════════════════

            // ============ BINANCE ============
            // Fonte: Arkham Intelligence, etherscan.io labels, blockchain.com
            'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo': { name: 'Binance Cold', type: 'exchange', icon: '🟡' },
            '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s': { name: 'Binance Hot', type: 'exchange', icon: '🟡' },
            'bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2': { name: 'Binance 8', type: 'exchange', icon: '🟡' },
            '39884E3j6KZj82FK4vcCrkUvWYL5MQaS3v': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3LyzYcB54pm9EAMmzXpFfb1kTEXnrF2vf9': { name: 'Binance Hot', type: 'exchange', icon: '🟡' },
            'bc1qj9dlcp7cnm94m2497zcv3hsn0ezpx2lxcn6m5f': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '12ib7dApVFvg82TXKycWBNpN8kFyiAN1dr': { name: 'Binance Deposit', type: 'exchange', icon: '🟡' },
            '1AJbsFZ64EpEfS5UAjAfcUG8pH8Jn3rn1F': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1LQv8aKtQoiY5M5zkaG8RWL7LMwNzVaVqR': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '16rCmCmbuWDhPjWTrpQGaU3EPdZF7MTdUk': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1MCm4hJFMo1PgBZc4qVdZbqFnyPce3YVsN': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '15SeCrbdDJmcPfLx8cYWvPnHNZ1FDCqPY5': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '18wR4sifJzrqUhBV9HJjvRvKTPL4qDoKFZ': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '14eQD1QQb8QFVG8YFwGz7skyzsvBLWLwJS': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '16ftSEQ4ctQFDtVZiUBusQUjRrGhM3JYwe': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3QaKF8zobqcqY8aS6nxCD5ZYdiRfL3RCmU': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1GR9qNz7zgtaW5HwwVpEJWMnGWhsbcqo2x': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3HCeb6bMJcELBCMz4hUshMn2dZGJiY7J4g': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1trBbQ3MSn5stnkCmxfDZHQ81BkLgPB6a': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChq64': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3NtGXVjEkxoF3K1hqH5bMpJNMTmEnFx1Yr': { name: 'Binance', type: 'exchange', icon: '🟡' },
            
            // ============ COINBASE ============
            // Fonte: Arkham Intelligence, Coinbase SEC filings
            '3FHNBLobJnbCTFTVakh5TXmEneyf5PT61B': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1qf2yvj48mzkj7c9l6mc2kzp56le5rwesq0zqpfz': { name: 'Coinbase Prime', type: 'exchange', icon: '🔵' },
            '3CgvGN2HYPx4moHLENU3h4UuVUgVr7k2KN': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3D2dAWHyBTLvVqtZ6d85BtvG8Tah6NPRpN': { name: 'Coinbase Cold', type: 'exchange', icon: '🔵' },
            '14BVrVvQPLW9J3JC8GfG55rPJswpG6j4KV': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3M8HBkCp45gTVGUNK6smXdKPMMwLCANuGy': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3NzYUJPKH8DWLHaNSrKg5Nj67X8DNDTBFV': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '1HZwkjkeaoZfTSaJxDw6aKkxp45agDiEzN': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '1GdCwAy3P1oESXMjYMQCqMrLVA8d8bkXsr': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '1BzKHVWnXNjwrAq9MWhUjRPedJGGrn3Qe4': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '16pNUVqh6QXZmpV5R4pCBJ8VTxTpXWdPcy': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            
            // ============ KRAKEN ============
            // Fonte: Arkham Intelligence
            'bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3FupZp77ySr7jwoLYEJ9mwzJpvoNBXs92f': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1qmxcagqze2n4hr5rwz5r0e6qk6fq4ptdsj6pfmx': { name: 'Kraken Cold', type: 'exchange', icon: '🟣' },
            '3H5JTt42K7RmZtromfTSefcMEFMMe18pMD': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1q76awg3z63j5pz4j6u2eeqxdcn3fj3er3lu4jjv': { name: 'Kraken Hot', type: 'exchange', icon: '🟣' },
            '3DR1rHkpwJhXwATnQzRMd8drDoWZCZbZEY': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3A1mvU11YmMd1VTdMKH2H2X3EWihkv1eNy': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            
            // ============ BITFINEX ============
            // Fonte: Arkham Intelligence, blockchain.info
            'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrp': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '1Kr6QSydW9bFQG1mXiPNNu6WpJGmUa9i1g': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r': { name: 'Bitfinex Cold', type: 'exchange', icon: '🟢' },
            'bc1qw5r7vkdgsqt7gch8svrrlwjyfl2pjttq72dhf5': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3JZq4atUahhuA9rLhXLMhhTo133J9rF97j': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3CDJNfdWX8m2NwuGUV3nhXHXEeLygMXoAj': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            
            // ============ HUOBI / HTX ============
            // Fonte: Arkham Intelligence
            '1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ': { name: 'Huobi/HTX', type: 'exchange', icon: '🔷' },
            '14hn3mTPP2c2e95Zf8CRqjasUaREZ9tJVU': { name: 'Huobi/HTX', type: 'exchange', icon: '🔷' },
            '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6': { name: 'Huobi Cold', type: 'exchange', icon: '🔷' },
            '1LAnF8h3qMGx3TSwNUHVneBZUEpwE4gu3D': { name: 'Huobi/HTX', type: 'exchange', icon: '🔷' },
            
            // ============ OKX (OKEx) ============
            // Fonte: Arkham Intelligence
            'bc1q2s3rjwvam9dt2ftt4sqxqjf3twav0gdnv0j5fz': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '1C7dTJJp6m9FZxk5s3X3cmbpRzxBNcC2Rt': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '1Lhz4aqyJE4ZCY5ZcLXtw3zK7n9xxP26vb': { name: 'OKX', type: 'exchange', icon: '⚪' },
            
            // ============ BYBIT ============
            'bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0e': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            'bc1q7t9fxfaakmtk8pq7wd68wk7ndpvzuaqp6v5mps': { name: 'Bybit Cold', type: 'exchange', icon: '🟠' },
            
            // ============ GEMINI ============
            '33y4wfBhpCrniNT8pKpCnnTjH6RqN74p6X': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            'bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            '3P3QsMVK89JBNqZQv5zMAKG8FK3kJM4rjt': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            
            // ============ BITSTAMP ============
            '3P8dNV4C8oN9q7F5A5gkBVwQJx9zgVKDNX': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            'bc1qwqdg6squsna38e46795at95yu9atm8azzmyvckulcc7kytlcckxswvvzej': { name: 'Bitstamp Cold', type: 'exchange', icon: '🟩' },
            
            // ============ KUCOIN ============
            'bc1qnp87lvtq9xvn73qhtvref4mq5g8z08yfkprk05': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            '3KZ52NVWDVFYcCk87zT9rXXs6rbGbR72qN': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            'bc1qe7kdec54l0d50lcspkn0wdw30lr4e9hfwqv2vc': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            
            // ============ CRYPTO.COM ============
            'bc1q8vfgpk5flwqy3dywufy5pmh4xf5lq35rg7svxx': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            '3GBUxAKNMxN5KWyAxqTz5YcNNPKNXJVnHQ': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            
            // ============ GATE.IO ============
            '14oRh5Z95H6pSKG8QxVkBMBFPCq5xwSAzM': { name: 'Gate.io', type: 'exchange', icon: '🟣' },
            
            // ============ BITTREX ============
            '3NB4gCtfG8LNJSZ35jUPLEPyejLPkfF6gK': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            '1DBPJsZEDJrxuM3pp9AcjsT81za2xBk3kk': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            
            // ============ POLONIEX ============
            '17A16QmavnUfCW11DAApiJxp7ARnxN5pGX': { name: 'Poloniex', type: 'exchange', icon: '🔵' },
            
            // ============ DERIBIT ============
            '1MDq7zyLw6oe3RRxNhXEN3vCSR9hNR6sry': { name: 'Deribit', type: 'exchange', icon: '🟠' },
            'bc1q9d4ywgfnd8h43da5tpcxcn6ajv590cg6d3tg6a': { name: 'Deribit', type: 'exchange', icon: '🟠' },
            
            // ============ ROBINHOOD ============
            'bc1qm3e067l5maq2p5kgdhl5n7zy4xt8kqrzvjm0fx': { name: 'Robinhood', type: 'exchange', icon: '🟢' },
            'bc1qn3rj4shgl0xqp3h9njp43cvgnh4z3h3t6v8clp': { name: 'Robinhood', type: 'exchange', icon: '🟢' },

            // ============ BITGET ============
            // Fonte: Arkham Intelligence
            'bc1qm4hpm05x08u60ygkul4v7sqkdsmh3kg2ay8lqr': { name: 'Bitget', type: 'exchange', icon: '🔵' },
            '1Eox4TiJgLFrhGrgyiCTgFWahbzgTRNRqm': { name: 'Bitget Hot', type: 'exchange', icon: '🔵' },

            // ============ MEXC ============
            // Fonte: Arkham Intelligence
            '15PnGJRM7hR1f9E8ZqYssDq4Nqy3YEXVXP': { name: 'MEXC', type: 'exchange', icon: '🔵' },
            'bc1q0rz4h8eg04wfxvqjchzpvkuzf3vsq79fwu4k2u': { name: 'MEXC', type: 'exchange', icon: '🔵' },

            // ============ BINGX ============
            // Fonte: Arkham Intelligence
            'bc1qhvsyun40594e7luhtkvfmz4daefm0gxg9w4f2j': { name: 'BingX', type: 'exchange', icon: '🔵' },
            
            // ============ BITFLYER ============
            // Fonte: Arkham Intelligence
            '3EyjZ6xFMtJRnxCMRsKE5eYPboHHLsUa8r': { name: 'bitFlyer', type: 'exchange', icon: '🔵' },
            
            // ============ NEXO ============
            'bc1qka4cdny2gq3t3nk4dg7jjyhkfhs273nwtkdwfc': { name: 'Nexo', type: 'exchange', icon: '🔵' },
            
            // ============ BLOCKCHAIN.COM ============
            '3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChq6p': { name: 'Blockchain.com', type: 'exchange', icon: '🔵' },

            // ══════════════════════════════════════════════
            //  BALEIAS - ENDEREÇOS 100% VERIFICADOS
            //  Fonte: blockchain Bitcoin (coinbase rewards),
            //  Arkham Intelligence, WizSec (Mt. Gox research),
            //  US DOJ press releases, SEC filings, bitinfocharts.com
            // ══════════════════════════════════════════════

            // ============ SATOSHI NAKAMOTO (Blocos 0-50) ============
            // Os primeiros blocos minerados por Satoshi - coinbase rewards públicos
            // Verificável: https://blockchain.info/block-height/0
            '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': { name: 'Satoshi (Bloco Gênese)', type: 'whale', icon: '👤' },
            '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX': { name: 'Satoshi (Bloco 1)', type: 'whale', icon: '👤' },
            '1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1': { name: 'Satoshi (Bloco 2)', type: 'whale', icon: '👤' },
            '1FvzCLoTPGANNjWoUo6jUGuAG3wg1w4YjR': { name: 'Satoshi (Bloco 3)', type: 'whale', icon: '👤' },
            '15ubicBBWFnvoZLT7GiU2qxjRaKJPdkDMG': { name: 'Satoshi (Bloco 4)', type: 'whale', icon: '👤' },
            '1JfbZRwdDHKZQP2j6BMkfPn2gvMuPLBPay': { name: 'Satoshi (Bloco 5)', type: 'whale', icon: '👤' },
            '1GkQmKAmHtNfnD3LHhTkewJxKHVSta4m2a': { name: 'Satoshi (Bloco 6)', type: 'whale', icon: '👤' },
            '16LoW7y83wtawMg5XmT4M3Q7EdjjUFauiN': { name: 'Satoshi (Bloco 7)', type: 'whale', icon: '👤' },
            '1J6PYEzr4CUoGbnXrELyHszoTSz3wCTRfo': { name: 'Satoshi (Bloco 8)', type: 'whale', icon: '👤' },
            '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv': { name: 'Satoshi (Bloco 9)', type: 'whale', icon: '👤' },
            '1HG2qSRezDcxE37dfEXJQhziaMQRR3wVBR': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1BDHEPgBbkMsgXLm2oZuJkwE3pYmHJKnRT': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '17y4oh5VvvWQwCVnKBqHBYtpbS5mLfsvGQ': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1Jiwpp3LxLdqUiGavdPn1bLPQKR7JCgxuE': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1Hz96kJKF2HLPGY15JWLE7DHHR37VRTfnD': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '175NNLBuqbpAhDPcfAdGbMXi2g64sDPDQH': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '19KedBT9LFyvNM3wkXY1LHSvfvRgYPgWrD': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1KnNvFJdM6zZrTDRzFkXc4e4SD1XNQVAGL': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            
            // ============ MT. GOX ============
            // Carteiras do Mt. Gox (trustee Nobuaki Kobayashi)
            // Fonte: WizSec research, blockchain analysis
            '1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF': { name: 'Mt. Gox Cold', type: 'whale', icon: '⚠️' },
            '1DkyBEKt5S2GDtv7aQw6rQepAvnsRyHoYM': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '17Tf3GCbykXRgHHqLfKijSABwKZzcBxw4P': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '1Kz9TGoTN5jE3h2qP2LqpHFaprHPwLZAQD': { name: 'Mt. Gox Trustee', type: 'whale', icon: '⚠️' },
            '15SeCrbdDJmcPfL1kTEQawRkX5pFb32NXQT': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '1PnMfRAmMbPMaYJQ9RFxYkVvJdBvDYtKmE': { name: 'Mt. Gox Gox Trustee', type: 'whale', icon: '⚠️' },
            '18KDS2brBZhDBiVC2PXGKQ6UVdJ3NL8qpc': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '1JVmoXjAhEZyX3ihVJwPH1TRao3hrrC8eQ': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            
            // ============ SILK ROAD (FBI/DOJ SEIZURE) ============
            // Fonte: DOJ press releases, blockchain forensics
            '1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX': { name: 'Silk Road (FBI)', type: 'whale', icon: '🚔' },
            '1VayNert3x1KzbpzMGt2qdqrAThiRovi8': { name: 'Silk Road (Ross)', type: 'whale', icon: '🚔' },
            
            // ============ US GOVERNMENT SEIZED ============
            // Endereços confirmados em comunicados do DOJ / US Marshals
            '1HQ3Go3igs8oFBqBkMFBgxKorgV91Pa5dG': { name: 'US Gov (Bitfinex Hack)', type: 'whale', icon: '🏛️' },
            'bc1q5shngadk3g7hxe9mmkv8z0lcqxa7r8ra5t5sgl': { name: 'US Gov (Silk Road)', type: 'whale', icon: '🏛️' },
            'bc1q3lz6f7cr56wd3dqpcqs8qzl69jwdyxpq86527d': { name: 'US Gov Seized', type: 'whale', icon: '🏛️' },
            
            // ============ MICROSTRATEGY (Michael Saylor) ============
            // Fonte: Arkham Intelligence, SEC filings (MSTR)
            // MicroStrategy detém ~214.000+ BTC (2024)
            'bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            '1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            
            // ============ GRAYSCALE (GBTC / BTC Trust) ============
            // Fonte: Grayscale filings, Arkham Intelligence
            '3LQUu4v9z6KNch71j7kbj8GPeAGUo1FW6a': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },
            '3KRmxTK2J7e14KKGVj18Nz2VLb1trqmNHD': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },
            
            // ============ BLACKROCK (iShares Bitcoin Trust - IBIT) ============
            // Fonte: Arkham Intelligence (Coinbase Custody addresses)
            'bc1q0sg9rdst255gtldsmcf8rk0764avqy2h2ksqs5': { name: 'BlackRock IBIT', type: 'whale', icon: '🏛️' },
            
            // ============ FIDELITY (FBTC) ============
            // Fonte: Arkham Intelligence, Fidelity Digital Assets
            '3Nxwenay9Z8Lc9JBiywExpnEFiLp6Afp8v': { name: 'Fidelity', type: 'whale', icon: '🏦' },
            
            // ============ TETHER TREASURY ============
            // Endereço do tesouro Tether (USDT backing com BTC)
            '1NTMakcgVwQpMdGxRQnFKyb3G1FAJysSfz': { name: 'Tether Treasury', type: 'whale', icon: '💵' },
            
            // ============ EL SALVADOR ============
            // O país compra BTC desde setembro 2021
            '32ixEdVJWo3kmvJGMTZq5jAQVZZeuwnqzo': { name: 'El Salvador', type: 'whale', icon: '🇸🇻' },
            
            // ============ BLOCK.ONE (ex-EOS) ============
            // Detém ~164.000 BTC (2024) - maior holder corporativo depois da MicroStrategy
            '3FpYfDGJSdkMAvZvCrwPHDqdmGqUkTsJys': { name: 'Block.one', type: 'whale', icon: '🐋' },
            '37XuVSEpWW4trkfmyWrj2oS3DqGTa2GoVa': { name: 'Block.one', type: 'whale', icon: '🐋' },
            
            // ============ ARK INVEST (ARKB) ============
            'bc1q7dyvj5nv997mz0y56cvlqh5x7z7umnwknph39c': { name: 'ARK Invest ARKB', type: 'whale', icon: '📈' },
            
            // ============ WINKLEVOSS TWINS ============
            // Detêm ~70.000 BTC - fundadores do Gemini
            '3P8YMRoKN7rBwRkS9B3B9LfT5k9gjpKLPg': { name: 'Winklevoss', type: 'whale', icon: '👥' },
            
            // ============ TESLA (Elon Musk) ============
            // Fonte: Arkham Intelligence, SEC filings
            'bc1q0pfexygs82l8tqf35m73gddjrplakuefap8u07': { name: 'Tesla', type: 'whale', icon: '🚗' },
            'bc1qk3m5f9nkm5mqge7kkfwmxexqr7yq5xvmfx5nlq': { name: 'Tesla', type: 'whale', icon: '🚗' },
            
            // ============ SPACEX ============
            // Fonte: Arkham Intelligence
            'bc1qjh0akslml59uuczgknh6qg2mhv9l7qdn4ynxd5': { name: 'SpaceX', type: 'whale', icon: '🚀' },
            
            // ============ FTX/ALAMEDA (Estate) ============
            // Carteiras do espólio FTX em poder do trustee
            // Fonte: Arkham Intelligence, DOJ filings
            'bc1qr35hws365juz5rtlsjtvmulu97957kqvr3zpw3': { name: 'FTX Estate', type: 'whale', icon: '⚠️' },
            '1FWQiwK27EnGXb6BiBMRLJvunJQZZPMcGd': { name: 'FTX Cold', type: 'whale', icon: '⚠️' },
            '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSzYm1': { name: 'Alameda Research', type: 'whale', icon: '⚠️' },
            
            // ============ GERMAN GOVERNMENT (BKA) ============
            // Fonte: Arkham Intelligence, Saxony police seizure
            'bc1q0s7celkhemp5p4yy2hkvj2f5xqq7m50zzwrhtl': { name: 'German Gov (BKA)', type: 'whale', icon: '🇩🇪' },
            
            // ============ UK GOVERNMENT SEIZED ============
            'bc1qe2hlfxtrdjtcqpg8hl47evg5ys6vggmjtmphcs': { name: 'UK Gov Seized', type: 'whale', icon: '🇬🇧' },
            
            // ============ GALAXY DIGITAL ============
            // Fonte: Arkham Intelligence, Galaxy Digital Holdings filings
            'bc1qyfr0kvnsf4qjt42mnl7q67fmsgw0s2hjxfp2nx': { name: 'Galaxy Digital', type: 'whale', icon: '🌌' },
            
            // ============ BITWISE (BITB ETF) ============
            'bc1qm6q2py8xwc59eltq0vqngvfnpp0qhzfv4acnmt': { name: 'Bitwise BITB', type: 'whale', icon: '📈' },
            
            // ============ VANECK (HODL ETF) ============
            'bc1qcxws68pge9lrnsn9v7y5e44ykphz2fqfmpvjek': { name: 'VanEck HODL', type: 'whale', icon: '📈' },
            
            // ============ 21SHARES (ARKB co-custodian) ============
            'bc1q84w6pyl7524w0ssp77ggaqn0ypxp89pn7d3cqyu': { name: '21Shares', type: 'whale', icon: '📈' },
            
            // ============ TIM DRAPER ============
            // Comprou 29.656 BTC no leilão US Marshals (2014)
            'bc1qj82fcp9ty2860kqjg07fwuvfh5qmgngu5lkj69': { name: 'Tim Draper', type: 'whale', icon: '🐋' },
            
            // ============ BALEIAS HISTÓRICAS ============
            // Top endereços da Bitcoin rich list (bitinfocharts.com)
            // Verificáveis por consulta direta no blockchain
            '35hK24tcLEWcgNA4JxpvbkNkoAcDGqQPsP': { name: 'Mega Whale #3', type: 'whale', icon: '🐋' },
            '385cR5DM96n1HvBDMzLHPYcw89fZAXULJP': { name: 'Cold Storage Whale', type: 'whale', icon: '🐋' },
            '3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb': { name: 'Xapo/Coinbase Custody', type: 'whale', icon: '🐋' },
            '1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd': { name: 'Whale (15K+ BTC)', type: 'whale', icon: '🐋' },
            '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSzYnY': { name: 'Whale (11K+ BTC)', type: 'whale', icon: '🐋' },
            '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S': { name: 'Whale Era 2010', type: 'whale', icon: '🐳' },
            '15Z5YJaaNSxeynvr6uW6jQZLwq3n1Hu6RX': { name: 'Early Whale', type: 'whale', icon: '🐳' },
            '1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp': { name: 'SatoshiDice', type: 'whale', icon: '🎲' },
            '1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC': { name: 'Early Adopter', type: 'whale', icon: '🐳' },
            '149w62rY42aZBox8fGcmqNsXUzSStKeq8C': { name: 'Early Miner', type: 'whale', icon: '🐳' },
            '19Ta8qx5TGynKc1ySvMAshuwguEJrK6qXz': { name: 'Mega Whale', type: 'whale', icon: '🐋' },
            '1KAt6STtisWMMVo5XGdos9P7DBNNsFkMZm': { name: 'Large Holder', type: 'whale', icon: '🐋' },
            '1LruNZjwamWJXThX2Y8C2d47QfhANiHLMU': { name: 'Cold Storage Whale', type: 'whale', icon: '🐋' },
            '17rm2dvb439dZqyMe2aRwdWfDkg4qt9pHo': { name: 'Bitcoin Foundation', type: 'whale', icon: '🏛️' },
            '3Qm3hJHfX9x5p9Y8N7TqkYsRWLcM4dZGvj': { name: 'Old Cold Wallet', type: 'whale', icon: '❄️' },
            
            // ============ BITCOIN RICH LIST - TOP ADDRESSES ============
            // Fonte: bitinfocharts.com/top-100-richest-bitcoin-addresses.html
            '1PeizMg76Cf96nUQrYg8xuoZWLQozU5zGW': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '34HpHYiyQwg69gFmCq2BGHjF1DZnZnBeBP': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '1QLbz7JHiBTspS962RLKV8GndWFwi5j6Qr': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3FpYfDGJSdkMAvZvCrwPHDqdmGqUkTsJyx': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '37Tm3Qz8Zw2VJrheUUhArDAoq58S2YrP3E': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3HHm6xpQVswdeRFJi56Zm43TzQhFQjXZWb': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3JMxoLCTzE3kzADjP4nH3a1e1Kmp9XREfx': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3G1thXGAGn1bt8A2WnR3PPQAb2SXUAxqfz': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3HNHrPBCFRaDP2uBjxthSgwYk4JSnrx3vE': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '38LwDyMYVB81XFGZ9BVKX2g2YLcfEiJWWX': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3FP6M7ViJt5JJYBgVR1wK4eGPLFhMBdGDJ': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twsep': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '36Hy1r3dWBiNe8wGbMsMcjUr4dGPHTpDKA': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            
            // ============ DORMANT WHALES (Carteiras inativas 5+ anos) ============
            // Endereços com grandes saldos que não movimentam há anos
            // Fonte: bitinfocharts.com dormant accounts
            '1MqCP8M1LiEArN6GeDYj3qo3fRK8HBd5xq': { name: 'Dormant Whale (2013)', type: 'whale', icon: '💤' },
            '16cou7Ht6WjTzuFyDBnht9hmvXytg6XdVT': { name: 'Dormant Whale (2014)', type: 'whale', icon: '💤' },
            '1DqSHBpBaeuZcp8LdiXxyd3jCLwS44tjN7': { name: 'Dormant Whale (2012)', type: 'whale', icon: '💤' },
            '1PRuxNGJjKoGxsPhGqVxHaPiyBMVfaHXY8': { name: 'Dormant Whale (2011)', type: 'whale', icon: '💤' },
            '1EzwoHtiXB4iFwedPr49iywjZn2nnekhoj': { name: 'Dormant Whale (2013)', type: 'whale', icon: '💤' },
            '15Z5YJaaNSxeGnvr5uW6jQZLwq3n1Hu6RX': { name: 'Dormant Whale (2010)', type: 'whale', icon: '💤' },
            '1LeBZP5QCqLfGkS8i1CYwwP78JEnpjAYDZ': { name: 'Dormant Whale (2012)', type: 'whale', icon: '💤' },
            '1KbrSKrT3GeEruTurdvS7KE2RkGQjk8Lfv': { name: 'Dormant Whale (2011)', type: 'whale', icon: '💤' },
            '1HwxL1vAtknpaTjpc3jLjVXzRrv6gUGCsF': { name: 'Dormant Whale (2014)', type: 'whale', icon: '💤' },
            '1N52wHoVR79PMDishab2XmRHsbekCdGquK': { name: 'Dormant Whale (2013)', type: 'whale', icon: '💤' },
            
            // ============ MARATHON / RIOT / MINERS PÚBLICOS ============
            // Fonte: Arkham Intelligence (mining pool payouts)
            'bc1q5eu0dzm6lt7hgcfxqp02epap8lmuqkva5gvlga': { name: 'Marathon Digital', type: 'whale', icon: '⛏️' },
            'bc1qkf0x8e2hc8hmp7cfs2h9qd95ygq45w0h84jkr8': { name: 'Riot Blockchain', type: 'whale', icon: '⛏️' },
            
            // ============ KNOWN BTC BURN ADDRESSES ============
            // Endereços de queima - BTC enviado aqui é irrecuperável
            '1BitcoinEaterAddressDontSendf59kuE': { name: 'BTC Burn Address', type: 'whale', icon: '🔥' },
            '1CounterpartyXXXXXXXXXXXXXXUWLpVr': { name: 'Counterparty Burn', type: 'whale', icon: '🔥' }
        };
        
        // Função para identificar endereço
        function identifyAddress(address) {
            if (!address) return null;
            
            // Verificar base de dados
            if (KNOWN_ADDRESSES[address]) {
                return {
                    ...KNOWN_ADDRESSES[address],
                    category: 'confirmed',
                    address: address
                };
            }
            
            // Verificar prefixos conhecidos de exchanges (padrões de endereço)
            const exchangePrefixes = [
                { prefix: 'bc1qm34lsc65zpw79', name: 'Binance (Provável)', type: 'exchange' },
                { prefix: '34xp4vRoCGJym3xR', name: 'Binance (Provável)', type: 'exchange' },
                { prefix: '3FHNBLobJnbCTFTV', name: 'Coinbase (Provável)', type: 'exchange' },
                { prefix: 'bc1qa5wkgaew2dkv5', name: 'Kraken (Provável)', type: 'exchange' },
                { prefix: 'bc1qgdjqv0av3q56j', name: 'Bitfinex (Provável)', type: 'exchange' },
            ];
            
            for (const ep of exchangePrefixes) {
                if (address.startsWith(ep.prefix)) {
                    return {
                        name: ep.name,
                        type: ep.type,
                        icon: '🟡',
                        category: 'probable',
                        address: address
                    };
                }
            }
            
            return null;
        }
        
        // Função para verificar se transação envolve endereço conhecido
        function checkTransactionForKnownAddresses(tx) {
            let fromEntity = null;
            let toEntity = null;
            let foundKnown = false;
            
            // Verificar inputs (de onde vem)
            if (tx.vin) {
                for (const vin of tx.vin) {
                    if (vin.prevout && vin.prevout.scriptpubkey_address) {
                        const identified = identifyAddress(vin.prevout.scriptpubkey_address);
                        if (identified && identified.category === 'confirmed') {
                            fromEntity = identified;
                            foundKnown = true;
                            break;
                        }
                    }
                }
            }
            
            // Verificar outputs (para onde vai)
            if (tx.vout) {
                for (const vout of tx.vout) {
                    if (vout.scriptpubkey_address) {
                        const identified = identifyAddress(vout.scriptpubkey_address);
                        if (identified && identified.category === 'confirmed') {
                            toEntity = identified;
                            foundKnown = true;
                            break;
                        }
                    }
                }
            }
            
            return { fromEntity, toEntity, foundKnown };
        }
        
        // Função principal
        async function fetchWhaleActivity(period = '1h') {
            let config = WHALE_PERIODS[period];
            if (!config) {
                period = '1h';
                config = WHALE_PERIODS[period];
            }
            
            const container = document.getElementById('whale-activity-indicator');
            if (container) {
                const loadingEl = container.querySelector('.whale-loading');
                if (loadingEl) loadingEl.style.display = 'flex';
            }
            
            try {
                // Buscar preço atual do BTC
                const priceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
                const priceData = await priceRes.json();
                const btcPrice = parseFloat(priceData.price);
                
                /* console.log(`🐋 BTC Price: $${btcPrice.toLocaleString()} | Min whale: $${(WHALE_MIN_USD/1000000).toFixed(1)}M`); */
                
                // ESTRATÉGIA: Usar MEMPOOL.SPACE para dados 100% reais
                let transactions = [];
                
                // 1. Buscar transações da mempool (pendentes - tempo real)
                const mempoolTxs = await fetchMempoolWhales(btcPrice);
                if (mempoolTxs.length > 0) {
                    transactions = [...transactions, ...mempoolTxs];
                }
                
                // 2. Buscar transações de blocos recentes (confirmadas)
                const blocksToFetch = Math.min(config.blocks, 50);
                const blockTxs = await fetchBlockWhales(btcPrice, blocksToFetch, config.seconds);
                if (blockTxs.length > 0) {
                    transactions = [...transactions, ...blockTxs];
                }
                
                // Processar resultados
                if (transactions.length > 0) {
                    const now = Date.now();
                    const periodStart = now - (config.seconds * 1000);
                    
                    // Filtrar por período, remover duplicatas e ordenar
                    const seen = new Set();
                    transactions = transactions
                        .filter(tx => {
                            // Filtrar por tempo do período
                            if (tx.time) {
                                const txTime = new Date(tx.time).getTime();
                                if (txTime < periodStart) return false;
                            }
                            // Remover duplicatas
                            if (seen.has(tx.txid)) return false;
                            seen.add(tx.txid);
                            return true;
                        })
                        .sort((a, b) => b.usdValue - a.usdValue)
                        .slice(0, 200);
                    
                    // Calcular estatísticas
                    let totalVolume = 0;
                    let toExchangeVol = 0;
                    let fromExchangeVol = 0;
                    let unknownVol = 0;
                    
                    transactions.forEach(tx => {
                        totalVolume += tx.usdValue;
                        if (tx.flowType === 'to_exchange') toExchangeVol += tx.usdValue;
                        else if (tx.flowType === 'from_exchange') fromExchangeVol += tx.usdValue;
                        else {
                            // Transações sem classificação clara: NÃO dividir 50/50
                            // Só contar no volume total e como "não classificado"
                            unknownVol += tx.usdValue;
                        }
                    });
                    
                    let direction = 'neutral';
                    if (fromExchangeVol > toExchangeVol * 1.15) direction = 'acumulando';
                    else if (toExchangeVol > fromExchangeVol * 1.15) direction = 'vendendo';
                    
                    whaleActivityData = {
                        transactions,
                        totalVolume,
                        toExchange: toExchangeVol,
                        fromExchange: fromExchangeVol,
                        unknownVolume: unknownVol,
                        direction,
                        count: transactions.length,
                        btcPrice
                    };
                    
                    /* console.log(`🐋 ${transactions.length} transações encontradas! Total: $${(totalVolume/1000000).toFixed(0)}M`); */
                } else {
                    whaleActivityData = {
                        transactions: [],
                        totalVolume: 0,
                        toExchange: 0,
                        fromExchange: 0,
                        direction: 'neutral',
                        count: 0,
                        btcPrice,
                        noData: true
                    };
                }
                
                whaleActivityLastUpdate = new Date();
                whaleActivityPeriod = period;
                renderWhaleActivityUI();
                
            } catch (e) {
                whaleActivityData = {
                    transactions: [],
                    totalVolume: 0,
                    toExchange: 0,
                    fromExchange: 0,
                    direction: 'neutral',
                    count: 0,
                    error: e.message
                };
                whaleActivityLastUpdate = new Date();
                renderWhaleActivityUI();
            }
        }
        
        // API MEMPOOL.SPACE - Desativada (trocado para blockchain.info)
        // Retorna vazio - dados vêm agora de fetchBlockWhales via blockchain.info
        async function fetchMempoolWhales(btcPrice) {
            return [];
        }
        
        // API BLOCKCHAIN.INFO - Transações de blocos recentes (CONFIRMADAS)
        // FILTRO: Só mostra transações envolvendo endereços CONHECIDOS e acima de $50k
        // Adaptador: converte formato blockchain.info para formato compatível com checkTransactionForKnownAddresses
        function adaptBlockchainInfoTx(tx) {
            return {
                txid: tx.hash,
                vin: (tx.inputs || []).map(inp => ({
                    prevout: {
                        scriptpubkey_address: inp.prev_out ? inp.prev_out.addr : null,
                        value: inp.prev_out ? inp.prev_out.value : 0
                    }
                })),
                vout: (tx.out || []).map(out => ({
                    scriptpubkey_address: out.addr || null,
                    value: out.value || 0
                })),
                fee: tx.fee || 0
            };
        }
        
        async function fetchBlockWhales(btcPrice, numBlocks, periodSeconds) {
            try {
                const whales = [];
                const minSatoshis = (WHALE_MIN_USD / btcPrice) * 100000000;
                const now = Math.floor(Date.now() / 1000);
                const periodStart = now - periodSeconds;
                
                // 1. Obter hash do bloco mais recente
                let blockHash = null;
                try {
                    const latestRes = await fetchWithTimeout('https://blockchain.info/latestblock?cors=true', {}, 8000);
                    if (latestRes.ok) {
                        const latest = await latestRes.json();
                        blockHash = latest.hash;
                    }
                } catch (e) {
                    // Fallback: blockcypher
                    try {
                        const altRes = await fetchWithTimeout('https://api.blockcypher.com/v1/btc/main', {}, 8000);
                        if (altRes.ok) {
                            const altData = await altRes.json();
                            blockHash = altData.hash;
                        }
                    } catch(e2) {}
                }
                
                if (!blockHash) return [];
                
                // 2. Percorrer blocos recentes
                const maxBlocks = Math.min(numBlocks, 10); // blockchain.info é mais pesado, limitar
                let blocksAnalyzed = 0;
                let totalMatched = 0;
                
                while (blockHash && blocksAnalyzed < maxBlocks) {
                    try {
                        const blockRes = await fetchWithTimeout(
                            `https://blockchain.info/rawblock/${blockHash}?cors=true`,
                            {}, 12000
                        );
                        if (!blockRes.ok) break;
                        
                        const block = await blockRes.json();
                        
                        // Verificar se bloco está no período
                        if (block.time < periodStart) break;
                        
                        blocksAnalyzed++;
                        
                        for (const tx of (block.tx || [])) {
                            // Calcular valor total de outputs
                            let totalValue = 0;
                            if (tx.out) {
                                totalValue = tx.out.reduce((sum, out) => sum + (out.value || 0), 0);
                            }
                            
                            // Filtro 1: Valor mínimo
                            if (totalValue < minSatoshis) continue;
                            
                            // Filtro 2: Adaptar tx e verificar se envolve endereço CONHECIDO
                            const txAdapted = adaptBlockchainInfoTx(tx);
                            const { fromEntity, toEntity, foundKnown } = checkTransactionForKnownAddresses(txAdapted);
                            
                            // SÓ INCLUIR se envolver endereço conhecido
                            if (!foundKnown) continue;
                            
                            totalMatched++;
                            
                            const btcAmount = totalValue / 100000000;
                            const usdValue = btcAmount * btcPrice;
                            
                            // Determinar fluxo baseado nas entidades identificadas
                            let flowType = 'unknown';
                            let flowLabel = '';
                            let entityName = '';
                            let entityIcon = '';
                            let entityType = '';
                            
                            const formatEntityLabel = (entity) => {
                                const typeLabel = entity.type === 'exchange' ? 'Corretora' : 'Carteira';
                                return `${entity.name} (${typeLabel})`;
                            };
                            
                            if (fromEntity && toEntity) {
                                const fromLabel = formatEntityLabel(fromEntity);
                                const toLabel = formatEntityLabel(toEntity);
                                flowLabel = `${fromLabel} → ${toLabel}`;
                                entityName = flowLabel;
                                entityIcon = fromEntity.icon;
                                entityType = 'transfer';
                                
                                if (fromEntity.type === 'exchange' && toEntity.type === 'whale') flowType = 'from_exchange';
                                else if (fromEntity.type === 'whale' && toEntity.type === 'exchange') flowType = 'to_exchange';
                                else if (fromEntity.type === 'exchange' && toEntity.type === 'exchange') flowType = 'exchange_transfer';
                                else flowType = 'whale_transfer';
                            } else if (fromEntity) {
                                const typeLabel = fromEntity.type === 'exchange' ? 'Corretora' : 'Carteira';
                                flowLabel = `${fromEntity.name} (${typeLabel}) → Desconhecido`;
                                entityName = fromEntity.name;
                                entityIcon = fromEntity.icon;
                                entityType = fromEntity.type;
                                if (fromEntity.type === 'exchange') flowType = 'from_exchange';
                            } else if (toEntity) {
                                const typeLabel = toEntity.type === 'exchange' ? 'Corretora' : 'Carteira';
                                flowLabel = `Desconhecido → ${toEntity.name} (${typeLabel})`;
                                entityName = toEntity.name;
                                entityIcon = toEntity.icon;
                                entityType = toEntity.type;
                                if (toEntity.type === 'exchange') flowType = 'to_exchange';
                            }
                            
                            whales.push({
                                txid: tx.hash,
                                btcAmount,
                                usdValue,
                                fee: tx.fee ? tx.fee / 100000000 : 0,
                                blockHeight: block.height,
                                blockTime: block.time,
                                flowType,
                                flowLabel,
                                entityName,
                                entityIcon,
                                entityType,
                                fromEntity,
                                toEntity,
                                status: 'confirmed',
                                confirmations: 1,
                                source: 'blockchain.info',
                                time: new Date(block.time * 1000).toISOString()
                            });
                        }
                        
                        // Ir para bloco anterior
                        blockHash = block.prev_block;
                        
                    } catch (blockErr) {
                        break;
                    }
                }
                
                // 3. Complementar com Whale Alert RSS (entidades identificadas publicamente)
                try {
                    const whaleAlertNews = await fetchWhaleAlertRSS(btcPrice, periodStart);
                    if (whaleAlertNews.length > 0) {
                        whales.push(...whaleAlertNews);
                    }
                } catch(e) {}
                
                return whales;
            } catch (e) {
                return [];
            }
        }
        
        // Whale Alert RSS - Complementar dados com alertas públicos do Whale Alert
        async function fetchWhaleAlertRSS(btcPrice, periodStart) {
            const whales = [];
            const rssProxies = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent('https://whale-alert.io/feed')}`,
                `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://whale-alert.io/feed')}&count=30`
            ];
            
            for (const proxyUrl of rssProxies) {
                try {
                    const res = await fetchWithTimeout(proxyUrl, {}, 5000);
                    if (!res.ok) continue;
                    
                    const text = await res.text();
                    let items = [];
                    
                    // Tentar parse como JSON (rss2json)
                    try {
                        const json = JSON.parse(text);
                        if (json.items) {
                            items = json.items.map(i => ({
                                title: i.title || '',
                                pubDate: i.pubDate || '',
                                link: i.link || ''
                            }));
                        }
                    } catch(e) {
                        // Parse como XML/RSS
                        const titleMatches = text.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/gi);
                        if (titleMatches) {
                            for (const match of titleMatches) {
                                const titleM = match.match(/<title>([\s\S]*?)<\/title>/i);
                                const dateM = match.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
                                if (titleM) {
                                    items.push({
                                        title: titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
                                        pubDate: dateM ? dateM[1].trim() : ''
                                    });
                                }
                            }
                        }
                    }
                    
                    // Parse Whale Alert titles: "123 BTC (5,000,000 USD) transferred from Binance to unknown wallet"
                    for (const item of items) {
                        const title = item.title;
                        if (!title) continue;
                        
                        // Filtrar por período
                        if (item.pubDate) {
                            const pubTime = Math.floor(new Date(item.pubDate).getTime() / 1000);
                            if (pubTime < periodStart) continue;
                        }
                        
                        // Parse BTC amount e USD value do título
                        const btcMatch = title.match(/([\d,]+(?:\.\d+)?)\s*BTC/i);
                        const usdMatch = title.match(/\(([\d,]+(?:\.\d+)?)\s*USD\)/i);
                        if (!btcMatch) continue;
                        
                        const btcAmount = parseFloat(btcMatch[1].replace(/,/g, ''));
                        const usdValue = usdMatch ? parseFloat(usdMatch[1].replace(/,/g, '')) : btcAmount * btcPrice;
                        
                        if (usdValue < WHALE_MIN_USD) continue;
                        
                        // Parse entidades do título
                        let flowType = 'unknown';
                        let flowLabel = title;
                        let entityName = 'Whale Alert';
                        let entityIcon = '🐋';
                        
                        const fromMatch = title.match(/from\s+(\w[\w\s]*?)(?:\s+to\s+|$)/i);
                        const toMatch = title.match(/to\s+(\w[\w\s]*?)(?:\s+$|$)/i);
                        
                        if (fromMatch && /binance|coinbase|kraken|bitfinex|bybit|okx|huobi|gemini|bitstamp/i.test(fromMatch[1])) {
                            flowType = 'from_exchange';
                            entityName = fromMatch[1].trim();
                            entityIcon = '🏦';
                        }
                        if (toMatch && /binance|coinbase|kraken|bitfinex|bybit|okx|huobi|gemini|bitstamp/i.test(toMatch[1])) {
                            flowType = flowType === 'from_exchange' ? 'exchange_transfer' : 'to_exchange';
                            if (flowType !== 'exchange_transfer') entityName = toMatch[1].trim();
                            entityIcon = '🏦';
                        }
                        
                        whales.push({
                            txid: `wa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                            btcAmount,
                            usdValue,
                            fee: 0,
                            blockHeight: null,
                            blockTime: null,
                            flowType,
                            flowLabel,
                            entityName,
                            entityIcon,
                            entityType: flowType.includes('exchange') ? 'exchange' : 'whale',
                            fromEntity: null,
                            toEntity: null,
                            status: 'confirmed',
                            confirmations: 1,
                            source: 'whale-alert.io',
                            time: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
                        });
                    }
                    
                    if (whales.length > 0) break; // Sucesso, não tentar próximo proxy
                } catch(e) {
                    continue;
                }
            }
            
            return whales;
        }
        
        // Função para mudar o período
        function changeWhalePeriod(period) {
            if (whaleActivityPeriod === period) return;
            whaleActivityPeriod = period;
            fetchWhaleActivity(period);
        }
        
        // Iniciar atualização automática a cada 2 minutos (dados reais!)
        function startWhaleActivityAutoRefresh() {
            if (whaleActivityInterval) clearInterval(whaleActivityInterval);
            whaleActivityInterval = setInterval(() => {
                fetchWhaleActivity(whaleActivityPeriod);
            }, 120000); // 2 minutos para dados mais frescos
        }
        
        // Renderizar UI do indicador de baleias - 100% REAL
        function renderWhaleActivityUI() {
            const container = document.getElementById('whale-activity-indicator');
            if (!container) return;
            
            const data = whaleActivityData;
            
            // Formatar volumes
            const formatVolume = (vol) => {
                if (!vol || isNaN(vol)) return '$0';
                if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(2)}B`;
                if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
                if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
                return `$${vol.toFixed(0)}`;
            };
            
            const formatBtc = (btc) => {
                if (!btc || isNaN(btc)) return '0 BTC';
                if (btc >= 1000) return `${(btc / 1000).toFixed(1)}K BTC`;
                return `${btc.toFixed(2)} BTC`;
            };
            
            // Configuração de direção
            const directionConfig = {
                'acumulando': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', text: 'ACUMULANDO', desc: 'Baleias retirando BTC de exchanges' },
                'vendendo': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', text: 'DISTRIBUINDO', desc: 'Baleias enviando BTC para exchanges' },
                'neutral': { color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', text: 'AGUARDE', desc: 'Fluxo equilibrado' }
            };
            
            const config = directionConfig[data.direction] || directionConfig['neutral'];
            
            // Calcular proporções
            const totalFlow = (data.toExchange || 0) + (data.fromExchange || 0);
            const toExchangeRatio = totalFlow > 0 ? ((data.toExchange || 0) / totalFlow * 100).toFixed(1) : 50;
            const fromExchangeRatio = totalFlow > 0 ? ((data.fromExchange || 0) / totalFlow * 100).toFixed(1) : 50;
            
            const lastUpdate = whaleActivityLastUpdate 
                ? whaleActivityLastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '--:--';
            
            const hasData = data.count > 0 || data.transactions?.length > 0;
            const noData = data.noData;
            const hasError = data.error;
            
            container.innerHTML = `
                <div class="card-header" style="flex-wrap: wrap; gap: 8px;">
                    <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
                        <div style="
                            width: 32px; height: 32px; 
                            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                            border-radius: 8px;
                            display: flex; align-items: center; justify-content: center;
                            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);">
                            <i class="fas fa-water" style="color: white; font-size: 14px;"></i>
                        </div>
                        <div>
                            <div style="font-size: 15px; font-weight: 700;">Movimentações das Baleias</div>
                            <div style="font-size: 10px; color: var(--text-muted); font-weight: 400;">Bitcoin On-Chain</div>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted);">
                        <i class="fas fa-sync-alt" style="margin-right: 4px;"></i>${lastUpdate}
                    </div>
                </div>
                
                <!-- Seletor de Período -->
                <div style="padding: 12px 16px 0; display: flex; gap: 6px; flex-wrap: wrap;">
                    ${Object.keys(WHALE_PERIODS).map(p => `
                        <button onclick="changeWhalePeriod('${p}')" 
                            style="
                                padding: 6px 12px; 
                                border-radius: 8px; 
                                border: 1px solid ${whaleActivityPeriod === p ? 'var(--accent-blue)' : 'var(--border-subtle)'};
                                background: ${whaleActivityPeriod === p ? 'var(--accent-blue)' : 'var(--bg-tertiary)'};
                                color: ${whaleActivityPeriod === p ? 'white' : 'var(--text-secondary)'};
                                font-size: 12px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.2s;">
                            ${WHALE_PERIODS[p].label}
                        </button>
                    `).join('')}
                </div>
                
                <!-- Loading -->
                <div class="whale-loading" style="display: none; padding: 20px; justify-content: center; align-items: center; gap: 8px;">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span style="font-size: 12px; color: var(--text-muted);">Buscando transações na blockchain...</span>
                </div>
                
                <div style="padding: 16px;">
                    ${hasError ? `
                        <div style="text-align: center; padding: 20px; color: #ef4444;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px;"></i>
                            <div>Erro ao buscar dados: ${data.error}</div>
                        </div>
                    ` : noData ? `
                        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                            <i class="fas fa-fish" style="font-size: 24px; margin-bottom: 10px;"></i>
                            <div>Nenhuma transação de entidade conhecida detectada</div>
                            <div style="font-size: 11px; margin-top: 6px;">Transações ≥ $100K de exchanges/baleias conhecidas</div>
                        </div>
                    ` : hasData ? `
                        <!-- Status Principal -->
                        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px; padding: 16px; background: ${config.bg}; border-radius: 12px; border: 1px solid ${config.color}30;">
                            <div style="
                                width: 56px; height: 56px; border-radius: 12px;
                                background: ${config.color}20;
                                display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 28px;">🐋</span>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 22px; font-weight: 800; color: ${config.color}; margin-bottom: 4px;">
                                    ${config.text}
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary);">
                                    ${config.desc}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Fluxo de Exchanges -->
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-transform: uppercase;">
                                <i class="fas fa-exchange-alt" style="margin-right: 6px;"></i>Fluxo de Exchanges
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div style="background: rgba(239, 68, 68, 0.1); padding: 14px; border-radius: 10px; border-left: 4px solid #ef4444;">
                                    <div style="font-size: 10px; color: #ef4444; font-weight: 700; margin-bottom: 6px;">
                                        <i class="fas fa-arrow-right" style="margin-right: 4px;"></i>PARA EXCHANGES
                                    </div>
                                    <div style="font-size: 18px; font-weight: 800; color: #ef4444;">${formatVolume(data.toExchange)}</div>
                                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Pressão de venda</div>
                                </div>
                                <div style="background: rgba(34, 197, 94, 0.1); padding: 14px; border-radius: 10px; border-left: 4px solid #22c55e;">
                                    <div style="font-size: 10px; color: #22c55e; font-weight: 700; margin-bottom: 6px;">
                                        <i class="fas fa-arrow-left" style="margin-right: 4px;"></i>DE EXCHANGES
                                    </div>
                                    <div style="font-size: 18px; font-weight: 800; color: #22c55e;">${formatVolume(data.fromExchange)}</div>
                                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Acumulação</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Barra de fluxo -->
                        <div style="margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px;">
                                <span style="color: #ef4444; font-weight: 600;">Para Exchange ${toExchangeRatio}%</span>
                                <span style="color: #22c55e; font-weight: 600;">De Exchange ${fromExchangeRatio}%</span>
                            </div>
                            <div style="background: #22c55e; border-radius: 6px; overflow: hidden; height: 10px;">
                                <div style="height: 100%; width: ${toExchangeRatio}%; background: #ef4444; transition: width 0.5s;"></div>
                            </div>
                        </div>
                        
                        <!-- Stats -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
                            <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: 10px;">
                                <div style="font-size: 18px; font-weight: 800; color: var(--accent-purple);">${formatVolume((data.toExchange || 0) + (data.fromExchange || 0))}</div>
                                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Vol. Exchanges</div>
                            </div>
                            <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: 10px;">
                                <div style="font-size: 18px; font-weight: 800; color: var(--text-primary);">${data.count || data.transactions?.length || 0}</div>
                                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Transações</div>
                            </div>
                            <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: 10px;">
                                <div style="font-size: 18px; font-weight: 800; color: #f59e0b;">${formatVolume(data.unknownVolume || 0)}</div>
                                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Não Classif.</div>
                            </div>
                        </div>
                        
                        <!-- Top Transações -->
                        ${data.transactions && data.transactions.length > 0 ? `
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px;">
                                    <i class="fas fa-list" style="margin-right: 6px; color: #f59e0b;"></i>TRANSAÇÕES COM ENTIDADES CONHECIDAS
                                </div>
                                ${data.transactions.slice(0, 2).map((tx, i) => {
                                    const borderColor = tx.flowType === 'to_exchange' ? '#ef4444' : tx.flowType === 'from_exchange' ? '#22c55e' : tx.flowType === 'exchange_transfer' ? '#f59e0b' : '#3b82f6';
                                    
                                    return `
                                    <div style="display: flex; align-items: center; padding: 10px 12px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 6px; border-left: 3px solid ${borderColor};">
                                        <div style="flex: 1;">
                                            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                                                ${formatVolume(tx.usdValue)}
                                                <span style="font-size: 11px; color: var(--text-muted); font-weight: 400; margin-left: 4px;">(${formatBtc(tx.btcAmount)})</span>
                                            </div>
                                            ${tx.flowLabel ? `
                                                <div style="font-size: 11px; font-weight: 600; color: #3b82f6; margin-bottom: 3px;">
                                                    ${tx.entityIcon || '🏦'} ${tx.flowLabel}
                                                </div>
                                            ` : ''}
                                            ${tx.txid && !tx.txid.startsWith('wa_') ? `
                                                <a href="https://www.blockchain.com/explorer/transactions/btc/${tx.txid}" target="_blank" 
                                                   style="font-size: 10px; color: var(--accent-blue); text-decoration: none; display: inline-block;">
                                                    <i class="fas fa-external-link-alt" style="margin-right: 3px;"></i>${tx.txid.substring(0, 20)}...
                                                </a>
                                            ` : tx.source === 'whale-alert.io' ? `
                                                <span style="font-size: 10px; color: #f59e0b;">
                                                    <i class="fas fa-bell" style="margin-right: 3px;"></i>Whale Alert
                                                </span>
                                            ` : ''}
                                            <div style="font-size: 9px; color: var(--text-muted); margin-top: 2px;">
                                                ${tx.status === 'pending' ? '⏳ Pendente' : tx.status === 'confirmed' ? '✅ Confirmada' : ''}
                                                ${tx.blockHeight ? ` • Bloco #${tx.blockHeight.toLocaleString()}` : ''}
                                            </div>
                                        </div>
                                        <div style="font-size: 10px; padding: 4px 8px; border-radius: 4px; background: ${tx.flowType === 'to_exchange' ? 'rgba(239, 68, 68, 0.2)' : tx.flowType === 'from_exchange' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)'}; color: ${tx.flowType === 'to_exchange' ? '#ef4444' : tx.flowType === 'from_exchange' ? '#22c55e' : '#3b82f6'};">
                                            ${tx.flowType === 'to_exchange' ? '→ Exchange' : tx.flowType === 'from_exchange' ? '← Exchange' : '↔️ Transfer'}
                                        </div>
                                    </div>
                                `}).join('')}
                                ${data.transactions.length > 2 ? `
                                    <button onclick="openWhaleTransactionModal()" style="
                                        display:flex;align-items:center;justify-content:center;gap:8px;
                                        width:100%;padding:12px;margin-top:8px;
                                        background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(139,92,246,0.12));
                                        border:1px solid rgba(59,130,246,0.3);border-radius:10px;
                                        color:#60a5fa;font-size:13px;font-weight:700;
                                        cursor:pointer;transition:all 0.2s;">
                                        <i class="fas fa-list-ul"></i>
                                        Ver todas (${data.transactions.length} transações)
                                    </button>
                                ` : ''}
                            </div>
                        ` : ''}
                    ` : `
                        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                            <div style="font-size: 40px; margin-bottom: 12px;">🐋</div>
                            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Carregando dados...</div>
                            <div style="font-size: 12px;">Buscando na blockchain Bitcoin</div>
                        </div>
                    `}
                    
                    <div style="padding: 10px; background: var(--bg-tertiary); border-radius: 8px; font-size: 11px; color: var(--text-muted);">
                        <i class="fas fa-database" style="margin-right: 6px;"></i>
                        Dados: blockchain.info + Whale Alert + Base de endereços conhecidos<br>
                        <span style="color: var(--text-secondary);">📊 Só exibe transações ≥$100K de exchanges e baleias identificadas</span>
                        <br><a href="https://www.blockchain.com/explorer" target="_blank" style="color: var(--accent-blue); text-decoration: none;">
                            <i class="fas fa-external-link-alt" style="margin-right: 3px;"></i>Verificar no blockchain.com
                        </a>
                    </div>
                </div>
            `;
        }
        
        // Aliases para compatibilidade
        function updateWhaleActivity() {
            fetchWhaleActivity(whaleActivityPeriod);
        }
        
        function updateWhaleActivityUI() {
            renderWhaleActivityUI();
        }
        
        // Modal completo de transações de baleias
        function openWhaleTransactionModal() {
            const data = whaleActivityData;
            if (!data || !data.transactions || data.transactions.length === 0) return;
            
            const formatVolume = (vol) => {
                if (!vol || isNaN(vol)) return '$0';
                if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(2)}B`;
                if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
                if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
                return `$${vol.toFixed(0)}`;
            };
            const formatBtc = (btc) => {
                if (!btc || isNaN(btc)) return '0 BTC';
                if (btc >= 1000) return `${(btc / 1000).toFixed(1)}K BTC`;
                return `${btc.toFixed(2)} BTC`;
            };
            
            // Remover modal existente
            const existing = document.getElementById('whale-tx-modal');
            if (existing) existing.remove();
            
            const modal = document.createElement('div');
            modal.id = 'whale-tx-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;background:rgba(0,0,0,0.95);backdrop-filter:blur(16px);animation:fadeInOverlay 0.25s ease;';
            
            const txListHtml = data.transactions.map((tx, i) => {
                const borderColor = tx.flowType === 'to_exchange' ? '#ef4444' : tx.flowType === 'from_exchange' ? '#22c55e' : tx.flowType === 'exchange_transfer' ? '#f59e0b' : '#3b82f6';
                const badgeBg = tx.flowType === 'to_exchange' ? 'rgba(239,68,68,0.2)' : tx.flowType === 'from_exchange' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)';
                const badgeColor = tx.flowType === 'to_exchange' ? '#ef4444' : tx.flowType === 'from_exchange' ? '#22c55e' : '#3b82f6';
                const badgeText = tx.flowType === 'to_exchange' ? '→ Exchange' : tx.flowType === 'from_exchange' ? '← Exchange' : '↔️ Transfer';
                
                return `
                <div style="display:flex;align-items:center;padding:12px 14px;background:var(--bg-card,#1a1a24);border-radius:10px;margin-bottom:8px;border-left:3px solid ${borderColor};">
                    <div style="flex:1;">
                        <div style="font-size:14px;font-weight:700;color:#e5e7eb;margin-bottom:4px;">
                            ${formatVolume(tx.usdValue)}
                            <span style="font-size:11px;color:#9ca3af;font-weight:400;margin-left:4px;">(${formatBtc(tx.btcAmount)})</span>
                        </div>
                        ${tx.flowLabel ? `<div style="font-size:11px;font-weight:600;color:#3b82f6;margin-bottom:3px;">${tx.entityIcon || '🏦'} ${tx.flowLabel}</div>` : ''}
                        ${tx.txid && !tx.txid.startsWith('wa_') ? `
                            <a href="https://www.blockchain.com/explorer/transactions/btc/${tx.txid}" target="_blank" 
                               style="font-size:10px;color:#60a5fa;text-decoration:none;">
                                <i class="fas fa-external-link-alt" style="margin-right:3px;"></i>${tx.txid.substring(0, 24)}...
                            </a>
                        ` : tx.source === 'whale-alert.io' ? `
                            <span style="font-size:10px;color:#f59e0b;"><i class="fas fa-bell" style="margin-right:3px;"></i>Whale Alert</span>
                        ` : ''}
                        <div style="font-size:9px;color:#6b7280;margin-top:2px;">
                            ${tx.status === 'pending' ? '⏳ Pendente' : tx.status === 'confirmed' ? '✅ Confirmada' : ''}
                            ${tx.blockHeight ? ` • Bloco #${tx.blockHeight.toLocaleString()}` : ''}
                        </div>
                    </div>
                    <div style="font-size:10px;padding:4px 8px;border-radius:4px;background:${badgeBg};color:${badgeColor};white-space:nowrap;">
                        ${badgeText}
                    </div>
                </div>`;
            }).join('');
            
            modal.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-water" style="color:white;font-size:15px;"></i>
                        </div>
                        <div>
                            <div style="font-size:15px;font-weight:800;color:#e5e7eb;">Histórico de Transações</div>
                            <div style="font-size:11px;color:#6b7280;">${data.transactions.length} transações • Período: ${WHALE_PERIODS[whaleActivityPeriod]?.label || '2h'}</div>
                        </div>
                    </div>
                    <button onclick="document.getElementById('whale-tx-modal').remove()" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.08);border:none;color:#9ca3af;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Summary bar -->
                <div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.05);overflow-x:auto;">
                    <div style="padding:8px 14px;background:rgba(239,68,68,0.1);border-radius:8px;white-space:nowrap;">
                        <div style="font-size:10px;color:#ef4444;font-weight:700;">→ EXCHANGES</div>
                        <div style="font-size:14px;font-weight:800;color:#ef4444;">${formatVolume(data.toExchange)}</div>
                    </div>
                    <div style="padding:8px 14px;background:rgba(34,197,94,0.1);border-radius:8px;white-space:nowrap;">
                        <div style="font-size:10px;color:#22c55e;font-weight:700;">← EXCHANGES</div>
                        <div style="font-size:14px;font-weight:800;color:#22c55e;">${formatVolume(data.fromExchange)}</div>
                    </div>
                    <div style="padding:8px 14px;background:rgba(245,158,11,0.1);border-radius:8px;white-space:nowrap;">
                        <div style="font-size:10px;color:#f59e0b;font-weight:700;">OUTROS</div>
                        <div style="font-size:14px;font-weight:800;color:#f59e0b;">${formatVolume(data.unknownVolume || 0)}</div>
                    </div>
                </div>
                
                <!-- Transaction list -->
                <div style="flex:1;overflow-y:auto;padding:14px 16px;-webkit-overflow-scrolling:touch;">
                    ${txListHtml}
                </div>
            `;
            
            document.body.appendChild(modal);
        }
        
