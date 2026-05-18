const EASTMONEY_NAV_URL = 'https://api.fund.eastmoney.com/f10/lsjz';

export async function fetchFundQuotes(codes) {
  const uniqueCodes = [...new Set(codes.map(normalizeFundCode).filter(Boolean))];
  if (uniqueCodes.length === 0) return [];

  const quotes = await Promise.all(uniqueCodes.map((code) => fetchFundQuote(code).catch(() => null)));
  return quotes.filter(Boolean);
}

export async function fetchFundQuoteHistory(code, pageSize = 60) {
  const normalizedCode = normalizeFundCode(code);
  if (!normalizedCode) return [];

  const url = new URL(EASTMONEY_NAV_URL);
  url.searchParams.set('fundCode', normalizedCode);
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', String(Math.min(Math.max(Number(pageSize) || 60, 1), 180)));

  const response = await fetch(url, {
    headers: {
      Referer: `https://fundf10.eastmoney.com/jjjz_${normalizedCode}.html`,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`基金净值服务暂不可用：${response.status}`);

  const body = await response.json();
  const rows = body?.Data?.LSJZList;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => normalizeFundQuoteRow(normalizedCode, row))
    .filter(Boolean)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

async function fetchFundQuote(code) {
  const url = new URL(EASTMONEY_NAV_URL);
  url.searchParams.set('fundCode', code);
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', '2');

  const response = await fetch(url, {
    headers: {
      Referer: `https://fundf10.eastmoney.com/jjjz_${code}.html`,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`基金净值服务暂不可用：${response.status}`);

  const body = await response.json();
  const latest = body?.Data?.LSJZList?.[0];
  if (!latest) return null;

  const current = Number(latest.DWJZ);
  const percent = Number(latest.JZZZL);
  if (!Number.isFinite(current) || !Number.isFinite(percent)) return null;

  return {
    code,
    current,
    accumulated: Number(latest.LJJZ) || 0,
    percent,
    date: latest.FSRQ || '',
    source: '东方财富基金净值',
    realtime: false,
  };
}

function normalizeFundQuoteRow(code, row) {
  const current = Number(row?.DWJZ);
  const percent = Number(row?.JZZZL);
  const date = String(row?.FSRQ ?? '').trim();

  if (!date || !Number.isFinite(current) || !Number.isFinite(percent)) return null;

  return {
    code,
    current,
    accumulated: Number(row.LJJZ) || 0,
    percent,
    date,
    source: '东方财富基金净值',
    realtime: false,
  };
}

function normalizeFundCode(value) {
  const input = String(value ?? '').trim();
  return /^\d{6}$/.test(input) ? input : '';
}
