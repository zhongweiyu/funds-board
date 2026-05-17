import iconv from 'iconv-lite';

const SINA_URL = 'https://hq.sinajs.cn/list=';
const SINA_CN_DAILY_URL = 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData';
const SINA_US_DAILY_URL = 'https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_history=/US_MinKService.getDailyK';
const CSINDEX_URL = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';
const CSI_FALLBACKS = new Map([
  ['csi930997', 'sh515030'],
  ['csi930713', 'sh515070'],
]);
const SINA_US_HISTORY_SYMBOLS = new Map([['gb_ndx', '.NDX']]);

export async function fetchQuotes(symbols) {
  const uniqueSymbols = [...new Set(symbols.filter(Boolean).map((symbol) => symbol.toLowerCase()))];
  if (uniqueSymbols.length === 0) return [];

  const csiSymbols = uniqueSymbols.filter((symbol) => symbol.startsWith('csi'));
  const sinaSymbols = uniqueSymbols.filter((symbol) => !symbol.startsWith('csi'));
  const [sinaQuotes, csiQuotes] = await Promise.all([
    fetchSinaQuotes(sinaSymbols).catch(() => []),
    fetchCsiQuotes(csiSymbols).catch(() => []),
  ]);
  const receivedCsiSymbols = new Set(csiQuotes.map((quote) => quote.symbol));
  const missingCsiSymbols = csiSymbols.filter((symbol) => !receivedCsiSymbols.has(symbol));
  const csiFallbackQuotes = await fetchCsiFallbackQuotes(missingCsiSymbols).catch(() => []);

  return [...sinaQuotes, ...csiQuotes, ...csiFallbackQuotes];
}

export async function fetchQuoteHistories(symbols) {
  const uniqueSymbols = [...new Set(symbols.filter(Boolean).map((symbol) => symbol.toLowerCase()))];
  if (uniqueSymbols.length === 0) return [];

  const histories = await Promise.all(uniqueSymbols.map((symbol) => fetchQuoteHistory(symbol).catch(() => [])));
  return histories.flat();
}

async function fetchSinaQuotes(symbols) {
  if (symbols.length === 0) return [];
  const requestSymbols = symbols.map((symbol) => (symbol.startsWith('sge_') ? symbol.toUpperCase() : symbol));

  const response = await fetch(`${SINA_URL}${requestSymbols.join(',')}`, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`行情服务暂不可用：${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = iconv.decode(buffer, 'gb18030');
  return parseSinaQuotes(text);
}

async function fetchCsiQuotes(symbols) {
  if (symbols.length === 0) return [];

  const quotes = await Promise.all(symbols.map(fetchCsiQuote));
  return quotes.filter(Boolean);
}

async function fetchCsiFallbackQuotes(symbols) {
  const fallbackPairs = symbols
    .map((symbol) => [symbol, CSI_FALLBACKS.get(symbol)])
    .filter(([, fallbackSymbol]) => fallbackSymbol);
  if (fallbackPairs.length === 0) return [];

  const fallbackQuotes = await fetchSinaQuotes(fallbackPairs.map(([, fallbackSymbol]) => fallbackSymbol));
  const fallbackQuoteMap = new Map(fallbackQuotes.map((quote) => [quote.symbol, quote]));

  return fallbackPairs
    .map(([symbol, fallbackSymbol]) => {
      const quote = fallbackQuoteMap.get(fallbackSymbol);
      if (!quote) return null;
      return {
        ...quote,
        symbol,
        code: symbol.replace(/^csi/, ''),
        source: `${quote.source}ETF代理`,
        proxy: {
          symbol: fallbackSymbol,
          name: quote.name,
        },
      };
    })
    .filter(Boolean);
}

async function fetchCsiQuote(symbol) {
  const code = symbol.replace(/^csi/, '');
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 14);

  const url = new URL(CSINDEX_URL);
  url.searchParams.set('indexCode', code);
  url.searchParams.set('startDate', formatDate(start));
  url.searchParams.set('endDate', formatDate(today));

  const response = await fetch(url, {
    headers: {
      Referer: `https://www.csindex.com.cn/zh-CN/indices/index-detail/${code}`,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`中证指数服务暂不可用：${response.status}`);

  const body = await response.json();
  const rows = Array.isArray(body.data) ? body.data : [];
  const latest = rows.at(-1);
  if (!latest) return null;

  return {
    symbol,
    name: latest.indexNameCnAll || latest.indexNameCn || code,
    code,
    current: Number(latest.close) || 0,
    change: Number(latest.change) || 0,
    percent: Number(latest.changePct) || 0,
    volume: Number(latest.tradingVol) || 0,
    amount: Number(latest.tradingValue) || 0,
    time: String(latest.tradeDate || ''),
    tradeDate: normalizeTradeDate(latest.tradeDate),
    source: '中证指数',
    realtime: false,
  };
}

async function fetchQuoteHistory(symbol) {
  if (symbol.startsWith('gb_')) return fetchSinaUsDailyHistory(symbol);
  if (symbol.startsWith('sh') || symbol.startsWith('sz') || symbol.startsWith('s_sh') || symbol.startsWith('s_sz')) {
    return fetchSinaCnDailyHistory(symbol);
  }
  if (symbol.startsWith('csi')) return fetchCsiDailyHistory(symbol);
  return [];
}

async function fetchSinaUsDailyHistory(symbol) {
  const sinaSymbol = SINA_US_HISTORY_SYMBOLS.get(symbol) || symbol.replace(/^gb_/, '').toUpperCase();
  const url = new URL(SINA_US_DAILY_URL);
  url.searchParams.set('symbol', sinaSymbol);

  const response = await fetch(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`新浪美股历史行情暂不可用：${response.status}`);

  const rows = parseJsonPayload(await response.text());
  if (!Array.isArray(rows)) return [];

  return dailyRowsToQuotes({
    symbol,
    rows: rows.map((row) => ({
      date: row.d,
      close: row.c,
      volume: row.v,
      amount: row.a,
    })),
    code: sinaSymbol.replace(/^\./, ''),
    source: '新浪财经日K',
  });
}

async function fetchSinaCnDailyHistory(symbol) {
  const sinaSymbol = symbol.replace(/^s_/, '');
  const url = new URL(SINA_CN_DAILY_URL);
  url.searchParams.set('symbol', sinaSymbol);
  url.searchParams.set('scale', '240');
  url.searchParams.set('ma', 'no');
  url.searchParams.set('datalen', '12');

  const response = await fetch(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`新浪日K服务暂不可用：${response.status}`);

  const rows = await response.json();
  if (!Array.isArray(rows)) return [];

  return dailyRowsToQuotes({
    symbol,
    rows: rows.map((row) => ({
      date: row.day,
      close: row.close,
      volume: row.volume,
      amount: row.amount,
    })),
    code: sinaSymbol.replace(/^(sh|sz)/, ''),
    source: '新浪财经日K',
  });
}

async function fetchCsiDailyHistory(symbol) {
  const code = symbol.replace(/^csi/, '');
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 21);

  const url = new URL(CSINDEX_URL);
  url.searchParams.set('indexCode', code);
  url.searchParams.set('startDate', formatDate(start));
  url.searchParams.set('endDate', formatDate(today));

  const response = await fetch(url, {
    headers: {
      Referer: `https://www.csindex.com.cn/zh-CN/indices/index-detail/${code}`,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`中证指数历史服务暂不可用：${response.status}`);

  const body = await response.json();
  const rows = Array.isArray(body.data) ? body.data : [];

  return rows
    .map((row) => ({
      symbol,
      name: row.indexNameCnAll || row.indexNameCn || code,
      code,
      current: Number(row.close) || 0,
      change: Number(row.change) || 0,
      percent: Number(row.changePct) || 0,
      volume: Number(row.tradingVol) || 0,
      amount: Number(row.tradingValue) || 0,
      time: String(row.tradeDate || ''),
      tradeDate: normalizeTradeDate(row.tradeDate),
      source: '中证指数日K',
      realtime: false,
    }))
    .filter((quote) => quote.tradeDate)
    .slice(-8);
}

export function parseSinaQuotes(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseSinaLine)
    .filter(Boolean);
}

function parseSinaLine(line) {
  const match = line.match(/^var hq_str_(.+?)="(.*)";$/);
  if (!match) return null;

  const symbol = match[1].toLowerCase();
  const raw = match[2];
  if (!raw) return null;

  const fields = raw.split(',');
  if (symbol.startsWith('gb_')) return parseUsSecurity(symbol, fields);
  if (symbol.startsWith('sge_')) return parseSgeSecurity(symbol, fields);
  if (symbol.startsWith('s_')) return parseSimpleIndex(symbol, fields);
  return parseStandardSecurity(symbol, fields);
}

function parseUsSecurity(symbol, fields) {
  const name = fields[0];
  const current = Number(fields[1]);
  const percent = Number(fields[2]);
  const change = Number(fields[4]);
  const time = fields[3];

  if (!name || !Number.isFinite(current)) return null;

  return {
    symbol,
    name,
    current,
    change: Number.isFinite(change) ? change : 0,
    percent: Number.isFinite(percent) ? percent : 0,
    volume: Number(fields[10]) || 0,
    amount: 0,
    time: time || new Date().toISOString(),
    tradeDate: normalizeTradeDate(time),
    source: '新浪财经',
    realtime: true,
  };
}

function parseSgeSecurity(symbol, fields) {
  const name = fields[0] || fields[2];
  const current = Number(fields[7]);
  const percentText = fields[17] || '';
  const percent = Number(percentText.replace('%', ''));
  const change = Number.isFinite(percent) ? (current * percent) / 100 : 0;

  if (!name || !Number.isFinite(current)) return null;

  return {
    symbol,
    name,
    current,
    change: Number.isFinite(change) ? change : 0,
    percent: Number.isFinite(percent) ? percent : 0,
    volume: Number(fields[14]) || 0,
    amount: Number(fields[15]) || 0,
    time: fields[16] || new Date().toISOString(),
    tradeDate: normalizeTradeDate(fields[16]),
    source: '新浪财经',
    realtime: true,
  };
}

function parseSimpleIndex(symbol, fields) {
  const [name, current, change, percent, volume, amount] = fields;
  const currentValue = Number(current);
  const changeValue = Number(change);
  const percentValue = Number(percent);

  if (!name || !Number.isFinite(currentValue)) return null;

  return {
    symbol,
    name,
    current: currentValue,
    change: Number.isFinite(changeValue) ? changeValue : 0,
    percent: Number.isFinite(percentValue) ? percentValue : 0,
    volume: Number(volume) || 0,
    amount: Number(amount) || 0,
    time: new Date().toISOString(),
    tradeDate: normalizeTradeDate(new Date()),
    source: '新浪财经',
    realtime: true,
  };
}

function parseStandardSecurity(symbol, fields) {
  const name = fields[0];
  const previousClose = Number(fields[2]);
  const current = Number(fields[3]);
  const date = fields[30];
  const time = fields[31];

  if (!name || !Number.isFinite(current)) return null;

  const change = Number.isFinite(previousClose) ? current - previousClose : 0;
  const percent = previousClose ? (change / previousClose) * 100 : 0;

  return {
    symbol,
    name,
    current,
    change,
    percent,
    volume: Number(fields[8]) || 0,
    amount: Number(fields[9]) || 0,
    time: date && time ? `${date} ${time}` : new Date().toISOString(),
    tradeDate: normalizeTradeDate(date),
    source: '新浪财经',
    realtime: true,
  };
}

function dailyRowsToQuotes({ symbol, rows, code, source }) {
  const quotes = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previousClose = Number(rows[index - 1].close);
    const current = Number(rows[index].close);
    if (!Number.isFinite(previousClose) || !Number.isFinite(current) || previousClose === 0) continue;

    const change = current - previousClose;
    quotes.push({
      symbol,
      name: '',
      code,
      current,
      change,
      percent: (change / previousClose) * 100,
      volume: Number(rows[index].volume) || 0,
      amount: Number(rows[index].amount) || 0,
      time: String(rows[index].date || ''),
      tradeDate: normalizeTradeDate(rows[index].date),
      source,
      realtime: false,
    });
  }

  return quotes.filter((quote) => quote.tradeDate).slice(-8);
}

function parseJsonPayload(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return JSON.parse(trimmed);

  const match = trimmed.match(/var\s+\w+\s*=\s*(.*);?\s*$/s);
  if (!match) return null;

  let payload = match[1].trim().replace(/;$/, '');
  if (payload.startsWith('(') && payload.endsWith(')')) payload = payload.slice(1, -1);
  return JSON.parse(payload);
}

function normalizeTradeDate(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const input = String(value ?? '').trim();
  if (!input) return '';

  const compact = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const dashed = input.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;

  return '';
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
