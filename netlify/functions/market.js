const { ok, err, preflight } = require('./utils');

async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 AlphaScope/2.0', Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const d = await res.json();
    const r = d?.chart?.result?.[0];
    if (!r) return null;
    const m   = r.meta;
    const cur = m.regularMarketPrice || 0;
    const pre = m.chartPreviousClose || m.previousClose || cur;
    return {
      symbol,
      price:      +cur.toFixed(2),
      prev_close: +pre.toFixed(2),
      change:     +(cur - pre).toFixed(2),
      change_pct: pre ? +((cur - pre) / pre * 100).toFixed(2) : 0,
      currency:   m.currency || 'USD',
    };
  } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  // Fetch in parallel: Nifty, Sensex, Gold, Silver, USD/INR, BTC, India VIX
  const tickers = [
    { key: 'nifty50',   sym: '^NSEI',    label: 'Nifty 50',   type: 'index'    },
    { key: 'sensex',    sym: '^BSESN',   label: 'Sensex',     type: 'index'    },
    { key: 'gold',      sym: 'GC=F',     label: 'Gold',       type: 'commodity', unit: 'USD/oz' },
    { key: 'silver',    sym: 'SI=F',     label: 'Silver',     type: 'commodity', unit: 'USD/oz' },
    { key: 'usdinr',    sym: 'USDINR=X', label: 'USD/INR',    type: 'forex'    },
    { key: 'btc',       sym: 'BTC-USD',  label: 'Bitcoin',    type: 'crypto'   },
    { key: 'indiavix',  sym: '^INDIAVIX',label: 'India VIX',  type: 'vix'      },
    { key: 'crude',     sym: 'CL=F',     label: 'Crude Oil',  type: 'commodity', unit: 'USD/bbl' },
  ];

  const results = await Promise.allSettled(tickers.map(t => yahooQuote(t.sym)));

  const market = {};
  tickers.forEach((t, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      market[t.key] = { ...t, ...r.value };
    } else {
      market[t.key] = { ...t, price: 0, change_pct: 0, error: true };
    }
  });

  // Compute simple market sentiment from VIX + Nifty
  const vix   = market.indiavix?.price || 15;
  const nChg  = market.nifty50?.change_pct || 0;
  let sentiment = 'Neutral';
  let sentimentScore = 50;
  if (vix > 25 || nChg < -1.5)      { sentiment = 'Fear';        sentimentScore = 20; }
  else if (vix > 18 || nChg < -0.5) { sentiment = 'Caution';     sentimentScore = 38; }
  else if (vix < 12 && nChg > 0.5)  { sentiment = 'Greed';       sentimentScore = 78; }
  else if (vix < 15 && nChg > 0)    { sentiment = 'Optimism';    sentimentScore = 62; }

  return ok({
    market,
    sentiment,
    sentiment_score: sentimentScore,
    fetched_at: new Date().toISOString(),
  });
};
