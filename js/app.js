(function (global) {
  'use strict';

  var CONTEXT_POLL_MS = 250;
  var TICK_MS = 250;
  var TRADING_REFRESH_MS = 3000;
  var AFTER_CLOSE_REFRESH_MS = 10000;
  var REQUEST_TIMEOUT_MS = 8000;

  var elements = {
    chart: document.getElementById('chart'),
    detailPanel: document.getElementById('detail-panel'),
    emptyState: document.getElementById('empty-state'),
    code: document.getElementById('stock-code'),
    name: document.getElementById('stock-name'),
    date: document.getElementById('trade-date'),
    buy: document.getElementById('buy-total'),
    sell: document.getElementById('sell-total'),
    net: document.getElementById('net-total'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    sourceText: document.getElementById('source-text')
  };

  var chart = new global.RedBallChart({
    chartElement: elements.chart,
    detailPanel: elements.detailPanel,
    emptyState: elements.emptyState,
    codeElement: elements.code,
    nameElement: elements.name,
    dateElement: elements.date,
    buyElement: elements.buy,
    sellElement: elements.sell,
    netElement: elements.net
  });

  var state = {
    context: { code: '', name: '', signature: '' },
    loading: false,
    requestSequence: 0,
    nextRefreshAt: 0,
    stopContextWatch: null,
    tickTimer: null
  };

  function setStatus(kind, text, source) {
    elements.statusDot.className = 'status-dot status-' + kind;
    elements.statusText.textContent = text || '';
    elements.sourceText.textContent = source || '';
  }

  function isTradingTime(now) {
    var current = now || new Date();
    if (current.getDay() === 0 || current.getDay() === 6) {
      return false;
    }
    var minute = current.getHours() * 60 + current.getMinutes();
    return (minute >= 570 && minute <= 690) || (minute >= 780 && minute < 900);
  }

  function refreshDelay() {
    return isTradingTime() ? TRADING_REFRESH_MS : AFTER_CLOSE_REFRESH_MS;
  }

  function resetForContext(context) {
    chart.showEmpty('正在读取 ' + context.code + ' 的当天实时分时…', context);
    setStatus('loading', context.code + ' 首次加载中', '');
  }

  function applyContext(context) {
    if (!context.ready) {
      state.requestSequence += 1;
      state.loading = false;
      state.context = context;
      state.nextRefreshAt = 0;
      chart.showEmpty('等待通达信通过 ##代码##名称 传入当前股票…', context);
      setStatus('waiting', '等待通达信传入股票代码', '');
      return;
    }

    var codeChanged = context.code !== state.context.code;
    state.context = context;
    if (codeChanged) {
      state.requestSequence += 1;
      state.loading = false;
      resetForContext(context);
      refresh(true);
    } else {
      chart.setIdentity(context.code, context.name, elements.date.textContent);
    }
  }

  function refresh(force) {
    var context = state.context;
    if (!context.ready || state.loading) {
      return;
    }
    if (!force && Date.now() < state.nextRefreshAt) {
      return;
    }

    state.loading = true;
    var sequence = ++state.requestSequence;
    var code = context.code;
    setStatus('loading', code + ' 正在刷新当天大单…', '');

    global.RedBallApi.fetchLive(code, REQUEST_TIMEOUT_MS).then(function (payload) {
      if (sequence !== state.requestSequence || code !== state.context.code) {
        return;
      }
      payload.name = payload.name || state.context.name;
      chart.render(payload, state.context);
      var stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      var mode = isTradingTime() ? '3秒刷新' : '盘后10秒刷新';
      var source = '分时 ' + payload.sources.minute + ' / 大单 ' + payload.sources.big;
      setStatus('ok', payload.code + ' ' + (payload.name || '') + '  大单 ' + payload.big.length + '条  ' + mode + '  ' + stamp, source);
    }).catch(function (error) {
      if (sequence !== state.requestSequence || code !== state.context.code) {
        return;
      }
      setStatus('error', code + ' 实时请求失败：' + error.message, '将自动重试');
    }).then(function () {
      if (sequence !== state.requestSequence || code !== state.context.code) {
        return;
      }
      state.loading = false;
      state.nextRefreshAt = Date.now() + refreshDelay();
    });
  }

  function tick() {
    if (state.context.ready && !state.loading && Date.now() >= state.nextRefreshAt) {
      refresh(false);
    }
  }

  function start() {
    state.stopContextWatch = global.RedBallTdxContext.watch(applyContext, CONTEXT_POLL_MS);
    state.tickTimer = global.setInterval(tick, TICK_MS);
  }

  function stop() {
    if (state.stopContextWatch) {
      state.stopContextWatch();
    }
    if (state.tickTimer) {
      global.clearInterval(state.tickTimer);
    }
    state.requestSequence += 1;
  }

  global.addEventListener('beforeunload', stop);
  start();
}(window));
