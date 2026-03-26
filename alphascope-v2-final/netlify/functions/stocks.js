const { ok, err, preflight } = require('./utils');

// Yahoo Finance v8 - no API key needed
async function fetchYahooQuote(symbol) {
  const ySymbol = symbol.endsWith('.NS') ? symbol : symbol + '.NS';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AlphaScope/2.0)',
        'Accept': 'application/json',
      }
    });
    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No data returned');

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const closes = (quote.close || []).filter(Boolean);
    const opens  = (quote.open  || []).filter(Boolean);
    const highs  = (quote.high  || []).filter(Boolean);
    const lows   = (quote.low   || []).filter(Boolean);
    const vols   = (quote.volume|| []).filter(Boolean);

    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1] || 0;
    const prevClose    = meta.chartPreviousClose  || meta.previousClose || closes[closes.length - 2] || currentPrice;
    const changePct    = prevClose ? ((currentPrice - prevClose) / prevClose * 100) : 0;

    // build OHLCV array for charts (last 90 candles)
    const ohlcv = closes.map((c, i) => ({
      o: +(opens[i]  || c).toFixed(2),
      h: +(highs[i]  || c).toFixed(2),
      l: +(lows[i]   || c).toFixed(2),
      c: +c.toFixed(2),
      v: vols[i] || 0,
    })).slice(-90);

    // SMAs
    function sma(arr, n) {
      return arr.map((_, i) => i < n - 1 ? null : +(arr.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n).toFixed(2));
    }

    const closeArr = ohlcv.map(d => d.c);
    const sma20  = sma(closeArr, 20);
    const sma50  = sma(closeArr, 50);

    // RSI
    function rsi(arr, n = 14) {
      const out = new Array(arr.length).fill(null);
      if (arr.length < n + 1) return out;
      let gains = 0, losses = 0;
      for (let i = 1; i <= n; i++) {
        const d = arr[i] - arr[i - 1];
        if (d > 0) gains += d; else losses -= d;
      }
      let ag = gains / n, al = losses / n;
      for (let i = n; i < arr.length - 1; i++) {
        const d = arr[i + 1] - arr[i];
        ag = (ag * (n - 1) + Math.max(d, 0)) / n;
        al = (al * (n - 1) + Math.max(-d, 0)) / n;
        out[i + 1] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(1);
      }
      return out;
    }

    return {
      symbol: symbol.replace('.NS', ''),
      price: +currentPrice.toFixed(2),
      prev_close: +prevClose.toFixed(2),
      change_pct: +changePct.toFixed(2),
      high_52w: +(meta.fiftyTwoWeekHigh || 0).toFixed(2),
      low_52w:  +(meta.fiftyTwoWeekLow  || 0).toFixed(2),
      market_cap: meta.marketCap || 0,
      currency: meta.currency || 'INR',
      exchange: meta.exchangeName || 'NSE',
      ohlcv,
      sma20,
      sma50,
      rsi: rsi(closeArr),
    };
  } catch (e) {
    console.error(`fetchYahooQuote error for ${symbol}:`, e.message);
    return null;
  }
}

// Batch fetch multiple symbols
async function fetchMultiple(symbols) {
  const results = {};
  // Yahoo supports batch via finance/spark but chart gives more data
  // fetch concurrently in batches of 5
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(s => fetchYahooQuote(s)));
    batch.forEach((s, idx) => {
      if (fetched[idx]) results[s.replace('.NS', '')] = fetched[idx];
    });
  }
  return results;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const path = event.path
    .replace('/.netlify/functions/stocks', '')
    .replace('/api/stocks', '');

  const params = event.queryStringParameters || {};

  // GET /api/stocks/quote?symbol=TCS
  if (event.httpMethod === 'GET' && path === '/quote') {
    const symbol = params.symbol;
    if (!symbol) return err('symbol required');
    const data = await fetchYahooQuote(symbol);
    if (!data) return err('Could not fetch quote for ' + symbol, 502);
    return ok(data);
  }

  // GET /api/stocks/batch?symbols=TCS,INFY,RELIANCE
  if (event.httpMethod === 'GET' && path === '/batch') {
    const raw = params.symbols || '';
    const symbols = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (!symbols.length) return err('symbols required');
    const data = await fetchMultiple(symbols);
    return ok(data);
  }

  // GET /api/stocks/search?q=tata
  if (event.httpMethod === 'GET' && path === '/search') {
    const q = (params.q || '').toLowerCase().trim();
    if (!q) return ok([]);
    const NSE_MASTER = getNSEMaster();
    const results = NSE_MASTER.filter(s =>
      s.symbol.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.sector.toLowerCase().includes(q)
    ).slice(0, 10);
    return ok(results);
  }

  return err('Not found', 404);
};

function getNSEMaster() {
  return [
    { symbol:'RELIANCE',   name:'Reliance Industries',         sector:'Energy'      },
    { symbol:'TCS',        name:'Tata Consultancy Services',   sector:'IT'          },
    { symbol:'HDFCBANK',   name:'HDFC Bank',                   sector:'Banking'     },
    { symbol:'INFY',       name:'Infosys',                     sector:'IT'          },
    { symbol:'ICICIBANK',  name:'ICICI Bank',                  sector:'Banking'     },
    { symbol:'SBIN',       name:'State Bank of India',         sector:'Banking'     },
    { symbol:'WIPRO',      name:'Wipro',                       sector:'IT'          },
    { symbol:'BAJFINANCE', name:'Bajaj Finance',               sector:'NBFC'        },
    { symbol:'ZOMATO',     name:'Zomato',                      sector:'Tech'        },
    { symbol:'TATAMOTORS', name:'Tata Motors',                 sector:'Auto'        },
    { symbol:'SUNPHARMA',  name:'Sun Pharma',                  sector:'Pharma'      },
    { symbol:'TITAN',      name:'Titan Company',               sector:'Consumer'    },
    { symbol:'IRCTC',      name:'IRCTC',                       sector:'Travel'      },
    { symbol:'MARUTI',     name:'Maruti Suzuki',               sector:'Auto'        },
    { symbol:'AXISBANK',   name:'Axis Bank',                   sector:'Banking'     },
    { symbol:'HCLTECH',    name:'HCL Technologies',            sector:'IT'          },
    { symbol:'NESTLEIND',  name:'Nestle India',                sector:'FMCG'        },
    { symbol:'LTIM',       name:'LTIMindtree',                 sector:'IT'          },
    { symbol:'DELHIVERY',  name:'Delhivery',                   sector:'Logistics'   },
    { symbol:'NYKAA',      name:'FSN E-Commerce (Nykaa)',      sector:'Tech'        },
    { symbol:'PAYTM',      name:'One97 Communications',        sector:'Fintech'     },
    { symbol:'ADANIENT',   name:'Adani Enterprises',           sector:'Conglomerate'},
    { symbol:'ADANIPORTS', name:'Adani Ports',                 sector:'Logistics'   },
    { symbol:'COALINDIA',  name:'Coal India',                  sector:'Mining'      },
    { symbol:'ONGC',       name:'ONGC',                        sector:'Energy'      },
    { symbol:'POWERGRID',  name:'Power Grid Corp',             sector:'Utilities'   },
    { symbol:'NTPC',       name:'NTPC',                        sector:'Utilities'   },
    { symbol:'BHARTIARTL', name:'Bharti Airtel',               sector:'Telecom'     },
    { symbol:'M&M',        name:'Mahindra & Mahindra',         sector:'Auto'        },
    { symbol:'BAJAJFINSV', name:'Bajaj Finserv',               sector:'NBFC'        },
    { symbol:'DIVISLAB',   name:"Divi's Laboratories",         sector:'Pharma'      },
    { symbol:'DRREDDY',    name:"Dr. Reddy's Laboratories",    sector:'Pharma'      },
    { symbol:'CIPLA',      name:'Cipla',                       sector:'Pharma'      },
    { symbol:'EICHERMOT',  name:'Eicher Motors',               sector:'Auto'        },
    { symbol:'HEROMOTOCO', name:'Hero MotoCorp',               sector:'Auto'        },
    { symbol:'HINDALCO',   name:'Hindalco Industries',         sector:'Metals'      },
    { symbol:'JSWSTEEL',   name:'JSW Steel',                   sector:'Metals'      },
    { symbol:'TATASTEEL',  name:'Tata Steel',                  sector:'Metals'      },
    { symbol:'GRASIM',     name:'Grasim Industries',           sector:'Cement'      },
    { symbol:'ULTRACEMCO', name:'UltraTech Cement',            sector:'Cement'      },
    { symbol:'ASIANPAINT', name:'Asian Paints',                sector:'Paints'      },
    { symbol:'BRITANNIA',  name:'Britannia Industries',        sector:'FMCG'        },
    { symbol:'PIDILITIND', name:'Pidilite Industries',         sector:'Chemicals'   },
    { symbol:'INDUSINDBK', name:'IndusInd Bank',               sector:'Banking'     },
    { symbol:'BANKBARODA', name:'Bank of Baroda',              sector:'Banking'     },
    { symbol:'MUTHOOTFIN', name:'Muthoot Finance',             sector:'NBFC'        },
    { symbol:'CHOLAFIN',   name:'Cholamandalam Finance',       sector:'NBFC'        },
    { symbol:'DABUR',      name:'Dabur India',                 sector:'FMCG'        },
    { symbol:'MARICO',     name:'Marico',                      sector:'FMCG'        },
    { symbol:'IREDA',      name:'Indian Renewable Energy Dev', sector:'Finance'     },
  ];
}

exports.getNSEMaster = getNSEMaster;
exports.fetchYahooQuote = fetchYahooQuote;
