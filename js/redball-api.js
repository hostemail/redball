(function (global) {
  'use strict';

  var MIN_BIG_AMOUNT_WAN = 300;
  var MINUTE_HOSTS = [
    'push2his.eastmoney.com',
    'push2hisdelay.eastmoney.com',
    'push2delay.eastmoney.com'
  ];
  var THS_BIG_URL = 'https://vaserviece.10jqka.com.cn/Level2/index.php?op=mainMonitorDetail&stockcode=';

  function toNumber(value, fallback) {
    var text = String(value == null ? '' : value).replace(/,/g, '').trim();
    var number = Number(text);
    return Number.isFinite(number) ? number : (fallback == null ? 0 : fallback);
  }

  function parseMoneyWan(value) {
    var text = String(value == null ? '' : value).replace(/,/g, '').trim();
    var match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return 0;
    }
    var number = Number(match[0]);
    if (text.indexOf('亿') >= 0) {
      return number * 10000;
    }
    if (text.indexOf('万') >= 0) {
      return number;
    }
    return number / 10000;
  }

  function parseVolume(value) {
    var match = String(value == null ? '' : value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function sideOf(item) {
    var tradeType = String(item && item.tradetype || '');
    var nature = String(item && item.nature || '');
    if (tradeType === '1' || nature.indexOf('买') >= 0) {
      return '买';
    }
    if (tradeType === '2' || nature.indexOf('卖') >= 0) {
      return '卖';
    }
    return '未知';
  }

  function hhmm(value) {
    var match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return match ? ('0' + Number(match[1])).slice(-2) + ':' + match[2] : '';
  }

  function secid(code) {
    return /^(6|9|11)/.test(code) ? '1.' + code : '0.' + code;
  }

  function requestText(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var completed = false;

      function fail(message) {
        if (completed) {
          return;
        }
        completed = true;
        reject(new Error(message));
      }

      xhr.open('GET', url, true);
      xhr.timeout = Math.max(1000, Number(timeoutMs) || 8000);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || completed) {
          return;
        }
        if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) {
          completed = true;
          resolve(xhr.responseText);
          return;
        }
        fail('HTTP ' + xhr.status + ' ' + url);
      };
      xhr.onerror = function () {
        fail('网络或 CORS 错误: ' + url);
      };
      xhr.ontimeout = function () {
        fail('请求超时: ' + url);
      };
      xhr.send(null);
    });
  }

  function parseJsonLoose(text, source) {
    var body = String(text || '').replace(/^\uFEFF/, '').trim();
    try {
      return JSON.parse(body);
    } catch (firstError) {
      var start = body.indexOf('{');
      var end = body.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(body.slice(start, end + 1));
        } catch (_secondError) {
          // Preserve the first useful failure below.
        }
      }
      throw new Error((source || '响应') + '不是有效 JSON: ' + firstError.message);
    }
  }

  function requestJson(url, timeoutMs, source) {
    return requestText(url, timeoutMs).then(function (text) {
      return parseJsonLoose(text, source);
    });
  }

  function isTradingMinute(value) {
    var text = hhmm(value);
    if (!text) {
      return false;
    }
    var parts = text.split(':');
    var total = Number(parts[0]) * 60 + Number(parts[1]);
    return (total >= 570 && total <= 690) || (total >= 780 && total <= 900);
  }

  function parseMinuteData(payload) {
    var data = payload && payload.data;
    if (!data || !Array.isArray(data.trends)) {
      throw new Error('东方财富分时响应缺少 data.trends');
    }

    var rows = [];
    var lastVolume = 0;
    var lastAmount = 0;
    var tradeDate = '';
    data.trends.forEach(function (raw) {
      var parts = String(raw || '').split(',');
      if (parts.length < 8) {
        return;
      }
      var dateTime = parts[0];
      var split = dateTime.split(' ');
      var time = hhmm(split.length > 1 ? split[1] : dateTime);
      if (!isTradingMinute(time)) {
        return;
      }
      var close = toNumber(parts[2], NaN);
      if (!Number.isFinite(close)) {
        return;
      }
      var volume = toNumber(parts[5], 0);
      var amount = toNumber(parts[6], 0);
      rows.push({
        time: time,
        open: toNumber(parts[1], close),
        close: close,
        high: toNumber(parts[3], close),
        low: toNumber(parts[4], close),
        volume: Math.max(0, volume - lastVolume),
        amount: Math.max(0, amount - lastAmount),
        avg: toNumber(parts[7], close)
      });
      lastVolume = volume;
      lastAmount = amount;
      if (!tradeDate && split[0]) {
        tradeDate = split[0].replace(/-/g, '');
      }
    });

    if (!rows.length) {
      throw new Error('东方财富分时响应没有盘中数据');
    }

    return {
      code: String(data.code || ''),
      name: String(data.name || ''),
      preClose: toNumber(data.preClose, 0),
      date: tradeDate,
      minute: rows
    };
  }

  function fetchMinute(code, timeoutMs) {
    var query = [
      'secid=' + encodeURIComponent(secid(code)),
      'fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
      'fields2=f51,f52,f53,f54,f55,f56,f57,f58',
      'ndays=1',
      'iscr=0',
      'iscca=0',
      '_=' + Date.now()
    ].join('&');
    var index = 0;
    var errors = [];

    function tryNext() {
      if (index >= MINUTE_HOSTS.length) {
        throw new Error('东方财富分时请求全部失败: ' + errors.join(' | '));
      }
      var host = MINUTE_HOSTS[index++];
      var url = 'https://' + host + '/api/qt/stock/trends2/get?' + query;
      return requestJson(url, timeoutMs, host).then(function (payload) {
        var parsed = parseMinuteData(payload);
        parsed.source = host;
        return parsed;
      }).catch(function (error) {
        errors.push(host + ': ' + error.message);
        return tryNext();
      });
    }

    return tryNext();
  }

  function parseBigOrderData(payload, minAmountWan) {
    var list = payload && payload.list;
    if (!Array.isArray(list)) {
      throw new Error('同花顺大单响应缺少 list');
    }
    var threshold = Number(minAmountWan) || MIN_BIG_AMOUNT_WAN;
    return list.map(function (item) {
      return {
        time: String(item && item.ctime || '').slice(0, 8),
        minute: hhmm(item && item.ctime),
        side: sideOf(item || {}),
        valueWan: parseMoneyWan(item && item.value),
        volume: parseVolume(item && item.volume),
        nature: String(item && item.nature || ''),
        rawValue: String(item && item.value || ''),
        rawVolume: String(item && item.volume || '')
      };
    }).filter(function (item) {
      return item.minute && item.valueWan > threshold && (item.side === '买' || item.side === '卖');
    }).sort(function (left, right) {
      return left.time.localeCompare(right.time);
    });
  }

  function fetchBigOrders(code, minAmountWan, timeoutMs) {
    var url = THS_BIG_URL + encodeURIComponent(code) + '&_=' + Date.now();
    return requestJson(url, timeoutMs, '同花顺大单').then(function (payload) {
      return {
        rows: parseBigOrderData(payload, minAmountWan),
        source: 'vaserviece.10jqka.com.cn'
      };
    });
  }

  function fetchLive(code, timeoutMs) {
    if (!/^\d{6}$/.test(String(code || ''))) {
      return Promise.reject(new Error('股票代码不是 6 位数字'));
    }
    return Promise.all([
      fetchMinute(code, timeoutMs || 8000),
      fetchBigOrders(code, MIN_BIG_AMOUNT_WAN, timeoutMs || 8000)
    ]).then(function (results) {
      return {
        code: code,
        name: results[0].name,
        date: results[0].date,
        preClose: results[0].preClose,
        minute: results[0].minute,
        big: results[1].rows,
        sources: {
          minute: results[0].source,
          big: results[1].source
        }
      };
    });
  }

  global.RedBallApi = {
    MIN_BIG_AMOUNT_WAN: MIN_BIG_AMOUNT_WAN,
    MINUTE_HOSTS: MINUTE_HOSTS.slice(),
    parseMoneyWan: parseMoneyWan,
    parseMinuteData: parseMinuteData,
    parseBigOrderData: parseBigOrderData,
    fetchMinute: fetchMinute,
    fetchBigOrders: fetchBigOrders,
    fetchLive: fetchLive
  };
}(window));
