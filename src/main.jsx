import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Database,
  Edit3,
  FileSpreadsheet,
  Globe2,
  ListChecks,
  Link2,
  MinusCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  Repeat2,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import './styles.css';

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

const defaultForm = {
  id: null,
  name: '',
  fundCode: '',
  amount: '',
  holdingProfit: '',
  holdingPercent: '',
  catalogId: null,
  linkedName: '',
  linkedCode: '',
  linkedCategory: '',
  trackingRatio: '1',
  note: '',
};

const catalogImportColumns = [
  { key: 'name', label: '名称' },
  { key: 'code', label: '代码' },
  { key: 'providerSymbol', label: '行情代码' },
  { key: 'category', label: '分类' },
];

const fundImportColumns = [
  { key: 'name', label: '基金名称' },
  { key: 'fundCode', label: '基金代码' },
  { key: 'amount', label: '持有金额' },
  { key: 'linkedName', label: '关联标的' },
  { key: 'providerSymbol', label: '行情代码' },
];

function createDefaultAdjustmentForm(type = 'add') {
  return {
    type,
    amount: '',
    tradeDate: currentSqlDate(),
    tradeTiming: new Date().getHours() < 15 ? 'before_15' : 'after_15',
    note: '',
  };
}

function App() {
  const [funds, setFunds] = React.useState([]);
  const [catalog, setCatalog] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [quoteResults, setQuoteResults] = React.useState([]);
  const [form, setForm] = React.useState(defaultForm);
  const [activeView, setActiveView] = React.useState('holdings');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingAdjustment, setSavingAdjustment] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [committingImport, setCommittingImport] = React.useState(false);
  const [error, setError] = React.useState('');
  const [importPreview, setImportPreview] = React.useState(null);
  const [importFileName, setImportFileName] = React.useState('');
  const [health, setHealth] = React.useState(null);
  const [lastRefresh, setLastRefresh] = React.useState('');
  const [holdingQuery, setHoldingQuery] = React.useState('');
  const [sortKey, setSortKey] = React.useState(() => window.localStorage.getItem('fundsBoardSortKey') || 'amount');
  const [sortDirection, setSortDirection] = React.useState(
    () => window.localStorage.getItem('fundsBoardSortDirection') || 'desc'
  );
  const [qdiiSortKey, setQdiiSortKey] = React.useState(
    () => window.localStorage.getItem('fundsBoardQdiiSortKey') || 'amount'
  );
  const [qdiiSortDirection, setQdiiSortDirection] = React.useState(
    () => window.localStorage.getItem('fundsBoardQdiiSortDirection') || 'desc'
  );
  const [adjustmentFundId, setAdjustmentFundId] = React.useState(null);
  const [adjustmentForm, setAdjustmentForm] = React.useState(() => createDefaultAdjustmentForm());
  const [dailyReturnFundId, setDailyReturnFundId] = React.useState(null);
  const [dailyReturnData, setDailyReturnData] = React.useState(null);
  const [loadingDailyReturns, setLoadingDailyReturns] = React.useState(false);

  const totalAmount = funds.reduce((sum, fund) => sum + Number(fund.amount || 0), 0);
  const totalActualProfit = funds.reduce((sum, fund) => sum + (hasValue(fund.actualProfit) ? Number(fund.actualProfit) : 0), 0);
  const totalLinkedProfit = funds.reduce((sum, fund) => sum + (hasValue(fund.linkedProfit) ? Number(fund.linkedProfit) : 0), 0);
  const totalHoldingProfit = funds.reduce(
    (sum, fund) => sum + (hasValue(fund.holdingProfit) ? Number(fund.holdingProfit) : 0),
    0
  );
  const actualPercent = percentFromEndingAmount(totalAmount, totalActualProfit);
  const linkedPercent = percentFromEndingAmount(totalAmount, totalLinkedProfit);
  const totalHoldingPercent = percentFromEndingAmount(totalAmount, totalHoldingProfit);
  const qdiiFunds = React.useMemo(() => funds.filter(isQdiiFund), [funds]);
  const qdiiAmount = qdiiFunds.reduce((sum, fund) => sum + Number(fund.amount || 0), 0);
  const qdiiActualProfit = qdiiFunds.reduce(
    (sum, fund) => sum + (hasValue(fund.actualProfit) ? Number(fund.actualProfit) : 0),
    0
  );
  const qdiiExpectedProfit = qdiiFunds.reduce(
    (sum, fund) => sum + (hasValue(fund.todayLinkedProfit) ? Number(fund.todayLinkedProfit) : 0),
    0
  );
  const qdiiActualPercent = percentFromEndingAmount(qdiiAmount, qdiiActualProfit);
  const qdiiExpectedPercent = percentFromEndingAmount(qdiiAmount, qdiiExpectedProfit);
  const filteredFunds = React.useMemo(() => filterFunds(funds, holdingQuery), [funds, holdingQuery]);
  const sortedFunds = React.useMemo(
    () => sortFunds(filteredFunds, sortKey, sortDirection),
    [filteredFunds, sortKey, sortDirection]
  );
  const sortedQdiiFunds = React.useMemo(
    () => sortFunds(qdiiFunds, qdiiSortKey, qdiiSortDirection),
    [qdiiFunds, qdiiSortKey, qdiiSortDirection]
  );
  const adjustmentFund = React.useMemo(
    () => funds.find((fund) => fund.id === adjustmentFundId) ?? null,
    [funds, adjustmentFundId]
  );
  const dailyReturnFund = React.useMemo(
    () => funds.find((fund) => fund.id === dailyReturnFundId) ?? null,
    [funds, dailyReturnFundId]
  );

  React.useEffect(() => {
    refreshFunds();
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      searchCatalog(query);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    window.localStorage.setItem('fundsBoardSortKey', sortKey);
    window.localStorage.setItem('fundsBoardSortDirection', sortDirection);
  }, [sortKey, sortDirection]);

  React.useEffect(() => {
    window.localStorage.setItem('fundsBoardQdiiSortKey', qdiiSortKey);
    window.localStorage.setItem('fundsBoardQdiiSortDirection', qdiiSortDirection);
  }, [qdiiSortKey, qdiiSortDirection]);

  function updateSort(nextKey) {
    const isSameKey = sortKey === nextKey;
    setSortKey(nextKey);
    setSortDirection(isSameKey && sortDirection === 'desc' ? 'asc' : 'desc');
  }

  function updateQdiiSort(nextKey) {
    const isSameKey = qdiiSortKey === nextKey;
    setQdiiSortKey(nextKey);
    setQdiiSortDirection(isSameKey && qdiiSortDirection === 'desc' ? 'asc' : 'desc');
  }

  function renderSortHeader(label, key, options = {}) {
    const { percentKey, percentLabel = '收益率', subLabel } = options;
    return (
      <div className="sortHead">
        <button
          className={`sortHeadButton ${sortKey === key ? 'active' : ''}`}
          onClick={() => updateSort(key)}
          type="button"
          aria-label={`按${label}排序`}
        >
          <span>{label}</span>
          <span className="sortArrows" aria-hidden="true">
            <span className={sortKey === key && sortDirection === 'asc' ? 'active' : ''}>▲</span>
            <span className={sortKey === key && sortDirection === 'desc' ? 'active' : ''}>▼</span>
          </span>
        </button>
        {percentKey ? (
          <button
            className={`sortHeadSub ${sortKey === percentKey ? 'active' : ''}`}
            onClick={() => updateSort(percentKey)}
            type="button"
            aria-label={`按${label}百分比排序`}
          >
            <span>{percentLabel}</span>
            <span className="sortArrows" aria-hidden="true">
              <span className={sortKey === percentKey && sortDirection === 'asc' ? 'active' : ''}>▲</span>
              <span className={sortKey === percentKey && sortDirection === 'desc' ? 'active' : ''}>▼</span>
            </span>
          </button>
        ) : (
          <span className="headSubLabel">{subLabel}</span>
        )}
      </div>
    );
  }

  function renderQdiiSortHeader(label, key, options = {}) {
    const { percentKey, percentLabel = '收益率', subLabel } = options;
    return (
      <div className="sortHead">
        <button
          className={`sortHeadButton ${qdiiSortKey === key ? 'active' : ''}`}
          onClick={() => updateQdiiSort(key)}
          type="button"
          aria-label={`按${label}排序`}
        >
          <span>{label}</span>
          <span className="sortArrows" aria-hidden="true">
            <span className={qdiiSortKey === key && qdiiSortDirection === 'asc' ? 'active' : ''}>▲</span>
            <span className={qdiiSortKey === key && qdiiSortDirection === 'desc' ? 'active' : ''}>▼</span>
          </span>
        </button>
        {percentKey ? (
          <button
            className={`sortHeadSub ${qdiiSortKey === percentKey ? 'active' : ''}`}
            onClick={() => updateQdiiSort(percentKey)}
            type="button"
            aria-label={`按${label}百分比排序`}
          >
            <span>{percentLabel}</span>
            <span className="sortArrows" aria-hidden="true">
              <span className={qdiiSortKey === percentKey && qdiiSortDirection === 'asc' ? 'active' : ''}>▲</span>
              <span className={qdiiSortKey === percentKey && qdiiSortDirection === 'desc' ? 'active' : ''}>▼</span>
            </span>
          </button>
        ) : (
          <span className="headSubLabel">{subLabel}</span>
        )}
      </div>
    );
  }

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || '请求失败');
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function refreshFunds() {
    setLoading(true);
    setError('');
    try {
      const data = await request('/api/funds');
      setFunds(data);
      setLastRefresh(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function searchCatalog(keyword) {
    try {
      const data = await request(`/api/catalog?q=${encodeURIComponent(keyword)}`);
      setCatalog(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function searchQuote() {
    if (!query.trim()) return;
    setError('');
    const matched = catalog.filter((item) => {
      const input = query.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(input) ||
        item.code.toLowerCase().includes(input) ||
        item.category.toLowerCase().includes(input)
      );
    });

    const items = matched.length > 0 ? matched : catalog;
    if (items.length === 0) return;

    try {
      const catalogIds = items.map((item) => item.id).join(',');
      const data = await request(`/api/quotes?catalogIds=${encodeURIComponent(catalogIds)}`);
      setQuoteResults(data);
    } catch (err) {
      setQuoteResults([]);
      setError(err.message);
    }
  }

  function chooseCatalog(item) {
    setForm((current) => ({
      ...current,
      catalogId: item.id,
      linkedName: item.name,
      linkedCode: item.code,
      linkedCategory: item.category,
    }));
    setQuery(item.name);
  }

  function chooseQuote(quote) {
    setForm((current) => ({
      ...current,
      catalogId: quote.catalog?.id ?? null,
      linkedName: quote.catalog?.name ?? quote.name,
      linkedCode: quote.catalog?.code ?? quote.code ?? '',
      linkedCategory: quote.catalog?.category ?? '',
    }));
  }

  function editFund(fund) {
    setForm({
      id: fund.id,
      name: fund.name,
      fundCode: fund.fundCode || '',
      amount: String(fund.amount),
      holdingProfit: hasValue(fund.holdingProfit) ? String(fund.holdingProfit) : '',
      holdingPercent: hasValue(fund.holdingPercent) ? String(fund.holdingPercent) : '',
      catalogId: fund.linkedCatalogId || null,
      linkedName: fund.linkedName,
      linkedCode: fund.linkedCode || '',
      linkedCategory: fund.linkedCategory || '',
      trackingRatio: String(fund.trackingRatio || 1),
      note: fund.note || '',
    });
    setActiveView('add');
  }

  function openAdjustment(fund, type = 'add') {
    setAdjustmentFundId(fund.id);
    setAdjustmentForm(createDefaultAdjustmentForm(type));
  }

  function closeAdjustment() {
    setAdjustmentFundId(null);
    setAdjustmentForm(createDefaultAdjustmentForm());
  }

  async function openDailyReturns(fund) {
    setDailyReturnFundId(fund.id);
    setDailyReturnData(null);
    setLoadingDailyReturns(true);
    setError('');
    try {
      const data = await request(`/api/funds/${fund.id}/daily-returns?limit=80`);
      setDailyReturnData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDailyReturns(false);
    }
  }

  function closeDailyReturns() {
    setDailyReturnFundId(null);
    setDailyReturnData(null);
    setLoadingDailyReturns(false);
  }

  async function saveFund(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        holdingProfit: optionalFormNumber(form.holdingProfit),
        holdingPercent: optionalFormNumber(form.holdingPercent),
        trackingRatio: Number(form.trackingRatio || 1),
      };
      if (form.id) {
        await request(`/api/funds/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await request('/api/funds', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setForm(defaultForm);
      await refreshFunds();
      setActiveView('holdings');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeFund(id) {
    setError('');
    try {
      await request(`/api/funds/${id}`, { method: 'DELETE' });
      await refreshFunds();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveAdjustment(event) {
    event.preventDefault();
    if (!adjustmentFund) return;

    setSavingAdjustment(true);
    setError('');
    try {
      await request(`/api/funds/${adjustmentFund.id}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({
          ...adjustmentForm,
          amount: Number(adjustmentForm.amount),
        }),
      });
      closeAdjustment();
      await refreshFunds();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function previewImport(file) {
    if (!file) return;

    setImporting(true);
    setError('');
    setImportPreview(null);
    setImportFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/import/preview', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || '解析失败');
      }
      setImportPreview(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function commitImport() {
    if (!importPreview) return;

    setCommittingImport(true);
    setError('');
    try {
      const result = await request('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          catalogRows: importPreview.catalog.rows,
          fundRows: importPreview.funds.rows,
        }),
      });
      setImportPreview({ ...importPreview, committed: result });
      await searchCatalog(query);
      await refreshFunds();
    } catch (err) {
      setError(err.message);
    } finally {
      setCommittingImport(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Funds Board</p>
          <h1>场外基金实时估算</h1>
        </div>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="summaryGrid">
        <Metric icon={<Wallet size={20} />} label="账户资产" value={currency.format(totalAmount)} />
        <Metric
          icon={totalActualProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          label="基金实际"
          value={signedCurrency(totalActualProfit)}
          detail={`${signedNumber(actualPercent)}%`}
          tone={totalActualProfit >= 0 ? 'up' : 'down'}
        />
        <Metric
          icon={<Link2 size={20} />}
          label="指数参考"
          value={signedCurrency(totalLinkedProfit)}
          detail={`${signedNumber(linkedPercent)}%`}
          tone={totalLinkedProfit >= 0 ? 'up' : 'down'}
        />
        <Metric
          icon={<Activity size={20} />}
          label="持有收益"
          value={signedCurrency(totalHoldingProfit)}
          detail={`${signedNumber(totalHoldingPercent)}%`}
          tone={totalHoldingProfit >= 0 ? 'up' : 'down'}
        />
      </section>

      <section className="appLayout">
        <aside className="sideNav" aria-label="应用菜单">
          <button
            className={activeView === 'holdings' ? 'active' : ''}
            onClick={() => setActiveView('holdings')}
          >
            <ListChecks size={18} />
            <span>
              <strong>持仓列表</strong>
              <small>{funds.length} 只基金</small>
            </span>
          </button>
          <button className={activeView === 'qdii' ? 'active' : ''} onClick={() => setActiveView('qdii')}>
            <Globe2 size={18} />
            <span>
              <strong>QDII 看板</strong>
              <small>{qdiiFunds.length} 只基金</small>
            </span>
          </button>
          <button className={activeView === 'add' ? 'active' : ''} onClick={() => setActiveView('add')}>
            <Plus size={18} />
            <span>
              <strong>搜索添加</strong>
              <small>{form.id ? '正在编辑持仓' : '录入或关联指数'}</small>
            </span>
          </button>
          <button className={activeView === 'import' ? 'active' : ''} onClick={() => setActiveView('import')}>
            <FileSpreadsheet size={18} />
            <span>
              <strong>导入数据</strong>
              <small>Excel 清单与持仓</small>
            </span>
          </button>
          <div className="sideStatus">
            <Database size={16} />
            <span>{health?.ok ? 'SQLite 持久化已启用' : '知识库连接中'}</span>
          </div>
        </aside>

        <div className="contentView">
          {activeView === 'holdings' ? (
            <section className="panel holdingsPanel">
              <div className="panelTitle toolbarTitle">
                <div>
                  <h2>持仓列表</h2>
                  <span>
                    {lastRefresh ? `行情刷新于 ${lastRefresh}` : `${funds.length} 只基金`}
                    {holdingQuery.trim() ? ` · 匹配 ${sortedFunds.length} 只` : ''}
                  </span>
                </div>
                <div className="holdingSearch">
                  <Search size={18} />
                  <input
                    value={holdingQuery}
                    onChange={(event) => setHoldingQuery(event.target.value)}
                    placeholder="搜索持有基金 / 代码 / 关联指数"
                  />
                  {holdingQuery ? (
                    <button type="button" onClick={() => setHoldingQuery('')} aria-label="清空持仓搜索">
                      清空
                    </button>
                  ) : null}
                </div>
                <div className="titleActions">
                  <button className="textButton" onClick={() => setActiveView('add')}>
                    <Plus size={16} />
                    新增
                  </button>
                  <button className="refreshButton" onClick={refreshFunds} disabled={loading}>
                    <RefreshCw size={17} className={loading ? 'spin' : ''} />
                    {loading ? '刷新中' : '刷新行情'}
                  </button>
                </div>
              </div>

              <div className="tableHead">
                {renderSortHeader('基金', 'amount', { subLabel: '持有金额' })}
                {renderSortHeader('基金实际收益', 'actualProfit', {
                  percentKey: 'actualPercent',
                  percentLabel: '实际涨跌率',
                })}
                {renderSortHeader('关联指数收益', 'linkedProfit', {
                  percentKey: 'linkedPercent',
                  percentLabel: '指数涨跌率',
                })}
                {renderSortHeader('持有收益', 'holdingProfit', {
                  percentKey: 'holdingPercent',
                  percentLabel: '持有收益率',
                })}
                <span>操作</span>
              </div>

              <div className="holdingsList">
                {funds.length === 0 ? (
                  <div className="emptyState">暂无持仓</div>
                ) : sortedFunds.length === 0 ? (
                  <div className="emptyState">没有匹配的持仓</div>
                ) : (
                  sortedFunds.map((fund) => (
                    <FundRow
                      key={fund.id}
                      fund={fund}
                      onAdjust={openAdjustment}
                      onDailyReturns={openDailyReturns}
                      onEdit={editFund}
                      onDelete={removeFund}
                    />
                  ))
                )}
              </div>
            </section>
          ) : activeView === 'qdii' ? (
            <section className="panel qdiiPanel">
              <div className="panelTitle toolbarTitle">
                <div>
                  <h2>QDII 看板</h2>
                  <span>{lastRefresh ? `行情刷新于 ${lastRefresh}` : `${qdiiFunds.length} 只基金`}</span>
                </div>
                <div className="titleActions">
                  <button className="refreshButton" onClick={refreshFunds} disabled={loading}>
                    <RefreshCw size={17} className={loading ? 'spin' : ''} />
                    {loading ? '刷新中' : '刷新行情'}
                  </button>
                </div>
              </div>

              <div className="qdiiSummaryGrid">
                <QdiiStat icon={<Wallet size={19} />} label="QDII 资产" value={currency.format(qdiiAmount)} />
                <QdiiStat
                  icon={qdiiActualProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                  label="今日更新的昨日收益"
                  value={signedCurrency(qdiiActualProfit)}
                  detail={`${signedNumber(qdiiActualPercent)}%`}
                  tone={qdiiActualProfit >= 0 ? 'up' : 'down'}
                />
                <QdiiStat
                  icon={<Globe2 size={20} />}
                  label="预计明日收益"
                  value={signedCurrency(qdiiExpectedProfit)}
                  detail={`${signedNumber(qdiiExpectedPercent)}%`}
                  tone={qdiiExpectedProfit >= 0 ? 'up' : 'down'}
                />
              </div>

              <div className="qdiiTableHead">
                {renderQdiiSortHeader('基金', 'amount', { subLabel: '持有金额' })}
                {renderQdiiSortHeader('昨日实际', 'actualProfit', {
                  percentKey: 'actualPercent',
                  percentLabel: '实际涨跌率',
                })}
                {renderQdiiSortHeader('明日预估', 'todayLinkedProfit', {
                  percentKey: 'todayLinkedPercent',
                  percentLabel: '指数涨跌率',
                })}
                {renderQdiiSortHeader('参考指数', 'linkedName', { subLabel: '关联标的' })}
              </div>

              <div className="qdiiList">
                {qdiiFunds.length === 0 ? (
                  <div className="emptyState">暂无 QDII 持仓</div>
                ) : (
                  sortedQdiiFunds.map((fund) => <QdiiRow key={fund.id} fund={fund} />)
                )}
              </div>
            </section>
          ) : activeView === 'import' ? (
            <ImportPanel
              fileName={importFileName}
              importing={importing}
              committing={committingImport}
              preview={importPreview}
              onFile={previewImport}
              onCommit={commitImport}
            />
          ) : (
            <section className="editorGrid">
              <section className="panel searchPanel">
                <div className="panelTitle">
                  <div>
                    <h2>搜索关联指数</h2>
                    <span>选择指数后会自动填入录入表单</span>
                  </div>
                </div>

                <div className="searchBar">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') searchQuote();
                    }}
                    placeholder="输入名称或代码"
                  />
                  <button onClick={searchQuote}>查询</button>
                </div>

                <div className="catalogList">
                  {catalog.map((item) => (
                    <button key={item.id} className="catalogItem" onClick={() => chooseCatalog(item)}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </span>
                      <code>{item.code}</code>
                    </button>
                  ))}
                </div>

                {quoteResults.length ? (
                  <div className="quoteStrip">
                    {quoteResults.map((quote) => (
                      <button key={quote.symbol} className="quoteItem" onClick={() => chooseQuote(quote)}>
                        <span>{quote.catalog?.name ?? quote.name}</span>
                        <strong className={quote.percent >= 0 ? 'up' : 'down'}>{signedNumber(quote.percent)}%</strong>
                        <small>
                          {quote.catalog?.code ?? quote.code} · {number.format(quote.current)}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>

              <aside className="panel inputPanel">
                <div className="panelTitle">
                  <div>
                    <h2>{form.id ? '编辑持仓' : '录入持仓'}</h2>
                    <span>{form.id ? '修改后保存会回到持仓列表' : '填写基金与持有金额'}</span>
                  </div>
                  {form.id ? (
                    <button className="textButton" onClick={() => setForm(defaultForm)}>
                      取消
                    </button>
                  ) : null}
                </div>

                <form className="fundForm" onSubmit={saveFund}>
                  <label>
                    基金名称
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="招商中证机器人ETF联接A"
                    />
                  </label>
                  <label>
                    基金代码
                    <input
                      value={form.fundCode}
                      onChange={(event) => setForm({ ...form, fundCode: event.target.value })}
                      placeholder="014880"
                    />
                  </label>
                  <label>
                    持有金额
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      placeholder="44748.06"
                    />
                  </label>
                  <div className="fieldGrid">
                    <label>
                      持有收益
                      <input
                        type="number"
                        step="0.01"
                        value={form.holdingProfit}
                        onChange={(event) => setForm({ ...form, holdingProfit: event.target.value })}
                        placeholder="5785.91"
                      />
                    </label>
                    <label>
                      持有收益率（%）
                      <input
                        type="number"
                        step="0.01"
                        value={form.holdingPercent}
                        onChange={(event) => setForm({ ...form, holdingPercent: event.target.value })}
                        placeholder="14.85"
                      />
                    </label>
                  </div>

                  <div className="linkedBox">
                    <div>
                      <span>关联指数</span>
                      <strong>{form.linkedName || '未选择'}</strong>
                    </div>
                    <code>{form.linkedCode || form.linkedCategory || '待选择'}</code>
                  </div>

                  <label>
                    估算系数
                    <input
                      type="number"
                      min="0.1"
                      step="0.01"
                      value={form.trackingRatio}
                      onChange={(event) => setForm({ ...form, trackingRatio: event.target.value })}
                    />
                  </label>
                  <label>
                    备注
                    <input
                      value={form.note}
                      onChange={(event) => setForm({ ...form, note: event.target.value })}
                      placeholder="可选"
                    />
                  </label>

                  <button className="primaryButton" disabled={saving}>
                    <Plus size={18} />
                    {saving ? '保存中' : form.id ? '保存修改' : '添加基金'}
                  </button>
                </form>
              </aside>
            </section>
          )}
        </div>
      </section>

      {adjustmentFund ? (
        <AdjustmentDialog
          fund={adjustmentFund}
          form={adjustmentForm}
          saving={savingAdjustment}
          onChange={setAdjustmentForm}
          onClose={closeAdjustment}
          onSubmit={saveAdjustment}
        />
      ) : null}

      {dailyReturnFund ? (
        <DailyReturnDialog
          fund={dailyReturnFund}
          data={dailyReturnData}
          loading={loadingDailyReturns}
          onClose={closeDailyReturns}
        />
      ) : null}
    </main>
  );
}

function Metric({ icon, label, value, detail, tone }) {
  return (
    <div className="metric">
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong className={tone || ''}>{value}</strong>
      {detail ? <small className={tone || ''}>{detail}</small> : null}
    </div>
  );
}

function QdiiStat({ icon, label, value, detail, tone }) {
  return (
    <div className="qdiiStat">
      <div className="qdiiStatIcon">{icon}</div>
      <span>{label}</span>
      <strong className={tone || ''}>{value}</strong>
      {detail ? <small className={tone || ''}>{detail}</small> : null}
    </div>
  );
}

function ImportPanel({ fileName, importing, committing, preview, onFile, onCommit }) {
  const validCatalogCount = preview ? preview.summary.catalog.create + preview.summary.catalog.update : 0;
  const validFundCount = preview ? preview.summary.funds.create + preview.summary.funds.update : 0;
  const validCount = validCatalogCount + validFundCount;
  const hasErrors = preview ? preview.summary.catalog.error + preview.summary.funds.error > 0 : false;

  return (
    <section className="panel importPanel">
      <div className="panelTitle toolbarTitle">
        <div>
          <h2>导入数据</h2>
          <span>上传一个 Excel 工作簿，支持“标的清单”和“基金持仓”两张表</span>
        </div>
      </div>

      <label className="uploadBox">
        <FileSpreadsheet size={28} />
        <span>
          <strong>{fileName || '选择 Excel 文件'}</strong>
          <small>支持 .xlsx / .xls；先预览，不会直接写入数据库</small>
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => onFile(event.target.files?.[0])}
        />
      </label>

      <div className="importGuide">
        <ImportGuideCard
          title="标的清单"
          fields="名称、代码、行情代码、分类、备注"
          detail="行情代码可选；不填时会按代码自动推导"
        />
        <ImportGuideCard
          title="基金持仓"
          fields="基金名称、基金代码、持有金额、关联代码、估算系数"
          detail="关联标的可引用同一文件里的标的清单"
        />
      </div>

      {importing ? <div className="importState">正在解析 Excel...</div> : null}

      {preview ? (
        <>
          <div className="importSummaryGrid">
            <ImportSummary title="标的清单" summary={preview.summary.catalog} />
            <ImportSummary title="基金持仓" summary={preview.summary.funds} />
            <div className={`importHealth ${hasErrors ? 'warn' : 'ok'}`}>
              {hasErrors ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
              <span>{hasErrors ? '存在错误行，确认时会跳过' : '预览通过，可以确认导入'}</span>
            </div>
          </div>

          <ImportTable title="标的清单预览" rows={preview.catalog.rows} columns={catalogImportColumns} />
          <ImportTable title="基金持仓预览" rows={preview.funds.rows} columns={fundImportColumns} />

          {preview.committed ? (
            <div className="commitResult">
              <CheckCircle2 size={18} />
              <span>
                已导入：标的新增 {preview.committed.catalog.created}、更新 {preview.committed.catalog.updated}；持仓新增{' '}
                {preview.committed.funds.created}、更新 {preview.committed.funds.updated}
              </span>
            </div>
          ) : null}

          <button className="primaryButton importCommitButton" onClick={onCommit} disabled={committing || validCount === 0}>
            <Upload size={18} />
            {committing ? '写入中' : `确认导入 ${validCount} 行`}
          </button>
        </>
      ) : null}
    </section>
  );
}

function ImportGuideCard({ title, fields, detail }) {
  return (
    <div className="importGuideCard">
      <strong>{title}</strong>
      <span>{fields}</span>
      <small>{detail}</small>
    </div>
  );
}

function ImportSummary({ title, summary }) {
  return (
    <div className="importSummary">
      <span>{title}</span>
      <strong>{summary.total}</strong>
      <small>
        新增 {summary.create} · 更新 {summary.update} · 错误 {summary.error}
      </small>
    </div>
  );
}

function ImportTable({ title, rows, columns }) {
  const visibleRows = rows.slice(0, 12);

  return (
    <section className="importPreviewBlock">
      <div className="importPreviewTitle">
        <strong>{title}</strong>
        <span>{rows.length ? `展示前 ${visibleRows.length} / ${rows.length} 行` : '未发现对应表'}</span>
      </div>
      {rows.length ? (
        <div className="importTableWrap">
          <table className="importTable">
            <thead>
              <tr>
                <th>状态</th>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={`${row.sheetName}-${row.rowNumber}`} className={row.status === 'error' ? 'hasError' : ''}>
                  <td>
                    <span className={`rowStatus ${row.status}`}>{statusLabel(row.status)}</span>
                  </td>
                  {columns.map((column) => (
                    <td key={column.key}>{formatImportValue(row[column.key])}</td>
                  ))}
                  <td>{row.errors?.join('；') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="emptyState compact">工作簿里没有匹配的表</div>
      )}
    </section>
  );
}

function FundRow({ fund, onAdjust, onDailyReturns, onEdit, onDelete }) {
  const quote = fund.quote;
  const fundQuote = fund.fundQuote;
  const actualTone = Number(fund.actualProfit || 0) >= 0 ? 'up' : 'down';
  const linkedTone = Number(fund.linkedProfit || 0) >= 0 ? 'up' : 'down';
  const holdingTone = Number(fund.holdingProfit || 0) >= 0 ? 'up' : 'down';

  return (
    <article className="fundRow">
      <div className="fundName">
        <strong>{fund.name}</strong>
        <span className="fundMetaLine">
          {fund.fundCode ? `${fund.fundCode} · ` : ''}
          {currency.format(fund.amount)}
        </span>
        {fund.amountUpdated ? <span className="updateBadge">当日已更新 · {fund.amountUpdatedTradeDate}</span> : null}
        {fund.pendingAdjustmentCount ? (
          <span className="pendingBadge">
            待同步 {fund.pendingAdjustmentCount} 笔 · {signedCurrency(fund.pendingAdjustmentAmount)}
          </span>
        ) : null}
      </div>
      <div className="profitCell">
        {fundQuote ? (
          <>
            <strong className={actualTone}>{signedCurrency(fund.actualProfit)}</strong>
            <span className={`profitPercent ${actualTone}`}>{signedNumber(fund.actualPercent)}%</span>
            <small>{fundQuote.date} 最新净值</small>
          </>
        ) : (
          <>
            <strong className="muted">待更新</strong>
            <span>需有效基金代码</span>
          </>
        )}
      </div>
      <div className="linkedCell referenceCell">
        <Link2 size={16} />
        <div className="linkedCellContent">
          <strong className={linkedTone}>{hasValue(fund.linkedProfit) ? signedCurrency(fund.linkedProfit) : '暂无行情'}</strong>
          {quote ? <span className={`profitPercent ${linkedTone}`}>{signedNumber(fund.linkedPercent)}%</span> : null}
          <small>
            {quote
              ? `${fund.linkedName} · ${fund.linkedCode ? `${fund.linkedCode} · ` : ''}${number.format(quote.current)} · ${
                  quote.qdiiLagged ? 'QDII同日参考' : quote.proxy ? '实时代理' : quote.realtime ? '实时' : '最近交易日'
                }`
              : '暂无行情'}
          </small>
        </div>
      </div>
      <div className="profitCell holdingCell">
        {hasValue(fund.holdingProfit) ? (
          <>
            <strong className={holdingTone}>{signedCurrency(fund.holdingProfit)}</strong>
            {hasValue(fund.holdingPercent) ? (
              <span className={`profitPercent ${holdingTone}`}>{signedNumber(fund.holdingPercent)}%</span>
            ) : (
              <span>收益率未录入</span>
            )}
          </>
        ) : (
          <>
            <strong className="muted">未录入</strong>
            <span>可在编辑中补充</span>
          </>
        )}
      </div>
      <div className="rowActions">
        <button className="iconButton" onClick={() => onDailyReturns(fund)} title="收益明细" aria-label="收益明细">
          <BarChart3 size={17} />
        </button>
        <button className="iconButton" onClick={() => onAdjust(fund)} title="加减仓" aria-label="加减仓">
          <Repeat2 size={17} />
        </button>
        <button className="iconButton" onClick={() => onEdit(fund)} title="编辑" aria-label="编辑">
          <Edit3 size={17} />
        </button>
        <button className="iconButton danger" onClick={() => onDelete(fund.id)} title="删除" aria-label="删除">
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

function AdjustmentDialog({ fund, form, saving, onChange, onClose, onSubmit }) {
  const isReduce = form.type === 'reduce';
  const effectiveDate = form.tradeDate ? (form.tradeTiming === 'after_15' ? addDays(form.tradeDate, 1) : form.tradeDate) : '';
  const amount = Number(form.amount || 0);
  const overReduce = isReduce && amount > Number(fund.amount || 0);

  return (
    <div className="dialogOverlay" role="presentation">
      <section className="adjustmentDialog" role="dialog" aria-modal="true" aria-label="同步加减仓">
        <div className="dialogHeader">
          <button className="iconButton ghost" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
          <div>
            <h2>修改持仓</h2>
            <span>{fund.name}</span>
          </div>
        </div>

        <div className="adjustmentFundCard">
          <div>
            <strong>{fund.name}</strong>
            <span>
              {fund.fundCode || '未录代码'} · {fund.linkedName}
            </span>
          </div>
          <code>{fund.linkedCode || fund.linkedCategory || '关联标的'}</code>
        </div>

        <div className="adjustmentStats">
          <div>
            <span>持有金额</span>
            <strong>{currency.format(fund.amount)}</strong>
          </div>
          <div>
            <span>持有收益</span>
            <strong className={Number(fund.holdingProfit || 0) >= 0 ? 'up' : 'down'}>
              {hasValue(fund.holdingProfit) ? signedCurrency(fund.holdingProfit) : '未录入'}
            </strong>
          </div>
          <div>
            <span>最新净值</span>
            <strong>{fund.fundQuote?.date || '待更新'}</strong>
          </div>
        </div>

        <form className="adjustmentForm" onSubmit={onSubmit}>
          <div className="segmentedControl" aria-label="加减仓类型">
            <button
              className={form.type === 'add' ? 'active add' : ''}
              type="button"
              onClick={() => onChange({ ...form, type: 'add' })}
            >
              <PlusCircle size={17} />
              同步加仓
            </button>
            <button
              className={form.type === 'reduce' ? 'active reduce' : ''}
              type="button"
              onClick={() => onChange({ ...form, type: 'reduce' })}
            >
              <MinusCircle size={17} />
              同步减仓
            </button>
          </div>

          <label>
            {isReduce ? '同步减仓金额' : '同步加仓金额'}
            <div className="moneyInput">
              <span>¥</span>
              <input
                autoFocus
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => onChange({ ...form, amount: event.target.value })}
                placeholder={isReduce ? '已卖出金额' : '已买入金额'}
              />
            </div>
          </label>

          <div className="fieldGrid">
            <label>
              {isReduce ? '原平台卖出日期' : '原平台买入日期'}
              <input
                type="date"
                value={form.tradeDate}
                onChange={(event) => onChange({ ...form, tradeDate: event.target.value })}
              />
            </label>
            <label>
              交易时间
              <select
                value={form.tradeTiming}
                onChange={(event) => onChange({ ...form, tradeTiming: event.target.value })}
              >
                <option value="before_15">下午3点前</option>
                <option value="after_15">下午3点后</option>
              </select>
            </label>
          </div>

          <div className="effectiveBox">
            <CalendarClock size={17} />
            <span>
              有效日：<strong>{effectiveDate || '待选择'}</strong>
            </span>
            <small>{form.tradeTiming === 'before_15' ? '当日生效' : '次日生效'}</small>
          </div>

          {overReduce ? <div className="inlineWarning">减仓金额不能大于当前持有金额</div> : null}

          {fund.adjustments?.length ? (
            <div className="adjustmentHistory">
              <span>最近同步记录</span>
              {fund.adjustments.slice(0, 4).map((adjustment) => (
                <div key={adjustment.id} className="adjustmentHistoryItem">
                  <strong className={adjustment.type === 'add' ? 'up' : 'down'}>
                    {adjustment.type === 'add' ? '+' : '-'}
                    {currency.format(adjustment.amount)}
                  </strong>
                  <small>
                    {adjustment.effectiveDate} · {adjustment.status === 'applied' ? '已同步' : '待生效'}
                  </small>
                </div>
              ))}
            </div>
          ) : null}

          <button className="primaryButton" disabled={saving || !amount || overReduce}>
            {saving ? '同步中' : '确认'}
          </button>
        </form>
      </section>
    </div>
  );
}

function DailyReturnDialog({ fund, data, loading, onClose }) {
  const rows = data?.returns ?? [];
  const totalProfit = data ? rows.reduce((sum, item) => sum + Number(item.profit || 0), 0) : 0;
  const maxAbsProfit = Math.max(1, ...rows.map((item) => Math.abs(Number(item.profit || 0))));

  return (
    <div className="dialogOverlay" role="presentation">
      <section className="dailyReturnDialog" role="dialog" aria-modal="true" aria-label="收益明细">
        <div className="dailyReturnHeader">
          <button className="iconButton ghost" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
          <div>
            <h2>收益明细</h2>
            <span>{fund.name}</span>
          </div>
        </div>

        <div className="dailyReturnHero">
          <span>累计收益(元)</span>
          <strong className={totalProfit >= 0 ? 'up' : 'down'}>{signedNumber(totalProfit)}</strong>
          <small>
            {fund.fundCode || '未录代码'} · {currency.format(fund.amount)}
          </small>
        </div>

        <div className="dailyReturnList">
          {loading ? (
            <div className="emptyState compact">正在加载收益明细</div>
          ) : rows.length === 0 ? (
            <div className="emptyState compact">暂无净值收益记录</div>
          ) : (
            rows.map((item) => <DailyReturnBar key={item.date} item={item} maxAbsProfit={maxAbsProfit} />)
          )}
        </div>
      </section>
    </div>
  );
}

function DailyReturnBar({ item, maxAbsProfit }) {
  const profit = Number(item.profit || 0);
  const tone = profit > 0 ? 'up' : profit < 0 ? 'down' : 'flat';
  const width = `${Math.max(36, Math.min(100, (Math.abs(profit) / maxAbsProfit) * 100))}%`;

  return (
    <div className="dailyReturnRow">
      <div className={`dailyReturnBar ${tone}`} style={{ width }}>
        <span>{item.date}</span>
        <strong>{number.format(profit)}</strong>
      </div>
      <small>{signedNumber(item.percent)}%</small>
    </div>
  );
}

function QdiiRow({ fund }) {
  const actualTone = Number(fund.actualProfit || 0) >= 0 ? 'up' : 'down';
  const expectedTone = Number(fund.todayLinkedProfit || 0) >= 0 ? 'up' : 'down';
  const quote = fund.quoteToday || fund.quote;

  return (
    <article className="qdiiRow">
      <div className="fundName">
        <strong>{fund.name}</strong>
        <span className="qdiiFundMeta">
          <span>{fund.fundCode || '未录代码'}</span>
          <strong>{currency.format(fund.amount)}</strong>
        </span>
        {fund.amountUpdated ? <span className="updateBadge">当日已更新 · {fund.amountUpdatedTradeDate}</span> : null}
      </div>
      <div className="profitCell">
        <strong className={actualTone}>{hasValue(fund.actualProfit) ? signedCurrency(fund.actualProfit) : '待更新'}</strong>
        {hasValue(fund.actualPercent) ? (
          <span className={`profitPercent ${actualTone}`}>{signedNumber(fund.actualPercent)}%</span>
        ) : null}
        <small>{fund.fundQuote?.date ? `${fund.fundQuote.date} 净值` : '净值待更新'}</small>
      </div>
      <div className="profitCell">
        <strong className={expectedTone}>
          {hasValue(fund.todayLinkedProfit) ? signedCurrency(fund.todayLinkedProfit) : '暂无行情'}
        </strong>
        {hasValue(fund.todayLinkedPercent) ? (
          <span className={`profitPercent ${expectedTone}`}>{signedNumber(fund.todayLinkedPercent)}%</span>
        ) : null}
        <small>关联行情估算</small>
      </div>
      <div className="linkedCellContent">
        <strong>{fund.linkedName}</strong>
        <small>
          {fund.linkedCode ? `${fund.linkedCode} · ` : ''}
          {quote ? `${number.format(quote.current)} · ${quote.realtime ? '实时' : '最近交易日'}` : '暂无行情'}
        </small>
      </div>
    </article>
  );
}

function filterFunds(funds, query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return funds;

  return funds.filter((fund) =>
    [fund.name, fund.fundCode, fund.linkedName, fund.linkedCode, fund.linkedCategory, fund.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
}

function isQdiiFund(fund) {
  const fields = [fund.name, fund.linkedCategory, fund.providerSymbol, fund.note].join(' ').toLowerCase();
  return fields.includes('qdii') || fields.includes('海外') || fields.includes('gb_');
}

function sortFunds(funds, sortKey, sortDirection) {
  const direction = sortDirection === 'asc' ? 1 : -1;
  return [...funds].sort((left, right) => {
    const leftValue = getSortValue(left, sortKey);
    const rightValue = getSortValue(right, sortKey);
    const leftHasValue = hasSortValue(leftValue);
    const rightHasValue = hasSortValue(rightValue);

    if (!leftHasValue && !rightHasValue) return Number(right.id || 0) - Number(left.id || 0);
    if (!leftHasValue) return 1;
    if (!rightHasValue) return -1;

    if (isTextSortValue(leftValue) || isTextSortValue(rightValue)) {
      const result = String(leftValue).localeCompare(String(rightValue), 'zh-CN');
      if (result !== 0) return result * direction;
      return Number(right.amount || 0) - Number(left.amount || 0);
    }

    const diff = Number(leftValue) - Number(rightValue);
    if (diff !== 0) return diff * direction;
    return Number(right.amount || 0) - Number(left.amount || 0);
  });
}

function getSortValue(fund, sortKey) {
  if (sortKey === 'actualProfit') return fund.actualProfit;
  if (sortKey === 'actualPercent') return fund.actualPercent;
  if (sortKey === 'linkedProfit') return fund.linkedProfit;
  if (sortKey === 'linkedPercent') return fund.linkedPercent;
  if (sortKey === 'todayLinkedProfit') return fund.todayLinkedProfit;
  if (sortKey === 'todayLinkedPercent') return fund.todayLinkedPercent;
  if (sortKey === 'holdingProfit') return fund.holdingProfit;
  if (sortKey === 'holdingPercent') return fund.holdingPercent;
  if (sortKey === 'linkedName') return fund.linkedName;
  return fund.amount;
}

function hasSortValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return Number.isFinite(Number(value));
}

function isTextSortValue(value) {
  return typeof value === 'string' && !Number.isFinite(Number(value));
}

function signedNumber(value) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? '+' : ''}${number.format(numeric)}`;
}

function signedCurrency(value) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? '+' : numeric < 0 ? '-' : ''}${currency.format(Math.abs(numeric))}`;
}

function statusLabel(status) {
  if (status === 'create') return '新增';
  if (status === 'update') return '更新';
  if (status === 'error') return '错误';
  return '跳过';
}

function formatImportValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return number.format(value);
  return String(value);
}

function currentSqlDate() {
  return formatSqlDate(new Date());
}

function addDays(sqlDate, days) {
  const date = new Date(`${sqlDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatSqlDate(date);
}

function formatSqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function percentFromEndingAmount(endingAmount, profit) {
  const amount = Number(endingAmount || 0);
  const profitValue = Number(profit || 0);
  const beginningAmount = amount - profitValue;
  return beginningAmount ? (profitValue / beginningAmount) * 100 : 0;
}

function hasValue(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function optionalFormNumber(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

createRoot(document.getElementById('root')).render(<App />);
