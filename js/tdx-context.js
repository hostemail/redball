(function (global) {
  'use strict';

  var CODE_PATTERN = /^\d{6}$/;
  var DEFAULT_INTERVAL_MS = 250;

  function safeDecodeHref(href) {
    var text = String(href || '');
    try {
      return decodeURI(text);
    } catch (_error) {
      return text;
    }
  }

  function cleanName(value) {
    var name = String(value || '').replace(/[\r\n\t]/g, ' ').trim();
    if (!name || name === 'STOCKNAME' || name.indexOf('####STOCKNAME') >= 0) {
      return '';
    }
    return name;
  }

  function parseHref(href) {
    var decoded = safeDecodeHref(href);
    var parts = decoded.split('##');
    var rawCode = parts.length > 1 ? String(parts[1] || '').trim() : '';
    var match = rawCode.match(/(?:^|\D)(\d{6})(?:\D|$)/);
    var code = match ? match[1] : '';
    if (!CODE_PATTERN.test(code) || code === '000000') {
      code = '';
    }

    var name = cleanName(parts.length > 2 ? parts[2] : '');
    return {
      code: code,
      name: name,
      ready: Boolean(code),
      signature: code + '|' + name,
      href: decoded
    };
  }

  function current() {
    return parseHref(global.location && global.location.href);
  }

  function watch(callback, intervalMs) {
    var stopped = false;
    var lastSignature = null;
    var delay = Math.max(100, Number(intervalMs) || DEFAULT_INTERVAL_MS);

    function tick() {
      if (stopped) {
        return;
      }
      var context = current();
      if (context.signature !== lastSignature) {
        lastSignature = context.signature;
        callback(context);
      }
    }

    tick();
    var timer = global.setInterval(tick, delay);
    return function stop() {
      stopped = true;
      global.clearInterval(timer);
    };
  }

  global.RedBallTdxContext = {
    parseHref: parseHref,
    current: current,
    watch: watch
  };
}(window));
