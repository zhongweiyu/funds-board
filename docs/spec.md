# 场外基金实时估算看板 Spec

最后更新：2026-05-17

## 1. 项目背景

场外基金通常不能在盘中获得实时净值，用户只能等基金公司或销售平台在收盘后更新估值或净值。本项目通过录入场外基金持仓，并为每只基金关联一个场内指数、ETF 或海外代理标的，实时估算当日涨跌，帮助用户在基金实际净值产出前了解大致盈亏。

核心目标是：

- 用户买的是场外基金，也能在交易日中看到接近实时的参考涨跌。
- 基金实际净值更新后，页面展示基于基金净值的准确收益。
- 基金实际净值更新到新的交易日后，自动把当日精确涨跌幅结算进当前持有金额。
- 所有基金持仓、关联标的、金额、持有收益、行情快照都必须持久化到 SQLite。
- 对 QDII 基金做单独口径处理：主列表看同日历史参考，QDII 看板看今日行情对明日收益的预估。

## 2. 范围

### 2.1 已实现范围

- 查询内置指数/ETF/海外代理标的知识库。
- 新增、编辑、删除场外基金持仓。
- 为基金设置关联标的、持有金额、估算系数、持有收益和持有收益率。
- 持仓列表展示：
  - 基金实际收益。
  - 关联指数参考收益。
  - 持有收益。
  - 搜索和列头排序。
- QDII 看板展示：
  - QDII 资产汇总。
  - 今日更新的昨日收益汇总。
  - 预计明日收益汇总。
  - QDII 基金明细和列头排序。
- SQLite 持久化：
  - 指数知识库。
  - 基金持仓。
  - 指数日 K/最新行情快照。
- 按基金最新净值日期自动结算持有金额，并标记当日已更新。
- 支持同步加仓和同步减仓，按原平台交易时间计算有效日并持久化流水。
- 支持上传一个 Excel 工作簿导入标的清单和基金持仓，导入前先预览校验。
- 手动刷新行情。

### 2.2 暂不覆盖范围

- 不做真实交易、申购、赎回、调仓。
- 不连接真实交易账号；加减仓只同步用户已在原平台完成的本金变动。
- 不做账号登录、多用户隔离。
- 不承诺场外基金盘中实时净值准确性。
- 不做复杂组合归因、行业暴露和回撤分析。
- 不做定时任务自动刷新；当前由页面刷新或手动刷新触发。

## 3. 用户场景

用户在支付宝、广发基金等平台持有多只场外基金。基金平台展示了当日收益、关联板块、持有收益等信息，但更新存在延迟。用户希望在本地应用中录入基金列表，并通过场内行情获得更及时的估算。

典型流程：

1. 用户进入应用，查看账户资产、基金实际收益、指数参考收益、持有收益。
2. 在持仓列表中搜索某只基金，查看实际收益和关联指数收益。
3. 页面加载或点击刷新行情，更新基金净值和场内行情。
4. 若基金净值日期是新的交易日，系统自动把该净值涨跌幅结算进持有金额，并显示 `当日已更新` 标签。
5. 在搜索添加页搜索指数或 ETF，录入新的场外基金。
6. 在 QDII 看板中查看 QDII 基金的昨日实际收益和明日预估收益。

## 4. 信息架构

### 4.1 顶部汇总

顶部展示四个核心指标：

- 账户资产：所有已录入基金的当前持有金额合计。
- 基金实际：基于基金最新净值涨跌率计算的当日收益汇总。
- 指数参考：基于关联标的涨跌率计算的参考收益汇总。
- 持有收益：用户录入或截图初始化的累计持有收益汇总；基金净值结算金额时同步累加已录入的累计持有收益。

### 4.2 左侧菜单

菜单顺序：

1. 持仓列表
2. QDII 看板
3. 搜索添加
4. 导入数据
5. SQLite 持久化状态

### 4.3 持仓列表

持仓列表用于日常查看所有基金。

能力：

- 搜索持有基金、基金代码、关联指数、关联代码、分类、备注。
- 刷新行情。
- 新增入口。
- 按列头排序：
  - 基金/持有金额。
  - 基金实际收益/实际涨跌率。
  - 关联指数收益/指数涨跌率。
  - 持有收益/持有收益率。
- 每行支持编辑和删除。
- 每行支持同步加仓、同步减仓。

展示字段：

- 基金名称。
- 基金代码。
- 持有金额。
- 基金实际收益金额和实际涨跌率。
- 基金净值日期。
- 金额已按最新净值结算时展示 `当日已更新` 标签。
- 关联指数收益金额和指数涨跌率。
- 关联标的名称、代码、当前值、行情状态。
- 持有收益金额和持有收益率。

### 4.4 QDII 看板

QDII 看板用于单独查看 QDII 基金。

汇总指标：

- QDII 资产。
- 今日更新的昨日收益：基于基金最新净值涨跌率计算。
- 预计明日收益：基于今日/latest 关联行情估算。

明细字段：

- 基金名称、基金代码、持有金额。
- 金额已按最新净值结算时展示 `当日已更新` 标签。
- 昨日实际收益、实际涨跌率、基金净值日期。
- 明日预估收益、指数涨跌率。
- 参考指数名称、代码、当前值、行情状态。

排序字段：

- 基金/持有金额。
- 昨日实际/实际涨跌率。
- 明日预估/指数涨跌率。
- 参考指数/关联标的。

### 4.5 搜索添加

搜索添加页用于选择关联标的并录入基金。

能力：

- 搜索内置指数/ETF/海外代理标的。
- 选择搜索结果后自动填充关联信息。
- 查询选中标的当前行情。
- 录入基金名称、基金代码、持有金额、持有收益、持有收益率、估算系数、备注。
- 保存到 SQLite。

### 4.6 导入数据

导入数据页用于从一个 Excel 工作簿批量导入标的清单和基金持仓。

推荐工作表：

- `标的清单`：名称、代码、行情代码、分类、备注。
- `基金持仓`：基金名称、基金代码、持有金额、持有收益、持有收益率、关联代码、关联名称、行情代码、估算系数、备注。

能力：

- 上传 `.xlsx` / `.xls`。
- 解析前端展示预览，不直接写库。
- 统计新增、更新和错误行。
- 标的清单按 `provider_symbol` 去重更新。
- 基金持仓按 `fund_code` 去重更新；没有重复基金代码时新增。
- 基金持仓的关联标的可以引用同一工作簿中的 `标的清单`。
- 常见 A 股、ETF 和指数代码可自动推导行情代码；海外、黄金、中证特殊标的可手填行情代码。

## 5. 数据模型

SQLite 文件位置：

```text
data/funds.sqlite
```

### 5.1 `index_catalog`

指数/ETF/海外代理标的知识库。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `name` | 用户可理解的标的名称 |
| `code` | 展示代码，如 `930997`、`NDX` |
| `provider_symbol` | 内部行情源代码，如 `csi930997`、`gb_ndx` |
| `category` | 标的类型，如中证指数、海外ETF代理、行业ETF |
| `note` | 备注 |
| `created_at` | 创建时间 |

`provider_symbol` 是内部字段，不要求用户直接感知。

### 5.2 `funds`

基金持仓表。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `name` | 基金名称 |
| `fund_code` | 基金代码 |
| `amount` | 当前持有金额，也就是收益后的金额 |
| `holding_profit` | 累计持有收益 |
| `holding_percent` | 累计持有收益率 |
| `amount_updated_trade_date` | 最近一次按基金净值结算金额的净值日期 |
| `amount_updated_percent` | 最近一次结算使用的基金净值涨跌率 |
| `amount_update_profit` | 最近一次结算带来的金额变动 |
| `amount_updated_at` | 最近一次结算写入时间 |
| `provider_symbol` | 关联标的内部代码 |
| `linked_name` | 关联标的展示名称 |
| `tracking_ratio` | 估算系数，默认 `1` |
| `note` | 备注 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

### 5.3 `fund_adjustments`

基金加减仓同步流水。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `fund_id` | 关联基金 |
| `adjustment_type` | `add` 或 `reduce` |
| `amount` | 同步本金金额 |
| `trade_date` | 原平台交易日期 |
| `trade_timing` | `before_15` 或 `after_15` |
| `effective_date` | 系统计算出的有效日 |
| `status` | `pending` 或 `applied` |
| `applied_at` | 实际写入持仓金额的时间 |
| `note` | 备注 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

### 5.4 `quote_snapshots`

行情快照表，主要用于 QDII 的历史口径和今日口径拆分。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `provider_symbol` | 关联标的内部代码 |
| `trade_date` | 交易日期 |
| `quote_kind` | `daily` 或 `latest` |
| `name` | 行情返回名称 |
| `code` | 行情返回代码 |
| `current` | 当前值或收盘值 |
| `change` | 涨跌额 |
| `percent` | 涨跌幅 |
| `volume` | 成交量 |
| `amount` | 成交额 |
| `source` | 行情来源 |
| `realtime` | 是否实时行情 |
| `raw_time` | 原始时间 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

唯一约束：

```text
(provider_symbol, trade_date, quote_kind)
```

## 6. 行情源和路由规则

### 6.1 场内/指数行情

由 `server/quotes.js` 负责。

| 标的类型 | `provider_symbol` 示例 | 行情源 |
| --- | --- | --- |
| A股实时标的 | `sh562500`、`sz159206` | 新浪财经实时行情 |
| 简单指数 | `s_sh000001`、`s_sz399260` | 新浪财经实时行情 |
| 黄金 | `sge_au9999` | 新浪财经黄金行情 |
| 中证指数 | `csi930997`、`csi930713` | 中证指数官网 |
| 中证失败代理 | `csi930997` -> `sh515030` | 新浪 ETF 代理 |
| 海外标的 | `gb_ndx`、`gb_eem`、`gb_vnm`、`gb_ixn` | 新浪海外行情 |

### 6.2 基金净值

由 `server/fundQuotes.js` 负责。

接口来源：

```text
https://api.fund.eastmoney.com/f10/lsjz
```

读取字段：

- `DWJZ`：单位净值。
- `LJJZ`：累计净值。
- `JZZZL`：净值增长率。
- `FSRQ`：净值日期。

## 7. 计算口径

### 7.1 收益金额计算

持有金额 `amount` 表示收益后的当前金额，因此不能直接使用：

```text
amount * percent / 100
```

正确口径：

```text
收益前金额 = 当前持有金额 / (1 + 涨跌幅 / 100)
收益金额 = 当前持有金额 * 涨跌幅 / (100 + 涨跌幅)
```

代码函数：

```text
profitFromEndingAmount(amount, percent)
```

### 7.2 基金实际收益

基金实际收益基于东方财富基金最新净值涨跌率：

```text
actualPercent = fundQuote.percent
actualProfit = profitFromEndingAmount(fund.amount, actualPercent)
```

刷新持仓时，如果基金净值日期晚于 `amount_updated_trade_date`，系统会把该涨跌幅结算进当前持有金额：

```text
本次结算收益 = 当前持有金额 * actualPercent / 100
新的持有金额 = 当前持有金额 + 本次结算收益
amount_updated_trade_date = fundQuote.date
```

结算触发条件：

- 基金代码为 6 位数字。
- 基金净值接口返回有效的净值日期和涨跌率。
- 基金净值日期晚于 `amount_updated_trade_date`。

幂等规则：

- 同一净值日期重复刷新不会再次结算。
- 如果行情源返回的净值日期早于或等于 `amount_updated_trade_date`，不回滚也不重算金额。
- 结算金额保留 2 位小数，结算涨跌率原样记录到 `amount_updated_percent`。

持有收益同步：

- 若 `holding_profit` 已录入，系统同步累加本次结算收益。
- 若同步后存在累计持有收益，`holding_percent` 按新的持有金额和累计持有收益反推。
- 若未录入 `holding_profit`，系统只更新 `amount` 和最近结算信息，不凭空生成累计持有收益。

展示用的 `actualProfit` 仍使用 `profitFromEndingAmount(fund.amount, actualPercent)`。因为 `amount` 在结算后已经是收益后的金额，该公式反推得到的实际收益与本次结算收益一致。

### 7.3 关联指数收益

非 QDII 基金：

```text
linkedPercent = quote.percent * trackingRatio
linkedProfit = profitFromEndingAmount(fund.amount, linkedPercent)
```

QDII 基金在主列表中使用同日参考口径，详见第 8 节。

### 7.4 持有收益

持有收益的初始值来自用户录入或截图初始化数据：

```text
holdingProfit = funds.holding_profit
holdingPercent = funds.holding_percent
```

当基金净值日期更新并触发持有金额结算时，如果 `holding_profit` 已存在，系统会把本次结算收益同步累加到 `holding_profit`，并重新计算 `holding_percent`。如果 `holding_profit` 为空，系统不会自动生成累计持有收益。

### 7.5 汇总百分比

汇总百分比同样基于收益后的总金额反推：

```text
收益前总金额 = 当前总金额 - 收益金额
汇总收益率 = 收益金额 / 收益前总金额 * 100
```

### 7.6 加减仓同步

加减仓只记录用户已经在原平台完成的操作，不触发真实交易。

有效日规则：

```text
下午 3 点前交易：trade_date 当日生效
下午 3 点后交易：trade_date 次日生效
```

应用规则：

- 新增流水时先写入 `fund_adjustments`，状态为 `pending`。
- 若基金有有效基金代码，系统等待有效日对应的基金净值结算完成后，再把本金变动写入 `funds.amount`。
- 加仓在有效日净值结算之后增加本金，因此不会被错误计入有效日当天涨跌。
- 减仓在有效日净值结算之后扣减本金，因此有效日前的持仓仍参与净值涨跌。
- 每条流水应用后标记为 `applied`，重复刷新不会再次应用。
- 本金变动不直接改变累计持有收益；若已录入持有收益，系统会基于新的持有金额反推持有收益率。

## 8. QDII 特殊规则

QDII 基金净值通常 T+1 更新。为了避免主列表把“昨日净值收益”和“今日海外行情”混在一起，应用拆成两套口径。

### 8.1 QDII 识别

满足任一条件即视为 QDII：

- 基金名称包含 `QDII`。
- 关联分类包含 `海外`。
- `provider_symbol` 包含 `gb_`。

### 8.2 主持仓列表口径

主列表展示的是和基金净值日期一致的关联指数收益。

规则：

1. 获取基金最新净值日期 `fundQuote.date`。
2. 从 `quote_snapshots` 的 `daily` 记录中查找同一交易日的关联标的涨跌幅。
3. 如果找不到同日记录，回退到最近的前一条日 K。
4. 计算 `linkedPercent` 和 `linkedProfit`。
5. 页面展示状态为 `QDII同日参考`。

示例：

```text
广发纳斯达克100ETF联接(QDII)F
基金净值日期：2026-05-14
主列表关联指数：纳斯达克100 2026-05-14 涨跌幅
```

### 8.3 QDII 看板口径

QDII 看板的“预计明日收益”使用今日/latest 关联行情。

规则：

```text
todayLinkedPercent = quoteToday.percent * trackingRatio
todayLinkedProfit = profitFromEndingAmount(fund.amount, todayLinkedPercent)
```

QDII 看板的“今日更新的昨日收益”仍使用基金实际净值涨跌率。

QDII 基金的持有金额结算仍以基金净值日期为准，不使用今日/latest 海外行情结算金额。今日/latest 海外行情只用于“预计明日收益”。

### 8.4 快照持久化

每次请求 `/api/funds` 时：

- 写入 `latest` 行情快照。
- 对 QDII 关联标的拉取日 K，写入 `daily` 快照。
- 读取已持久化的 `daily` 快照用于同日匹配。

## 9. API 规格

### 9.1 `GET /api/health`

返回服务状态和 SQLite 文件路径。

响应：

```json
{
  "ok": true,
  "dbPath": "data/funds.sqlite"
}
```

### 9.2 `GET /api/catalog?q=keyword`

搜索指数知识库。

匹配字段：

- `name`
- `code`
- `provider_symbol`
- `category`
- `note`

返回最多 50 条。

### 9.3 `GET /api/quotes`

查询行情。

支持两种参数：

```text
catalogIds=1,2,3
symbols=sh562500,csi930997
```

`catalogIds` 优先级高于 `symbols`。

### 9.4 `GET /api/funds`

返回基金持仓和实时计算字段。该接口同时承担刷新结算职责：当基金净值更新到新的净值日期时，会先把涨跌幅结算进 `funds.amount`，再返回最新持仓。

每条基金包含：

- 原始持仓字段。
- `quote`：主列表使用的关联行情。
- `quoteToday`：QDII 看板使用的今日/latest 行情。
- `quotePrevious`：QDII 同日参考行情。
- `fundQuote`：基金实际净值。
- `actualProfit`、`actualPercent`。
- `amountUpdated`、`amountUpdatedTradeDate`、`amountUpdateProfit`：金额是否已按最新净值结算及最近一次结算信息。
- `linkedProfit`、`linkedPercent`。
- `todayLinkedProfit`、`todayLinkedPercent`。
- `estimateProfit`、`estimatePercent`。

结算相关字段语义：

- `amountUpdated`：当前返回的基金净值日期是否等于 `amountUpdatedTradeDate`。
- `amountUpdatedTradeDate`：最近一次结算金额的基金净值日期。
- `amountUpdatedPercent`：最近一次结算使用的基金净值涨跌率。
- `amountUpdateProfit`：最近一次结算带来的持有金额变动。
- `amountUpdatedAt`：最近一次结算写入 SQLite 的时间。

### 9.5 `POST /api/funds`

新增基金。

请求体：

```json
{
  "name": "基金名称",
  "fundCode": "020481",
  "amount": 44748.06,
  "holdingProfit": 5785.91,
  "holdingPercent": 14.85,
  "catalogId": 1,
  "providerSymbol": "sh562500",
  "linkedName": "中证机器人",
  "trackingRatio": 1,
  "note": "备注"
}
```

当 `catalogId` 存在时，以知识库中的 `providerSymbol` 和 `name` 为准。

### 9.6 `PUT /api/funds/:id`

编辑基金。请求体同新增基金。

### 9.7 `DELETE /api/funds/:id`

删除基金。成功返回 `204`。

### 9.8 `POST /api/funds/:id/adjustments`

新增一条加减仓同步流水。

请求体：

```json
{
  "type": "add",
  "amount": 1000,
  "tradeDate": "2026-05-17",
  "tradeTiming": "before_15",
  "note": "可选备注"
}
```

字段说明：

- `type`：`add` 为加仓，`reduce` 为减仓。
- `tradeTiming`：`before_15` 当日生效，`after_15` 次日生效。
- `amount`：同步本金，必须大于 0；减仓金额不能大于当前持有金额。

### 9.9 `POST /api/import/preview`

上传 Excel 工作簿并返回导入预览，不写入 SQLite。

请求类型：

```text
multipart/form-data
file=<xlsx/xls>
```

响应包含：

- 工作表名称。
- 标的清单预览行。
- 基金持仓预览行。
- 新增、更新、错误统计。
- 每个错误行的错误原因。

### 9.10 `POST /api/import/commit`

确认写入导入预览中的有效行。

请求体：

```json
{
  "catalogRows": [],
  "fundRows": []
}
```

写入规则：

- 跳过预览状态为 `error` 的行。
- `index_catalog` 按 `provider_symbol` upsert。
- `funds` 按 `fund_code` 更新或新增。
- 整次写入在 SQLite transaction 中执行。

## 10. 前端状态和持久化偏好

前端使用 React state 管理页面状态。

本地浏览器持久化：

- `fundsBoardSortKey`
- `fundsBoardSortDirection`
- `fundsBoardQdiiSortKey`
- `fundsBoardQdiiSortDirection`

业务数据持久化：

- 统一写入 SQLite，不依赖浏览器本地存储。

## 11. 校验规则

新增/编辑基金时：

- 基金名称不能为空。
- 持有金额必须是大于等于 0 的数字。
- 必须选择或填写关联标的。
- 关联指数名称不能为空。
- 估算系数必须大于 0。
- 持有收益和持有收益率为空时可保存；非空时必须是有效数字。

## 12. 展示规则

颜色：

- 红色表示上涨或正收益。
- 绿色表示下跌或负收益。

数值：

- 金额使用人民币格式。
- 涨跌率显示正负号和百分号。
- 缺失行情展示 `暂无行情` 或 `待更新`。

文案：

- 基金实际列显示基金净值日期。
- 金额已按当前基金净值日期结算时显示 `当日已更新 · YYYY-MM-DD`。
- 普通实时行情显示 `实时`。
- 中证或历史行情显示 `最近交易日`。
- QDII 主列表历史口径显示 `QDII同日参考`。
- QDII 看板预计收益显示 `关联行情估算`。

## 13. 当前种子知识库

启动时会自动写入常用标的，包括：

- 宽基指数：上证指数、深证成指、创业板指、沪深300、中证500、中证1000、科创50。
- 主题指数/代理：中证新能源车、中证机器人、中证人工智能、国证商用卫星、医疗、先进制造。
- 商品：黄金9999。
- QDII/海外代理：纳斯达克100、新兴市场优选、越南指数、全球科技先锋、全球高端制造。
- 常用 ETF：证券ETF、创业板ETF、黄金ETF、新能源车ETF、人工智能ETF、通信ETF、芯片ETF。

## 14. 验收标准

### 14.1 持仓列表

- 能展示所有已录入基金。
- 刷新行情后更新实际收益和关联指数收益。
- 查询到新的基金净值日期后，持有金额会按基金涨跌幅自动更新。
- 同一基金净值日期重复刷新时，持有金额不会重复更新。
- 已按当前净值日期更新金额的基金展示 `当日已更新` 标签。
- 搜索基金名称、代码、关联指数均能过滤。
- 点击列头可排序，排序状态可保持。
- QDII 基金主列表关联指数使用基金净值日期对应的日 K 涨跌。

### 14.2 QDII 看板

- 仅展示 QDII 基金。
- `今日更新的昨日收益` 使用基金实际净值涨跌率。
- `预计明日收益` 使用今日/latest 关联行情。
- QDII 持有金额只按基金净值日期结算，不按今日/latest 海外行情结算。
- 明细和汇总金额一致。
- 列头排序可用。

### 14.3 搜索添加

- 搜索知识库可返回匹配标的。
- 选择标的后能自动填入关联信息。
- 保存后刷新页面数据不丢失。

### 14.4 导入数据

- 上传包含 `标的清单` 和 `基金持仓` 的 Excel 后能展示预览。
- 预览能统计新增、更新和错误行。
- 错误行能展示原因，确认导入时不会写入错误行。
- 同一工作簿内基金持仓可引用标的清单中的关联标的。
- 确认导入后刷新看板，新增或更新的基金持仓可见。

### 14.5 持久化

- 重启服务后，基金持仓仍存在。
- 指数知识库仍存在。
- QDII 行情快照可继续用于同日参考。
- `amount_updated_trade_date`、`amount_updated_percent`、`amount_update_profit`、`amount_updated_at` 随基金持仓持久化。
- 服务重启后，同一净值日期不会因为刷新再次结算持有金额。

## 15. 运行方式

安装依赖：

```bash
npm install
```

开发启动：

```bash
npm run dev
```

默认地址：

```text
前端：http://localhost:5173
后端：http://localhost:3001
```

生产构建：

```bash
npm run build
```

生产启动：

```bash
npm start
```

## 16. 后续可扩展方向

- 增加定时刷新和开盘时间识别。
- 支持多账户、多平台分组，例如支付宝、广发基金。
- 为基金增加份额、成本价、买入日期。
- 增加图表趋势和历史收益曲线。
- 增加手动导入截图或表格的解析能力。
- 增加行情源健康状态和接口失败降级提示。
