import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'funds.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const nowSql = "datetime('now', 'localtime')";

db.exec(`
  CREATE TABLE IF NOT EXISTS index_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    provider_symbol TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT '指数',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (${nowSql})
  );

  CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fund_code TEXT DEFAULT '',
    amount REAL NOT NULL CHECK(amount >= 0),
    holding_profit REAL DEFAULT NULL,
    holding_percent REAL DEFAULT NULL,
    amount_updated_trade_date TEXT DEFAULT '',
    amount_updated_percent REAL DEFAULT NULL,
    amount_update_profit REAL DEFAULT NULL,
    amount_updated_at TEXT DEFAULT NULL,
    provider_symbol TEXT NOT NULL,
    linked_name TEXT NOT NULL,
    tracking_ratio REAL NOT NULL DEFAULT 1,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (${nowSql}),
    updated_at TEXT NOT NULL DEFAULT (${nowSql})
  );

  CREATE TABLE IF NOT EXISTS quote_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    quote_kind TEXT NOT NULL DEFAULT 'daily',
    name TEXT DEFAULT '',
    code TEXT DEFAULT '',
    current REAL DEFAULT NULL,
    change REAL DEFAULT NULL,
    percent REAL DEFAULT NULL,
    volume REAL DEFAULT NULL,
    amount REAL DEFAULT NULL,
    source TEXT DEFAULT '',
    realtime INTEGER NOT NULL DEFAULT 0,
    raw_time TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (${nowSql}),
    updated_at TEXT NOT NULL DEFAULT (${nowSql}),
    UNIQUE(provider_symbol, trade_date, quote_kind)
  );

  CREATE TABLE IF NOT EXISTS fund_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('add', 'reduce')),
    amount REAL NOT NULL CHECK(amount > 0),
    trade_date TEXT NOT NULL,
    trade_timing TEXT NOT NULL CHECK(trade_timing IN ('before_15', 'after_15')),
    effective_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied')),
    applied_at TEXT DEFAULT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (${nowSql}),
    updated_at TEXT NOT NULL DEFAULT (${nowSql}),
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE
  );
`);

ensureColumn('funds', 'holding_profit', 'REAL DEFAULT NULL');
ensureColumn('funds', 'holding_percent', 'REAL DEFAULT NULL');
ensureColumn('funds', 'amount_updated_trade_date', "TEXT DEFAULT ''");
ensureColumn('funds', 'amount_updated_percent', 'REAL DEFAULT NULL');
ensureColumn('funds', 'amount_update_profit', 'REAL DEFAULT NULL');
ensureColumn('funds', 'amount_updated_at', 'TEXT DEFAULT NULL');

const seedItems = [
  ['上证指数', '000001', 's_sh000001', '宽基指数', '上海证券交易所综合指数'],
  ['深证成指', '399001', 's_sz399001', '宽基指数', '深圳证券交易所成份指数'],
  ['创业板指', '399006', 's_sz399006', '宽基指数', '创业板代表性指数'],
  ['沪深300', '000300', 's_sh000300', '宽基指数', '沪深两市大盘蓝筹'],
  ['中证500', '000905', 's_sh000905', '宽基指数', '中盘代表指数'],
  ['中证1000', '000852', 's_sh000852', '宽基指数', '小盘代表指数'],
  ['科创50', '000688', 's_sh000688', '宽基指数', '科创板代表指数'],
  ['中证新能源汽车产业指数', '930997', 'csi930997', '中证指数', '场外新能源车基金常用参考指数'],
  ['中证机器人', '562500', 'sh562500', '指数代理', '截图关联板块；使用机器人ETF华夏作为实时代理'],
  ['中证人工智能主题指数', '930713', 'csi930713', '中证指数', '中证人工智能主题指数'],
  ['国证商用卫星通信产业', '159206', 'sz159206', '指数代理', '截图关联板块商用卫星通信；使用卫星ETF作为实时代理'],
  ['黄金9999', 'AU9999', 'sge_au9999', '商品现货', '上海黄金交易所 AU9999'],
  ['新兴市场优选', 'EEM', 'gb_eem', '海外ETF代理', '截图关联板块；使用 iShares MSCI Emerging Markets ETF 作为代理'],
  ['越南指数', 'VNM', 'gb_vnm', '海外ETF代理', '截图关联板块；使用 VanEck Vietnam ETF 作为代理'],
  ['纳斯达克100', 'NDX', 'gb_ndx', '海外指数', '截图关联板块；新浪美股纳斯达克100指数'],
  ['全球科技先锋', 'IXN', 'gb_ixn', '海外ETF代理', '截图关联板块；使用 iShares Global Tech ETF 作为代理'],
  ['先进制造', '399260', 's_sz399260', '深证指数', '深证先进制造指数'],
  ['全球高端制造', '562910', 'sh562910', '行业ETF代理', '截图关联板块；使用高端制造ETF易方达作为实时代理'],
  ['证券ETF国泰', '512880', 'sh512880', '行业ETF', '常用于证券板块联接基金估算'],
  ['创业板ETF', '159915', 'sz159915', '宽基ETF', '创业板指数场内ETF'],
  ['黄金ETF', '518880', 'sh518880', '商品ETF', '黄金主题基金常用参考'],
  ['新能源车ETF', '515030', 'sh515030', '行业ETF', '新能源车主题参考'],
  ['医疗', '512170', 'sh512170', '行业ETF代理', '截图关联板块；使用医疗ETF华宝作为实时代理'],
  ['半导体ETF', '512760', 'sh512760', '行业ETF', '半导体主题参考'],
  ['军工ETF', '512660', 'sh512660', '行业ETF', '军工主题参考'],
  ['酒ETF', '512690', 'sh512690', '行业ETF', '白酒主题参考'],
  ['纳指ETF', '513100', 'sh513100', '跨境ETF', '纳斯达克100场内ETF'],
  ['人工智能ETF', '515070', 'sh515070', '行业ETF', '人工智能主题参考'],
  ['通信ETF', '515880', 'sh515880', '行业ETF', '通信板块参考'],
  ['芯片ETF', '159995', 'sz159995', '行业ETF', '芯片主题参考'],
];

const insertCatalog = db.prepare(`
  INSERT OR IGNORE INTO index_catalog (name, code, provider_symbol, category, note)
  VALUES (?, ?, ?, ?, ?)
`);

const seed = db.transaction(() => {
  for (const item of seedItems) insertCatalog.run(...item);
});

seed();

const screenshotMetrics = [
  { fundCode: '020481', holdingProfit: 5785.91, holdingPercent: 14.85 },
  { fundCode: '012733', holdingProfit: 7632.05, holdingPercent: 20.91 },
  { fundCode: '024194', holdingProfit: 433.26, holdingPercent: 1.47 },
  { fundCode: '000216', holdingProfit: -1539.5, holdingPercent: -4.94 },
  { fundCode: '400015', holdingProfit: 3781.55, holdingPercent: 15.17 },
  { fundCode: '018147', holdingProfit: 4248.17, holdingPercent: 40.34 },
  { fundCode: '008763', holdingProfit: 545.58, holdingPercent: 4.26 },
  { fundCode: '004851', holdingProfit: -838.08, holdingPercent: -10.91 },
  { fundCode: '024239', holdingProfit: -13.7, holdingPercent: -0.27 },
  { fundCode: '501206', holdingProfit: 98.83, holdingPercent: 4.71 },
  { fundCode: '016665', holdingProfit: 0, holdingPercent: null },
  { fundCode: '021778', holdingProfit: 8433.23, holdingPercent: 14.54 },
];

const seedScreenshotMetrics = db.transaction(() => {
  const update = db.prepare(`
    UPDATE funds
    SET holding_profit = @holdingProfit,
        holding_percent = @holdingPercent
    WHERE fund_code = @fundCode
      AND note LIKE '%来自截图%'
      AND holding_profit IS NULL
      AND holding_percent IS NULL
  `);

  for (const item of screenshotMetrics) update.run(item);
});

seedScreenshotMetrics();

export function listCatalog(query = '') {
  const keyword = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT id, name, code, category, note
       FROM index_catalog
       WHERE ? = '%%'
          OR name LIKE ?
          OR code LIKE ?
          OR provider_symbol LIKE ?
          OR category LIKE ?
          OR note LIKE ?
       ORDER BY
          CASE WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END,
          id
       LIMIT 50`
    )
    .all(keyword, keyword, keyword, keyword, keyword, keyword, query.trim(), `${query.trim()}%`);
}

export function getCatalogById(id) {
  return db
    .prepare(
      `SELECT id, name, code, provider_symbol AS providerSymbol, category, note
       FROM index_catalog
       WHERE id = ?`
    )
    .get(id);
}

export function listCatalogByIds(ids) {
  const normalizedIds = [...new Set(ids.map(Number).filter(Number.isInteger))];
  if (normalizedIds.length === 0) return [];

  const placeholders = normalizedIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, name, code, provider_symbol AS providerSymbol, category, note
       FROM index_catalog
       WHERE id IN (${placeholders})`
    )
    .all(...normalizedIds);
}

export function listFunds() {
  return db
    .prepare(
      `SELECT funds.id,
              funds.name,
              funds.fund_code AS fundCode,
              funds.amount,
              funds.holding_profit AS holdingProfit,
              funds.holding_percent AS holdingPercent,
              funds.amount_updated_trade_date AS amountUpdatedTradeDate,
              funds.amount_updated_percent AS amountUpdatedPercent,
              funds.amount_update_profit AS amountUpdateProfit,
              funds.amount_updated_at AS amountUpdatedAt,
              funds.provider_symbol AS providerSymbol,
              funds.linked_name AS linkedName,
              funds.tracking_ratio AS trackingRatio,
              funds.note,
              funds.created_at AS createdAt,
              funds.updated_at AS updatedAt,
              index_catalog.id AS linkedCatalogId,
              COALESCE(index_catalog.code, '') AS linkedCode,
              COALESCE(index_catalog.category, '') AS linkedCategory
       FROM funds
       LEFT JOIN index_catalog ON index_catalog.provider_symbol = funds.provider_symbol
       ORDER BY funds.updated_at DESC, funds.id DESC`
    )
    .all();
}

export function listFundAdjustmentsByFundIds(fundIds) {
  const normalizedIds = [...new Set(fundIds.map(Number).filter(Number.isInteger))];
  if (normalizedIds.length === 0) return [];

  const placeholders = normalizedIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id,
              fund_id AS fundId,
              adjustment_type AS type,
              amount,
              trade_date AS tradeDate,
              trade_timing AS tradeTiming,
              effective_date AS effectiveDate,
              status,
              applied_at AS appliedAt,
              note,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM fund_adjustments
       WHERE fund_id IN (${placeholders})
       ORDER BY
          CASE status WHEN 'pending' THEN 0 ELSE 1 END,
          effective_date DESC,
          id DESC`
    )
    .all(...normalizedIds);
}

export function settleFundAmountsByQuotes(funds, fundQuoteMap) {
  const updates = [];

  for (const fund of funds) {
    const quote = fundQuoteMap.get(fund.fundCode);
    const update = buildAmountSettlement(fund, quote);
    if (update) updates.push(update);
  }

  if (updates.length === 0) return [];

  const applyUpdate = db.prepare(`
    UPDATE funds
    SET amount = @nextAmount,
        holding_profit = @nextHoldingProfit,
        holding_percent = @nextHoldingPercent,
        amount_updated_trade_date = @tradeDate,
        amount_updated_percent = @percent,
        amount_update_profit = @profit,
        amount_updated_at = ${nowSql},
        updated_at = ${nowSql}
    WHERE id = @id
      AND (amount_updated_trade_date IS NULL OR amount_updated_trade_date = '' OR amount_updated_trade_date < @tradeDate)
  `);

  const transaction = db.transaction(() => {
    for (const update of updates) applyUpdate.run(update);
  });

  transaction();
  return updates;
}

export function applyDueFundAdjustments(funds, fundQuoteMap, today = formatSqlDate(new Date())) {
  const fundIds = funds.map((fund) => fund.id);
  const adjustments = listFundAdjustmentsByFundIds(fundIds)
    .filter((adjustment) => adjustment.status === 'pending')
    .sort((left, right) => {
      const dateResult = String(left.effectiveDate).localeCompare(String(right.effectiveDate));
      return dateResult || Number(left.id) - Number(right.id);
    });

  if (adjustments.length === 0) return [];

  const fundMap = new Map(funds.map((fund) => [fund.id, { ...fund }]));
  const applicable = [];

  for (const adjustment of adjustments) {
    const fund = fundMap.get(adjustment.fundId);
    if (!fund || !canApplyFundAdjustment(fund, adjustment, fundQuoteMap, today)) continue;

    const amount = Number(fund.amount);
    const adjustmentAmount = Number(adjustment.amount);
    const nextAmount =
      adjustment.type === 'add'
        ? roundMoney(amount + adjustmentAmount)
        : Math.max(0, roundMoney(amount - adjustmentAmount));
    const holdingProfit = normalizeSnapshotNumber(fund.holdingProfit);
    const nextHoldingPercent =
      holdingProfit === null ? normalizeSnapshotNumber(fund.holdingPercent) : percentFromEndingAmount(nextAmount, holdingProfit);

    const update = {
      id: adjustment.id,
      fundId: fund.id,
      nextAmount,
      holdingProfit,
      holdingPercent: nextHoldingPercent,
    };

    applicable.push(update);
    fundMap.set(fund.id, {
      ...fund,
      amount: nextAmount,
      holdingProfit,
      holdingPercent: nextHoldingPercent,
    });
  }

  if (applicable.length === 0) return [];

  const updateFund = db.prepare(`
    UPDATE funds
    SET amount = @nextAmount,
        holding_profit = @holdingProfit,
        holding_percent = @holdingPercent,
        updated_at = ${nowSql}
    WHERE id = @fundId
  `);

  const markApplied = db.prepare(`
    UPDATE fund_adjustments
    SET status = 'applied',
        applied_at = ${nowSql},
        updated_at = ${nowSql}
    WHERE id = @id
      AND status = 'pending'
  `);

  const transaction = db.transaction(() => {
    for (const update of applicable) {
      updateFund.run(update);
      markApplied.run(update);
    }
  });

  transaction();
  return applicable;
}

export function createFundAdjustment(fundId, payload) {
  const fund = getFund(Number(fundId));
  if (!fund) return null;

  const normalized = normalizeFundAdjustmentPayload(payload, fund);
  const result = db
    .prepare(
      `INSERT INTO fund_adjustments (
         fund_id, adjustment_type, amount, trade_date, trade_timing, effective_date, note
       )
       VALUES (
         @fundId, @type, @amount, @tradeDate, @tradeTiming, @effectiveDate, @note
       )`
    )
    .run({ fundId: fund.id, ...normalized });

  return getFundAdjustment(result.lastInsertRowid);
}

export function createFund(payload) {
  const result = db
    .prepare(
      `INSERT INTO funds (
         name, fund_code, amount, holding_profit, holding_percent,
         provider_symbol, linked_name, tracking_ratio, note
       )
       VALUES (
         @name, @fundCode, @amount, @holdingProfit, @holdingPercent,
         @providerSymbol, @linkedName, @trackingRatio, @note
       )`
    )
    .run(normalizeFundPayload(payload));

  return getFund(result.lastInsertRowid);
}

export function updateFund(id, payload) {
  db.prepare(
    `UPDATE funds
     SET name = @name,
         fund_code = @fundCode,
         amount = @amount,
         holding_profit = @holdingProfit,
         holding_percent = @holdingPercent,
         provider_symbol = @providerSymbol,
         linked_name = @linkedName,
         tracking_ratio = @trackingRatio,
         note = @note,
         updated_at = ${nowSql}
     WHERE id = @id`
  ).run({ id, ...normalizeFundPayload(payload) });

  return getFund(id);
}

export function deleteFund(id) {
  const transaction = db.transaction((fundId) => {
    db.prepare('DELETE FROM fund_adjustments WHERE fund_id = ?').run(fundId);
    return db.prepare('DELETE FROM funds WHERE id = ?').run(fundId).changes > 0;
  });

  return transaction(id);
}

export function upsertQuoteSnapshots(quotes, quoteKind = 'daily') {
  const normalizedQuotes = quotes.map((quote) => normalizeQuoteSnapshot(quote, quoteKind)).filter(Boolean);
  if (normalizedQuotes.length === 0) return;

  const upsert = db.prepare(`
    INSERT INTO quote_snapshots (
      provider_symbol, trade_date, quote_kind, name, code, current, change, percent,
      volume, amount, source, realtime, raw_time, updated_at
    )
    VALUES (
      @providerSymbol, @tradeDate, @quoteKind, @name, @code, @current, @change, @percent,
      @volume, @amount, @source, @realtime, @rawTime, ${nowSql}
    )
    ON CONFLICT(provider_symbol, trade_date, quote_kind) DO UPDATE SET
      name = excluded.name,
      code = excluded.code,
      current = excluded.current,
      change = excluded.change,
      percent = excluded.percent,
      volume = excluded.volume,
      amount = excluded.amount,
      source = excluded.source,
      realtime = excluded.realtime,
      raw_time = excluded.raw_time,
      updated_at = ${nowSql}
  `);

  const transaction = db.transaction(() => {
    for (const quote of normalizedQuotes) upsert.run(quote);
  });

  transaction();
}

export function listQuoteSnapshots(symbols, quoteKind = 'daily', limit = 6) {
  const normalizedSymbols = [...new Set(symbols.map(normalizeProviderSymbol).filter(Boolean))];
  if (normalizedSymbols.length === 0) return [];

  const select = db.prepare(`
    SELECT provider_symbol AS symbol,
           name,
           code,
           current,
           change,
           percent,
           volume,
           amount,
           raw_time AS time,
           trade_date AS tradeDate,
           source,
           realtime
    FROM quote_snapshots
    WHERE provider_symbol = ?
      AND quote_kind = ?
    ORDER BY trade_date DESC, updated_at DESC
    LIMIT ?
  `);

  return normalizedSymbols.flatMap((symbol) =>
    select.all(symbol, quoteKind, limit).map((quote) => ({
      ...quote,
      realtime: Boolean(quote.realtime),
    }))
  );
}

function getFund(id) {
  return db
    .prepare(
      `SELECT funds.id,
              funds.name,
              funds.fund_code AS fundCode,
              funds.amount,
              funds.holding_profit AS holdingProfit,
              funds.holding_percent AS holdingPercent,
              funds.amount_updated_trade_date AS amountUpdatedTradeDate,
              funds.amount_updated_percent AS amountUpdatedPercent,
              funds.amount_update_profit AS amountUpdateProfit,
              funds.amount_updated_at AS amountUpdatedAt,
              funds.provider_symbol AS providerSymbol,
              funds.linked_name AS linkedName,
              funds.tracking_ratio AS trackingRatio,
              funds.note,
              funds.created_at AS createdAt,
              funds.updated_at AS updatedAt,
              index_catalog.id AS linkedCatalogId,
              COALESCE(index_catalog.code, '') AS linkedCode,
              COALESCE(index_catalog.category, '') AS linkedCategory
       FROM funds
       LEFT JOIN index_catalog ON index_catalog.provider_symbol = funds.provider_symbol
       WHERE funds.id = ?`
    )
    .get(id);
}

function getFundAdjustment(id) {
  return db
    .prepare(
      `SELECT id,
              fund_id AS fundId,
              adjustment_type AS type,
              amount,
              trade_date AS tradeDate,
              trade_timing AS tradeTiming,
              effective_date AS effectiveDate,
              status,
              applied_at AS appliedAt,
              note,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM fund_adjustments
       WHERE id = ?`
    )
    .get(id);
}

function normalizeFundPayload(payload) {
  const amount = Number(payload.amount);
  const trackingRatio = Number(payload.trackingRatio ?? 1);
  const holdingProfit = normalizeOptionalNumber(payload.holdingProfit, '持有收益');
  const holdingPercent = normalizeOptionalNumber(payload.holdingPercent, '持有收益率');
  const catalog = payload.catalogId ? getCatalogById(Number(payload.catalogId)) : null;
  const providerSymbol = catalog?.providerSymbol ?? payload.providerSymbol;
  const linkedName = catalog?.name ?? payload.linkedName;

  if (!payload.name?.trim()) throw new Error('基金名称不能为空');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('持有金额必须是大于等于 0 的数字');
  if (payload.catalogId && !catalog) throw new Error('关联指数不存在，请重新选择');
  if (!providerSymbol?.trim()) throw new Error('必须选择关联指数');
  if (!linkedName?.trim()) throw new Error('关联指数名称不能为空');
  if (!Number.isFinite(trackingRatio) || trackingRatio <= 0) throw new Error('估算系数必须大于 0');

  return {
    name: payload.name.trim(),
    fundCode: payload.fundCode?.trim() ?? '',
    amount,
    holdingProfit,
    holdingPercent,
    providerSymbol: normalizeProviderSymbol(providerSymbol),
    linkedName: linkedName.trim(),
    trackingRatio,
    note: payload.note?.trim() ?? '',
  };
}

function buildAmountSettlement(fund, quote) {
  const amount = Number(fund.amount);
  const percent = Number(quote?.percent);
  const tradeDate = normalizeSnapshotDate(quote?.date);

  if (!fund?.id || !normalizeFundCode(fund.fundCode) || !tradeDate) return null;
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(percent)) return null;
  if (fund.amountUpdatedTradeDate && fund.amountUpdatedTradeDate >= tradeDate) return null;

  const profit = roundMoney((amount * percent) / 100);
  const nextAmount = Math.max(0, roundMoney(amount + profit));
  const holdingProfit = normalizeSnapshotNumber(fund.holdingProfit);
  const nextHoldingProfit = holdingProfit === null ? null : roundMoney(holdingProfit + profit);
  const nextHoldingPercent =
    nextHoldingProfit === null ? normalizeSnapshotNumber(fund.holdingPercent) : percentFromEndingAmount(nextAmount, nextHoldingProfit);

  return {
    id: fund.id,
    nextAmount,
    nextHoldingProfit,
    nextHoldingPercent,
    tradeDate,
    percent,
    profit,
  };
}

function canApplyFundAdjustment(fund, adjustment, fundQuoteMap, today) {
  if (String(adjustment.effectiveDate) > today) return false;

  const normalizedCode = normalizeFundCode(fund.fundCode);
  if (!normalizedCode) return true;

  const fundQuoteDate = normalizeSnapshotDate(fundQuoteMap.get(normalizedCode)?.date);
  const updatedTradeDate = normalizeSnapshotDate(fund.amountUpdatedTradeDate);

  if (updatedTradeDate && updatedTradeDate >= adjustment.effectiveDate) return true;
  if (fundQuoteDate && fundQuoteDate >= adjustment.effectiveDate && updatedTradeDate >= fundQuoteDate) return true;

  return String(adjustment.effectiveDate) < today && !fundQuoteDate;
}

function percentFromEndingAmount(endingAmount, profit) {
  const amount = Number(endingAmount);
  const profitValue = Number(profit);
  const beginningAmount = amount - profitValue;

  if (!Number.isFinite(amount) || !Number.isFinite(profitValue) || beginningAmount === 0) return null;
  return roundPercent((profitValue / beginningAmount) * 100);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundPercent(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function normalizeFundCode(value) {
  const input = String(value ?? '').trim();
  return /^\d{6}$/.test(input) ? input : '';
}

function normalizeQuoteSnapshot(quote, quoteKind) {
  const providerSymbol = normalizeProviderSymbol(quote?.symbol);
  const tradeDate = normalizeSnapshotDate(quote?.tradeDate || quote?.time || new Date());
  const percent = normalizeSnapshotNumber(quote?.percent);

  if (!providerSymbol || !tradeDate || percent === null) return null;

  return {
    providerSymbol,
    tradeDate,
    quoteKind,
    name: String(quote.name ?? ''),
    code: String(quote.code ?? ''),
    current: normalizeSnapshotNumber(quote.current),
    change: normalizeSnapshotNumber(quote.change),
    percent,
    volume: normalizeSnapshotNumber(quote.volume),
    amount: normalizeSnapshotNumber(quote.amount),
    source: String(quote.source ?? ''),
    realtime: quote.realtime ? 1 : 0,
    rawTime: String(quote.time ?? quote.tradeDate ?? ''),
  };
}

function normalizeFundAdjustmentPayload(payload, fund) {
  const type = String(payload.type ?? '').trim();
  const amount = Number(payload.amount);
  const tradeDate = normalizeSnapshotDate(payload.tradeDate);
  const tradeTiming = String(payload.tradeTiming ?? '').trim();

  if (!['add', 'reduce'].includes(type)) throw new Error('加减仓类型无效');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('同步金额必须大于 0');
  if (type === 'reduce' && amount > Number(fund.amount || 0)) throw new Error('减仓金额不能大于当前持有金额');
  if (!tradeDate) throw new Error('原平台交易日期无效');
  if (!['before_15', 'after_15'].includes(tradeTiming)) throw new Error('请选择下午3点前或下午3点后');

  return {
    type,
    amount: roundMoney(amount),
    tradeDate,
    tradeTiming,
    effectiveDate: tradeTiming === 'before_15' ? tradeDate : addDays(tradeDate, 1),
    note: payload.note?.trim() ?? '',
  };
}

function normalizeSnapshotDate(value) {
  if (value instanceof Date) return formatSqlDate(value);

  const input = String(value ?? '').trim();
  if (!input) return '';

  const compact = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const dashed = input.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;

  return '';
}

function normalizeSnapshotNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatSqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(sqlDate, days) {
  const date = new Date(`${sqlDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatSqlDate(date);
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function normalizeOptionalNumber(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label}必须是有效数字`);
  return numeric;
}

export function normalizeProviderSymbol(value) {
  const input = String(value ?? '').trim().toLowerCase();
  if (!input) return '';
  if (
    input.startsWith('csi') ||
    input.startsWith('s_sh') ||
    input.startsWith('s_sz') ||
    input.startsWith('sh') ||
    input.startsWith('sz')
  ) {
    return input;
  }

  if (/^9\d{5}$/.test(input)) return `csi${input}`;
  if (/^6\d{5}$/.test(input) || /^5\d{5}$/.test(input) || /^0\d{5}$/.test(input)) return `sh${input}`;
  if (/^(1|2|3)\d{5}$/.test(input)) return `sz${input}`;

  return input;
}

export { dbPath };
