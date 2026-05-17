import * as XLSX from 'xlsx';
import { listCatalogForImport, listFunds, normalizeProviderSymbol } from './db.js';

const catalogSheetNames = ['标的清单', '股票清单', '指数清单', 'catalog', 'index_catalog', 'stocks'];
const fundSheetNames = ['基金持仓', '持仓清单', 'funds', 'holdings'];

const catalogAliases = {
  name: ['name', '名称', '标的名称', '股票名称', '指数名称', '基金名称'],
  code: ['code', '代码', '标的代码', '股票代码', '指数代码'],
  providerSymbol: ['providersymbol', 'provider_symbol', '行情代码', '内部代码', '数据源代码', 'provider symbol'],
  category: ['category', '分类', '类型', '标的类型'],
  note: ['note', '备注', '说明'],
};

const fundAliases = {
  name: ['name', '基金名称', '持仓名称'],
  fundCode: ['fundcode', 'fund_code', '基金代码', '代码'],
  amount: ['amount', '持有金额', '持仓金额', '金额', '当前金额'],
  holdingProfit: ['holdingprofit', 'holding_profit', '持有收益', '累计收益'],
  holdingPercent: ['holdingpercent', 'holding_percent', '持有收益率', '累计收益率'],
  providerSymbol: ['providersymbol', 'provider_symbol', '关联行情代码', '关联内部代码', '行情代码'],
  linkedCode: ['linkedcode', 'linked_code', '关联代码', '关联标的代码', '指数代码', '股票代码', '标的代码'],
  linkedName: ['linkedname', 'linked_name', '关联名称', '关联标的', '关联指数', '关联股票'],
  trackingRatio: ['trackingratio', 'tracking_ratio', '估算系数', '跟踪系数'],
  note: ['note', '备注', '说明'],
};

export function previewImportWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    kind: classifySheet(sheetName, workbook.Sheets[sheetName]),
    rows: sheetRows(workbook.Sheets[sheetName]),
  })).filter((sheet) => sheet.kind);

  const existingCatalog = listCatalogForImport();
  const existingFunds = listFunds();
  const catalogPreview = normalizeCatalogRows(sheets, existingCatalog);
  const catalogLookup = buildCatalogLookup([...existingCatalog, ...catalogPreview.validRows]);
  const fundPreview = normalizeFundRows(sheets, existingFunds, catalogLookup);

  return {
    fileSheets: workbook.SheetNames,
    expectedSheets: {
      catalog: '标的清单',
      funds: '基金持仓',
    },
    catalog: catalogPreview,
    funds: fundPreview,
    summary: {
      catalog: summarizeRows(catalogPreview.rows),
      funds: summarizeRows(fundPreview.rows),
    },
  };
}

function normalizeCatalogRows(sheets, existingCatalog) {
  const existingByProvider = new Map(existingCatalog.map((item) => [item.providerSymbol, item]));
  const rows = [];

  for (const sheet of sheets.filter((item) => item.kind === 'catalog')) {
    sheet.rows.forEach((row, index) => {
      const mapped = mapRow(row, catalogAliases);
      const code = normalizeDisplayCode(mapped.code);
      const providerSymbol = normalizeProviderSymbol(mapped.providerSymbol || code);
      const name = cleanText(mapped.name);
      const errors = [];

      if (!name) errors.push('名称不能为空');
      if (!code) errors.push('代码不能为空');
      if (!providerSymbol) errors.push('无法识别行情代码');

      const existing = providerSymbol ? existingByProvider.get(providerSymbol) : null;
      rows.push({
        rowNumber: index + 2,
        sheetName: sheet.sheetName,
        status: errors.length ? 'error' : existing ? 'update' : 'create',
        errors,
        name,
        code,
        providerSymbol,
        category: cleanText(mapped.category) || '自选标的',
        note: cleanText(mapped.note),
        existingId: existing?.id ?? null,
      });
    });
  }

  return { rows, validRows: rows.filter((row) => row.status !== 'error') };
}

function normalizeFundRows(sheets, existingFunds, catalogLookup) {
  const existingByFundCode = new Map(existingFunds.filter((fund) => fund.fundCode).map((fund) => [fund.fundCode, fund]));
  const rows = [];

  for (const sheet of sheets.filter((item) => item.kind === 'fund')) {
    sheet.rows.forEach((row, index) => {
      const mapped = mapRow(row, fundAliases);
      const name = cleanText(mapped.name);
      const fundCode = normalizeSixDigitCode(mapped.fundCode);
      const amount = normalizeNumber(mapped.amount);
      const holdingProfit = normalizeOptionalNumber(mapped.holdingProfit);
      const holdingPercent = normalizeOptionalNumber(mapped.holdingPercent);
      const trackingRatio = normalizeOptionalNumber(mapped.trackingRatio) ?? 1;
      const linkedCode = normalizeDisplayCode(mapped.linkedCode);
      const explicitProvider = normalizeProviderSymbol(mapped.providerSymbol);
      const linkedByProvider = explicitProvider ? catalogLookup.byProvider.get(explicitProvider) : null;
      const linkedByCode = linkedCode ? catalogLookup.byCode.get(linkedCode) : null;
      const linkedByName = cleanText(mapped.linkedName) ? catalogLookup.byName.get(cleanText(mapped.linkedName)) : null;
      const linked = linkedByProvider || linkedByCode || linkedByName || null;
      const providerSymbol = explicitProvider || linked?.providerSymbol || normalizeProviderSymbol(linkedCode);
      const linkedName = linked?.name || cleanText(mapped.linkedName);
      const errors = [];

      if (!name) errors.push('基金名称不能为空');
      if (!Number.isFinite(amount) || amount < 0) errors.push('持有金额必须大于等于 0');
      if (holdingProfit !== null && !Number.isFinite(holdingProfit)) errors.push('持有收益必须是数字');
      if (holdingPercent !== null && !Number.isFinite(holdingPercent)) errors.push('持有收益率必须是数字');
      if (!Number.isFinite(trackingRatio) || trackingRatio <= 0) errors.push('估算系数必须大于 0');
      if (!providerSymbol) errors.push('关联标的代码或行情代码不能为空');
      if (!linkedName) errors.push('关联标的名称不能为空，或先在“标的清单”中导入');

      const existing = fundCode ? existingByFundCode.get(fundCode) : null;
      rows.push({
        rowNumber: index + 2,
        sheetName: sheet.sheetName,
        status: errors.length ? 'error' : existing ? 'update' : 'create',
        errors,
        name,
        fundCode,
        amount,
        holdingProfit,
        holdingPercent,
        providerSymbol,
        linkedCode: linked?.code || linkedCode,
        linkedName,
        trackingRatio,
        note: cleanText(mapped.note),
        existingId: existing?.id ?? null,
      });
    });
  }

  return { rows, validRows: rows.filter((row) => row.status !== 'error') };
}

function classifySheet(sheetName, sheet) {
  const normalizedName = normalizeHeader(sheetName);
  if (fundSheetNames.some((name) => normalizedName.includes(normalizeHeader(name)))) return 'fund';
  if (catalogSheetNames.some((name) => normalizedName.includes(normalizeHeader(name)))) return 'catalog';

  const [firstRow] = sheetRows(sheet, 1);
  const headers = Object.keys(firstRow ?? {}).map(normalizeHeader);
  if (hasAnyHeader(headers, fundAliases.fundCode) || hasAnyHeader(headers, fundAliases.amount)) return 'fund';
  if (hasAnyHeader(headers, catalogAliases.providerSymbol) || hasAnyHeader(headers, catalogAliases.category)) return 'catalog';
  return null;
}

function sheetRows(sheet, limit) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });
  const filtered = rows.filter((row) => Object.values(row).some((value) => cleanText(value)));
  return Number.isInteger(limit) ? filtered.slice(0, limit) : filtered;
}

function mapRow(row, aliases) {
  const mapped = {};
  const headerMap = new Map(Object.keys(row).map((header) => [normalizeHeader(header), header]));

  for (const [field, names] of Object.entries(aliases)) {
    const header = names.map(normalizeHeader).map((name) => headerMap.get(name)).find(Boolean);
    mapped[field] = header ? row[header] : '';
  }

  return mapped;
}

function buildCatalogLookup(items) {
  const byProvider = new Map();
  const byCode = new Map();
  const byName = new Map();

  for (const item of items) {
    if (item.providerSymbol) byProvider.set(item.providerSymbol, item);
    if (item.code) byCode.set(String(item.code).trim(), item);
    if (item.name) byName.set(String(item.name).trim(), item);
  }

  return { byProvider, byCode, byName };
}

function summarizeRows(rows) {
  return {
    total: rows.length,
    create: rows.filter((row) => row.status === 'create').length,
    update: rows.filter((row) => row.status === 'update').length,
    error: rows.filter((row) => row.status === 'error').length,
  };
}

function hasAnyHeader(headers, aliases) {
  const candidates = aliases.map(normalizeHeader);
  return candidates.some((candidate) => headers.includes(candidate));
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-（）()%()]/g, '');
}

function normalizeDisplayCode(value) {
  const input = cleanText(value);
  if (!input) return '';
  if (/^\d{1,6}$/.test(input)) return input.padStart(6, '0');
  return input.toUpperCase();
}

function normalizeSixDigitCode(value) {
  const input = cleanText(value);
  if (!input) return '';
  return /^\d{1,6}$/.test(input) ? input.padStart(6, '0') : input;
}

function normalizeNumber(value) {
  const input = cleanText(value).replace(/[,%，]/g, '');
  if (!input) return NaN;
  return Number(input);
}

function normalizeOptionalNumber(value) {
  const input = cleanText(value).replace(/[,%，]/g, '');
  if (!input) return null;
  return Number(input);
}

function cleanText(value) {
  return String(value ?? '').trim();
}
