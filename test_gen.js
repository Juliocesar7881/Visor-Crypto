global.CRYPTO_DATABASE = {};
﻿
const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

const sandbox = {
    window: { 
        APP_CONFIG: { CALENDAR_WORKER_URL: '' }, 
        addEventListener: ()=>{},
        CRYPTO_DATABASE: { 'BTCUSDT': { name: 'Bitcoin', symbol: 'BTCUSDT' } }
    },
    document: { dispatchEvent: () => {} },
    console: { log: ()=>{}, warn: ()=>{}, error: ()=>{} },
    Math: Math,
    Date: Date,
    parseFloat: parseFloat,
    parseInt: parseInt,
    String: String
};

try {
    const fn = new Function('window', 'document', 'console', 'Math', 'Date', 'parseFloat', 'parseInt', 'String', code + '\nreturn generateTechnicalAnalysis;');
    const gen = fn(sandbox.window, sandbox.document, sandbox.console, Math, Date, parseFloat, parseInt, String);
    
    // Create mock data
    const klines = Array(50).fill().map(()=>[100, 50000, 50100, 49900, 49950, 100]);
    const mockData = {
          currentPrice: 50000,
          klines5m: klines,
          klines15m: klines,
          klines1h: klines,
          klines4h: klines,
          klines1d: klines,
          ticker24h: { volume: 1000, quoteVolume: 50000000 },
          fundingRate: { fundingRate: 0.01 },
          openInterest: { openInterest: 0 },
          openInterestHist: [{sumOpenInterestValue: 1}, {sumOpenInterestValue: 2}],
          forceOrders: [],
      orderBook: {
          bids: [ [49000, 1] ],
          asks: [ [51000, 1] ]
      },
      takerBuySellVol: []
    };

    const res = gen(mockData, 'BTCUSDT');
    console.log('Got score!', res);
} catch (e) {
    console.log('Error running generateTechnicalAnalysis:\n', e.stack);
}

