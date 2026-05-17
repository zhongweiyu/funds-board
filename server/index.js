import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDueFundAdjustments,
  commitImportData,
  createFundAdjustment,
  createFund,
  dbPath,
  deleteFund,
  listFundAdjustmentsByFundIds,
  listCatalogByIds,
  listCatalog,
  listFunds,
  listQuoteSnapshots,
  normalizeProviderSymbol,
  settleFundAmountsByQuotes,
  updateFund,
  upsertQuoteSnapshots,
} from './db.js';
import { fetchFundQuotes } from './fundQuotes.js';
import { previewImportWorkbook } from './importWorkbook.js';
import { fetchQuoteHistories, fetchQuotes } from './quotes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath });
});

app.get('/api/catalog', (req, res) => {
  res.json(listCatalog(String(req.query.q ?? '')));
});

app.get('/api/quotes', async (req, res) => {
  try {
    const catalogIds = String(req.query.catalogIds ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    if (catalogIds.length > 0) {
      const catalogItems = listCatalogByIds(catalogIds);
      const quotes = await fetchQuotes(catalogItems.map((item) => item.providerSymbol));
      const catalogMap = new Map(catalogItems.map((item) => [item.providerSymbol, item]));
      return res.json(
        quotes.map((quote) => {
          const catalog = catalogMap.get(quote.symbol);
          return {
            ...quote,
            catalog: catalog
              ? {
                  id: catalog.id,
                  name: catalog.name,
                  code: catalog.code,
                  category: catalog.category,
                }
              : null,
          };
        })
      );
    }

    const symbols = String(req.query.symbols ?? '')
      .split(',')
      .map(normalizeProviderSymbol)
      .filter(Boolean);
    res.json(await fetchQuotes(symbols));
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

app.get('/api/funds', async (_req, res) => {
  try {
    let funds = listFunds();
    const qdiiSymbols = funds.filter(isQdiiFund).map((fund) => fund.providerSymbol);
    const [quotes, fundQuotes, fetchedDailyQuotes] = await Promise.all([
      fetchQuotes(funds.map((fund) => fund.providerSymbol)),
      fetchFundQuotes(funds.map((fund) => fund.fundCode)),
      fetchQuoteHistories(qdiiSymbols),
    ]);

    const fundQuoteMap = new Map(fundQuotes.map((quote) => [quote.code, quote]));
    settleFundAmountsByQuotes(funds, fundQuoteMap);
    funds = listFunds();
    const appliedAdjustments = applyDueFundAdjustments(funds, fundQuoteMap);
    if (appliedAdjustments.length > 0) funds = listFunds();

    upsertQuoteSnapshots(quotes, 'latest');
    upsertQuoteSnapshots(fetchedDailyQuotes, 'daily');

    const persistedDailyQuotes = listQuoteSnapshots(qdiiSymbols, 'daily', 8);
    const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const dailyQuoteMap = groupQuotesBySymbol([...persistedDailyQuotes, ...fetchedDailyQuotes]);
    const adjustmentsByFundId = groupAdjustmentsByFundId(listFundAdjustmentsByFundIds(funds.map((fund) => fund.id)));

    res.json(
      funds.map((fund) => {
        const fundQuote = fundQuoteMap.get(fund.fundCode);
        const qdiiFund = isQdiiFund(fund);
        const dailyQuotes = dailyQuoteMap.get(fund.providerSymbol) ?? [];
        const latestQuote = quoteMap.get(fund.providerSymbol) ?? dailyQuotes.at(-1);
        const previousQuote = qdiiFund ? quoteForTradeDate(dailyQuotes, fundQuote?.date) ?? dailyQuotes.at(-2) : null;
        const quote = qdiiFund ? markQuote(previousQuote ?? latestQuote, { qdiiLagged: Boolean(previousQuote) }) : latestQuote;
        const quoteToday = qdiiFund ? markQuote(latestQuote ?? dailyQuotes.at(-1), { qdiiToday: true }) : latestQuote;
        const linkedPercent = quote ? quote.percent * fund.trackingRatio : null;
        const linkedProfit = hasNumber(linkedPercent) ? profitFromEndingAmount(fund.amount, linkedPercent) : null;
        const todayLinkedPercent = quoteToday ? quoteToday.percent * fund.trackingRatio : null;
        const todayLinkedProfit = hasNumber(todayLinkedPercent) ? profitFromEndingAmount(fund.amount, todayLinkedPercent) : null;
        const actualProfit = fundQuote ? profitFromEndingAmount(fund.amount, fundQuote.percent) : null;
        const amountUpdated = Boolean(fundQuote?.date && fund.amountUpdatedTradeDate === fundQuote.date);
        const adjustments = adjustmentsByFundId.get(fund.id) ?? [];
        const pendingAdjustments = adjustments.filter((adjustment) => adjustment.status === 'pending');
        return {
          ...fund,
          adjustments: adjustments.slice(0, 8),
          pendingAdjustmentCount: pendingAdjustments.length,
          pendingAdjustmentAmount: pendingAdjustments.reduce(
            (sum, adjustment) => sum + (adjustment.type === 'add' ? 1 : -1) * Number(adjustment.amount || 0),
            0
          ),
          quote,
          quoteToday,
          quotePrevious: qdiiFund ? previousQuote ?? null : null,
          fundQuote,
          actualProfit,
          actualPercent: fundQuote?.percent ?? null,
          amountUpdated,
          linkedProfit,
          linkedPercent,
          todayLinkedProfit,
          todayLinkedPercent,
          estimateProfit: linkedProfit ?? 0,
          estimatePercent: linkedPercent ?? 0,
        };
      })
    );
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

function profitFromEndingAmount(amount, percent) {
  const endingAmount = Number(amount);
  const percentValue = Number(percent);
  const divisor = 100 + percentValue;

  if (!Number.isFinite(endingAmount) || !Number.isFinite(percentValue) || divisor === 0) return null;
  return (endingAmount * percentValue) / divisor;
}

function hasNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function isQdiiFund(fund) {
  const fields = [fund.name, fund.linkedCategory, fund.providerSymbol, fund.note].join(' ').toLowerCase();
  return fields.includes('qdii') || fields.includes('海外') || fields.includes('gb_');
}

function groupQuotesBySymbol(quotes) {
  const grouped = new Map();

  for (const quote of quotes) {
    if (!quote?.symbol || !quote.tradeDate || !hasNumber(quote.percent)) continue;

    if (!grouped.has(quote.symbol)) grouped.set(quote.symbol, new Map());
    grouped.get(quote.symbol).set(quote.tradeDate, quote);
  }

  return new Map(
    [...grouped.entries()].map(([symbol, quotesByDate]) => [
      symbol,
      [...quotesByDate.values()].sort((left, right) => String(left.tradeDate).localeCompare(String(right.tradeDate))),
    ])
  );
}

function quoteForTradeDate(quotes, tradeDate) {
  if (!tradeDate) return null;
  return quotes.find((quote) => quote.tradeDate === tradeDate) ?? null;
}

function markQuote(quote, metadata) {
  return quote ? { ...quote, ...metadata } : null;
}

function groupAdjustmentsByFundId(adjustments) {
  const grouped = new Map();

  for (const adjustment of adjustments) {
    if (!grouped.has(adjustment.fundId)) grouped.set(adjustment.fundId, []);
    grouped.get(adjustment.fundId).push(adjustment);
  }

  return grouped;
}

app.post('/api/funds', (req, res) => {
  try {
    res.status(201).json(createFund(req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/funds/:id', (req, res) => {
  try {
    const fund = updateFund(Number(req.params.id), req.body);
    if (!fund) return res.status(404).json({ message: '基金不存在' });
    res.json(fund);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/funds/:id/adjustments', (req, res) => {
  try {
    const adjustment = createFundAdjustment(Number(req.params.id), req.body);
    if (!adjustment) return res.status(404).json({ message: '基金不存在' });
    res.status(201).json(adjustment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/import/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '请上传 Excel 文件' });
    res.json(previewImportWorkbook(req.file.buffer));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/import/commit', (req, res) => {
  try {
    res.json(commitImportData(req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/funds/:id', (req, res) => {
  if (!deleteFund(Number(req.params.id))) return res.status(404).json({ message: '基金不存在' });
  res.status(204).end();
});

if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(port, () => {
  console.log(`Funds board API running on http://localhost:${port}`);
  console.log(`SQLite knowledge base: ${dbPath}`);
});
