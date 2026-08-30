(function (global) {
  'use strict';

  var BUY_COLOR = '#ff3038';
  var SELL_COLOR = '#00d060';
  var PRICE_COLOR = '#eeeeee';
  var AVG_COLOR = '#e0d400';
  var BUCKET_ORDER = [
    '3000万以上',
    '2000-3000万',
    '1000-2000万',
    '800-1000万',
    '500-800万',
    '300-500万'
  ];

  function number(value) {
    var result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatAmount(value) {
    return Math.round(number(value)).toLocaleString('zh-CN');
  }

  function formatPercent(value) {
    var percent = number(value);
    if (Math.abs(percent) < 0.000001) {
      return '0.00%';
    }
    return (percent > 0 ? '+' : '') + percent.toFixed(2) + '%';
  }

  function priceToPercent(price, preClose) {
    var current = number(price);
    var base = number(preClose);
    return current > 0 && base > 0 ? (current / base - 1) * 100 : 0;
  }

  function buildSymmetricPercentAxis(minuteRows, rawPreClose) {
    var visiblePrices = [];
    (minuteRows || []).forEach(function (row) {
      var close = number(row && row.close);
      var avg = number(row && row.avg);
      if (close > 0) {
        visiblePrices.push(close);
      }
      if (avg > 0) {
        visiblePrices.push(avg);
      }
    });

    var preClose = number(rawPreClose);
    if (!(preClose > 0)) {
      preClose = visiblePrices.length ? visiblePrices[0] : 1;
    }

    var maxAbsPercent = 0;
    visiblePrices.forEach(function (price) {
      maxAbsPercent = Math.max(maxAbsPercent, Math.abs(priceToPercent(price, preClose)));
    });

    var displayAbsPercent = Math.max(0.5, maxAbsPercent);
    return {
      preClose: preClose,
      maxAbsPercent: maxAbsPercent,
      displayAbsPercent: displayAbsPercent,
      minimum: -displayAbsPercent,
      maximum: displayAbsPercent
    };
  }

  function clamp(value, minimum, maximum) {
    if (maximum < minimum) {
      return minimum;
    }
    return Math.max(minimum, Math.min(value, maximum));
  }

  function chooseDetailPosition(options) {
    var margin = 6;
    var hitX = number(options.hitX);
    var hitY = number(options.hitY);
    var width = Math.max(1, number(options.width));
    var height = Math.max(1, number(options.height));
    var plotLeft = number(options.plotLeft);
    var plotTop = number(options.plotTop);
    var plotRight = number(options.plotRight);
    var plotBottom = number(options.plotBottom);
    var ballRadius = Math.max(1, number(options.ballRadius));
    var minX = plotLeft + margin;
    var maxX = Math.max(minX, plotRight - width - margin);
    var minY = plotTop + margin;
    var maxY = Math.max(minY, plotBottom - height - margin);
    var availableWidth = Math.max(1, maxX - minX);
    var availableHeight = Math.max(1, maxY - minY);
    var candidates = [];
    var ix;
    var iy;

    for (ix = 0; ix < 9; ix += 1) {
      var edgeX = minX + availableWidth * ix / 8;
      candidates.push([edgeX, minY]);
      candidates.push([edgeX, maxY]);
    }
    for (iy = 1; iy < 7; iy += 1) {
      var edgeY = minY + availableHeight * iy / 7;
      candidates.push([minX, edgeY]);
      candidates.push([maxX, edgeY]);
    }
    candidates.push([hitX - width / 2, hitY - ballRadius - height - 14]);
    candidates.push([hitX - width / 2, hitY + ballRadius + 14]);
    candidates.push([hitX - ballRadius - width - 14, hitY - height / 2]);
    candidates.push([hitX + ballRadius + 14, hitY - height / 2]);

    candidates = candidates.map(function (item) {
      return [clamp(item[0], minX, maxX), clamp(item[1], minY, maxY)];
    });

    function pointInRect(point, x, y) {
      return point[0] >= x - 8 && point[0] <= x + width + 8 &&
        point[1] >= y - 8 && point[1] <= y + height + 8;
    }

    function scoreCandidate(item) {
      var x = item[0];
      var y = item[1];
      var score = 0;
      (options.pricePoints || []).forEach(function (point) {
        if (pointInRect(point, x, y)) {
          score += 900;
        }
      });
      (options.avgPoints || []).forEach(function (point) {
        if (pointInRect(point, x, y)) {
          score += 700;
        }
      });
      (options.otherBalls || []).forEach(function (itemBall) {
        var radius = Math.max(1, number(itemBall.r));
        if (itemBall.x >= x - radius && itemBall.x <= x + width + radius &&
            itemBall.y >= y - radius && itemBall.y <= y + height + radius) {
          score += 500;
        }
      });
      score += (Math.abs(x + width / 2 - hitX) + Math.abs(y + height / 2 - hitY)) / 700;
      var preferredY = options.preferBelow ? hitY + ballRadius + 12 : hitY - ballRadius - height - 12;
      if (options.isLimitUp && y < hitY) {
        score += 20;
      }
      if (options.isLimitDown && y > hitY) {
        score += 20;
      }
      score += Math.abs(y - preferredY) / 1500;
      return score;
    }

    var best = candidates[0] || [minX, minY];
    var bestScore = scoreCandidate(best);
    candidates.slice(1).forEach(function (item) {
      var itemScore = scoreCandidate(item);
      if (itemScore < bestScore) {
        best = item;
        bestScore = itemScore;
      }
    });
    return { left: best[0], top: best[1], score: bestScore };
  }

  function amountBucket(valueWan) {
    var value = number(valueWan);
    if (value >= 3000) {
      return '3000万以上';
    }
    if (value >= 2000) {
      return '2000-3000万';
    }
    if (value >= 1000) {
      return '1000-2000万';
    }
    if (value >= 800) {
      return '800-1000万';
    }
    if (value >= 500) {
      return '500-800万';
    }
    return '300-500万';
  }

  function bucketStats(rows) {
    var result = {};
    (rows || []).forEach(function (row) {
      var bucket = amountBucket(row.valueWan);
      if (!result[bucket]) {
        result[bucket] = { count: 0, amount: 0 };
      }
      result[bucket].count += 1;
      result[bucket].amount += number(row.valueWan);
    });
    return result;
  }

  function buildBalls(minuteRows, bigRows) {
    var priceByMinute = {};
    (minuteRows || []).forEach(function (row) {
      priceByMinute[row.time] = number(row.close);
    });

    var grouped = {};
    (bigRows || []).forEach(function (row) {
      var time = row.minute;
      if (!time) {
        return;
      }
      if (!grouped[time]) {
        grouped[time] = { time: time, buy: 0, sell: 0, details: [] };
      }
      var group = grouped[time];
      group.details.push(row);
      if (row.side === '买') {
        group.buy += number(row.valueWan);
      } else if (row.side === '卖') {
        group.sell += number(row.valueWan);
      }
    });

    return Object.keys(grouped).sort().map(function (time) {
      var item = grouped[time];
      var price = priceByMinute[time];
      if (!(price > 0)) {
        return null;
      }
      item.price = price;
      item.amount = Math.max(item.buy, item.sell);
      item.side = item.buy >= item.sell ? '买' : '卖';
      item.radius = Math.min(30, 7 + Math.sqrt(Math.max(item.amount, 1)) / 5.5);
      return item;
    }).filter(Boolean);
  }

  function totals(bigRows) {
    var buy = 0;
    var sell = 0;
    (bigRows || []).forEach(function (row) {
      if (row.side === '买') {
        buy += number(row.valueWan);
      } else if (row.side === '卖') {
        sell += number(row.valueWan);
      }
    });
    return { buy: buy, sell: sell, net: buy - sell };
  }

  function bigLotStats(code, bigRows) {
    var threshold = /^(300|301)/.test(String(code || '')) ? 2600 : 8000;
    var result = {
      threshold: threshold,
      buyCount: 0,
      sellCount: 0,
      buyAmount: 0,
      sellAmount: 0
    };
    (bigRows || []).forEach(function (row) {
      if (number(row.volume) <= threshold) {
        return;
      }
      if (row.side === '买') {
        result.buyCount += 1;
        result.buyAmount += number(row.valueWan);
      } else if (row.side === '卖') {
        result.sellCount += 1;
        result.sellAmount += number(row.valueWan);
      }
    });
    return result;
  }

  function RedBallChart(options) {
    this.chartElement = options.chartElement;
    this.detailPanel = options.detailPanel;
    this.emptyState = options.emptyState;
    this.codeElement = options.codeElement;
    this.nameElement = options.nameElement;
    this.dateElement = options.dateElement;
    this.buyElement = options.buyElement;
    this.sellElement = options.sellElement;
    this.netElement = options.netElement;
    this.detailConnector = global.document.getElementById('detail-connector');
    this.chart = global.echarts.init(this.chartElement, null, {
          renderer: 'canvas',
          devicePixelRatio: global.devicePixelRatio || 1
        });
    this.payload = null;
    this.percentAxis = null;
    this.gridBounds = { left: 64, right: 28, top: 24, bottom: 34 };
    this.balls = [];
    this.selectedBall = null;
    this.installEvents();
  }

  RedBallChart.prototype.installEvents = function () {
    var self = this;
    this.chart.on('click', function (params) {
      if (params && params.seriesName === '大单红球' && params.data && params.data.ball) {
        self.showDetail(params.data.ball);
      }
    });
    global.addEventListener('resize', function () {
      self.resize();
    });
  };

  RedBallChart.prototype.setIdentity = function (code, name, date) {
    this.codeElement.textContent = code || '等待代码';
    this.nameElement.textContent = name || '';
    this.dateElement.textContent = date || '';
  };

  RedBallChart.prototype.showEmpty = function (message, identity) {
    this.payload = null;
    this.percentAxis = null;
    this.balls = [];
    this.selectedBall = null;
    this.chart.clear();
    this.hideDetailConnector();
    this.detailPanel.className = 'detail-panel';
    this.detailPanel.innerHTML = '';
    this.emptyState.textContent = message || '暂无数据';
    this.emptyState.hidden = false;
    this.setIdentity(identity && identity.code, identity && identity.name, '');
    this.buyElement.textContent = '--';
    this.sellElement.textContent = '--';
    this.netElement.textContent = '--';
  };

  RedBallChart.prototype.render = function (payload, context) {
    this.payload = payload;
    this.balls = buildBalls(payload.minute, payload.big);
    this.hideDetailConnector();
    this.emptyState.hidden = true;
    this.setIdentity(payload.code, payload.name || context.name, payload.date);

    var sum = totals(payload.big);
    this.buyElement.textContent = formatAmount(sum.buy);
    this.sellElement.textContent = formatAmount(sum.sell);
    this.netElement.textContent = (sum.net < 0 ? '-' : '') + formatAmount(Math.abs(sum.net));

    var minuteRows = payload.minute || [];
    var percentAxis = buildSymmetricPercentAxis(minuteRows, payload.preClose);
    this.percentAxis = percentAxis;
    var largestBallRadius = this.balls.reduce(function (largest, ball) {
      return Math.max(largest, number(ball.radius));
    }, 0);
    this.gridBounds = {
      left: 64,
      right: 28,
      top: Math.max(24, Math.ceil(largestBallRadius + 4)),
      bottom: Math.max(34, Math.ceil(largestBallRadius + 4))
    };
    var minimum = percentAxis.minimum;
    var maximum = percentAxis.maximum;

    var self = this;
    var priceData = minuteRows.map(function (row) { return priceToPercent(row.close, percentAxis.preClose); });
    var avgData = minuteRows.map(function (row) { return priceToPercent(row.avg, percentAxis.preClose); });
    var times = minuteRows.map(function (row) { return row.time; });
    var scatterData = this.balls.map(function (ball) {
      return {
        value: [ball.time, priceToPercent(ball.price, percentAxis.preClose)],
        ball: ball,
        symbolSize: Math.max(14, ball.radius * 2),
        itemStyle: {
          color: ball.side === '买' ? BUY_COLOR : SELL_COLOR,
          borderColor: '#f5f5f5',
          borderWidth: 1
        }
      };
    });

    var option = {
      animation: false,
      backgroundColor: '#0d1117',
      grid: {
        left: this.gridBounds.left,
        right: this.gridBounds.right,
        top: this.gridBounds.top,
        bottom: this.gridBounds.bottom,
        containLabel: false
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(4, 7, 10, 0.96)',
        borderColor: '#425365',
        borderWidth: 1,
        textStyle: { color: '#e6edf3', fontSize: 12 },
        axisPointer: { type: 'cross', lineStyle: { color: '#5d6c79', width: 1 } },
        formatter: function (params) {
          return self.tooltipHtml(params);
        }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: '#3a4652' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#9aa6b2',
          fontFamily: 'Consolas',
          fontSize: 11,
          interval: 0,
          formatter: function (value, index) {
            var marks = { '09:30': 1, '10:30': 1, '11:30': 1, '13:00': 1, '14:00': 1, '15:00': 1 };
            return marks[value] || index === times.length - 1 ? value : '';
          }
        },
        splitLine: { show: true, interval: 39, lineStyle: { color: '#1d2832', width: 1 } }
      },
      yAxis: {
        type: 'value',
        min: Number(minimum.toFixed(4)),
        max: Number(maximum.toFixed(4)),
        splitNumber: 4,
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#3a4652' } },
        axisTick: { show: false },
        axisPointer: {
          label: {
            formatter: function (params) { return formatPercent(params.value); }
          }
        },
        axisLabel: {
          color: function (value) {
            if (Math.abs(value) < 0.000001) {
              return '#aab5c0';
            }
            return value > 0 ? '#ff646a' : '#26e384';
          },
          fontFamily: 'Consolas',
          fontSize: 11,
          formatter: function (value) { return formatPercent(value); }
        },
        splitLine: { show: true, lineStyle: { color: '#22303a', width: 1 } }
      },
      series: [
        {
          name: '分时价格',
          type: 'line',
          data: priceData,
          showSymbol: false,
          hoverAnimation: false,
          lineStyle: { color: PRICE_COLOR, width: 1.4 },
          itemStyle: { color: PRICE_COLOR },
          z: 2
        },
        {
          name: '分时均价',
          type: 'line',
          data: avgData,
          showSymbol: false,
          hoverAnimation: false,
          lineStyle: { color: AVG_COLOR, width: 1.2 },
          itemStyle: { color: AVG_COLOR },
          z: 2
        },
        {
          name: '大单红球',
          type: 'scatter',
          data: scatterData,
          clip: false,
          symbolSize: function (_value, params) {
            return params.data.symbolSize;
          },
          label: {
            show: true,
            position: 'inside',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontWeight: 'bold',
            fontSize: 11,
            formatter: function (params) {
              return params.data.ball.side === '买' ? 'B' : 'S';
            }
          },
          emphasis: { scale: 1.08 },
          z: 6
        }
      ]
    };

    this.chart.setOption(option, true);
    this.selectedBall = this.balls.length ? this.balls.slice().sort(function (left, right) {
      return right.amount - left.amount;
    })[0] : null;

    if (this.selectedBall) {
      global.setTimeout(function () {
        self.showDetail(self.selectedBall);
      }, 0);
    } else {
      this.hideDetailConnector();
      this.detailPanel.className = 'detail-panel';
      this.detailPanel.innerHTML = '';
    }
  };

  RedBallChart.prototype.tooltipHtml = function (params) {
    var rows = Array.isArray(params) ? params : [];
    if (!rows.length) {
      return '';
    }
    var html = '<strong>' + escapeHtml(rows[0].axisValue || '') + '</strong>';
    var ball = null;
    var minuteRows = (this.payload && this.payload.minute) || [];
    rows.forEach(function (item) {
      if (item.seriesName === '分时价格' && item.data != null) {
        var priceRow = minuteRows[item.dataIndex] || {};
        html += '<br><span style="color:' + PRICE_COLOR + '">价格 ' + number(priceRow.close).toFixed(2) + '　' + formatPercent(item.data) + '</span>';
      } else if (item.seriesName === '分时均价' && item.data != null) {
        var avgRow = minuteRows[item.dataIndex] || {};
        html += '<br><span style="color:' + AVG_COLOR + '">均价 ' + number(avgRow.avg).toFixed(2) + '　' + formatPercent(item.data) + '</span>';
      } else if (item.seriesName === '大单红球' && item.data && item.data.ball) {
        ball = item.data.ball;
      }
    });
    if (ball) {
      var color = ball.side === '买' ? BUY_COLOR : SELL_COLOR;
      html += '<br><span style="color:' + color + ';font-weight:700">' + escapeHtml(ball.side) + '方主导 ' + formatAmount(ball.amount) + '万</span>';
      html += '<br>买入 ' + formatAmount(ball.buy) + '万　卖出 ' + formatAmount(ball.sell) + '万　净额 ' + formatAmount(ball.buy - ball.sell) + '万';
    }
    return html;
  };

  RedBallChart.prototype.showDetail = function (ball) {
    if (!ball || !this.payload) {
      return;
    }
    this.selectedBall = ball;
    var buyRows = ball.details.filter(function (row) { return row.side === '买'; });
    var sellRows = ball.details.filter(function (row) { return row.side === '卖'; });
    var buyBuckets = bucketStats(buyRows);
    var sellBuckets = bucketStats(sellRows);
    var lot = bigLotStats(this.payload.code, this.payload.big);
    var bucketRows = BUCKET_ORDER.filter(function (bucket) {
      return buyBuckets[bucket] || sellBuckets[bucket];
    });
    var details = ball.details.slice().sort(function (left, right) {
      return right.valueWan - left.valueWan;
    });
    var mainClass = ball.side === '买' ? 'detail-main-buy' : 'detail-main-sell';

    var bucketHtml = '<span>金额分档</span><span class="bucket-buy">买方</span><span class="bucket-sell">卖方</span>';
    bucketRows.forEach(function (bucket) {
      var buy = buyBuckets[bucket] || { count: 0, amount: 0 };
      var sell = sellBuckets[bucket] || { count: 0, amount: 0 };
      bucketHtml += '<span>' + escapeHtml(bucket) + '</span>';
      bucketHtml += '<span class="bucket-buy">' + buy.count + '笔 ' + formatAmount(buy.amount) + '万</span>';
      bucketHtml += '<span class="bucket-sell">' + sell.count + '笔 ' + formatAmount(sell.amount) + '万</span>';
    });

    var detailHtml = details.map(function (row) {
      var sideClass = row.side === '买' ? 'buy' : 'sell';
      return '<div class="detail-row ' + sideClass + '">' +
        '<span>' + escapeHtml(row.time) + '</span>' +
        '<span>' + escapeHtml(row.side) + '</span>' +
        '<span>' + formatAmount(row.valueWan) + '万</span>' +
        '<span>' + formatAmount(row.volume) + '手</span>' +
        '</div>';
    }).join('');

    this.detailPanel.innerHTML =
      '<div class="detail-title"><span>' + escapeHtml(ball.time) + ' <span class="' + mainClass + '">' + escapeHtml(ball.side) + '方主导 ' + formatAmount(ball.amount) + '万</span></span><span>' + details.length + '笔</span></div>' +
      '<div class="detail-summary"><span>买入 ' + formatAmount(ball.buy) + '万</span><span>卖出 ' + formatAmount(ball.sell) + '万</span><span>净额 ' + formatAmount(ball.buy - ball.sell) + '万</span></div>' +
      '<div class="detail-section-title">全天大手笔 &gt;' + lot.threshold + '手</div>' +
      '<div class="lot-cards"><div class="lot-card buy">买 ' + lot.buyCount + '笔　' + formatAmount(lot.buyAmount) + '万</div><div class="lot-card sell">卖 ' + lot.sellCount + '笔　' + formatAmount(lot.sellAmount) + '万</div></div>' +
      '<div class="bucket-grid">' + bucketHtml + '</div>' +
      '<div class="detail-section-title">逐笔明细（共' + details.length + '笔）</div>' +
      '<div class="detail-list">' + detailHtml + '</div>';

    this.detailPanel.className = 'detail-panel is-visible' + (ball.side === '卖' ? ' is-sell' : '');
    this.positionDetail(ball);
  };

  RedBallChart.prototype.positionDetail = function (ball) {
    if (!ball || !this.detailPanel.classList.contains('is-visible')) {
      this.hideDetailConnector();
      return;
    }

    var point;
    var preClose = number(this.percentAxis && this.percentAxis.preClose) || number(this.payload && this.payload.preClose);
    var ballPercent = priceToPercent(ball.price, preClose);
    try {
      point = this.chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [ball.time, ballPercent]);
    } catch (_error) {
      point = [0, 0];
    }
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      this.hideDetailConnector();
      return;
    }

    this.detailPanel.style.left = '0px';
    this.detailPanel.style.right = 'auto';
    this.detailPanel.style.top = '0px';
    this.detailPanel.style.bottom = 'auto';

    var width = this.chartElement.clientWidth;
    var height = this.chartElement.clientHeight;
    var panelWidth = this.detailPanel.offsetWidth;
    var panelHeight = this.detailPanel.offsetHeight;
    var gridBounds = this.gridBounds || { left: 64, right: 28, top: 24, bottom: 34 };
    var plotLeft = gridBounds.left;
    var plotTop = gridBounds.top;
    var plotRight = Math.max(plotLeft + 1, width - gridBounds.right);
    var plotBottom = Math.max(plotTop + 1, height - gridBounds.bottom);
    var ballRadius = Math.max(7, number(ball.radius));
    var spaceAbove = Math.max(0, point[1] - ballRadius - plotTop - 8);
    var spaceBelow = Math.max(0, plotBottom - point[1] - ballRadius - 8);
    var isLimitUp = ballPercent >= 9.5;
    var isLimitDown = ballPercent <= -9.5;
    var preferBelow = isLimitUp ? true : (isLimitDown ? false : spaceBelow >= spaceAbove);
    var self = this;

    function linePoints(field) {
      var result = [];
      ((self.payload && self.payload.minute) || []).forEach(function (row) {
        var value = number(row[field]);
        if (!(value > 0)) {
          return;
        }
        try {
          var rowPoint = self.chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [row.time, priceToPercent(value, preClose)]);
          if (rowPoint && Number.isFinite(rowPoint[0]) && Number.isFinite(rowPoint[1])) {
            result.push(rowPoint);
          }
        } catch (_error) {
          // A chart resize can briefly make conversion unavailable; the next resize/refresh will retry.
        }
      });
      return result;
    }

    var otherBalls = [];
    this.balls.forEach(function (item) {
      if (item === ball) {
        return;
      }
      try {
        var itemPoint = self.chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [item.time, priceToPercent(item.price, preClose)]);
        if (itemPoint && Number.isFinite(itemPoint[0]) && Number.isFinite(itemPoint[1])) {
          otherBalls.push({ x: itemPoint[0], y: itemPoint[1], r: item.radius });
        }
      } catch (_error) {
        // Keep scoring with the remaining visible items.
      }
    });

    var position = chooseDetailPosition({
      hitX: point[0],
      hitY: point[1],
      width: panelWidth,
      height: panelHeight,
      plotLeft: plotLeft,
      plotTop: plotTop,
      plotRight: plotRight,
      plotBottom: plotBottom,
      ballRadius: ballRadius,
      preferBelow: preferBelow,
      isLimitUp: isLimitUp,
      isLimitDown: isLimitDown,
      pricePoints: linePoints('close'),
      avgPoints: linePoints('avg'),
      otherBalls: otherBalls
    });

    this.detailPanel.style.left = Math.round(position.left) + 'px';
    this.detailPanel.style.top = Math.round(position.top) + 'px';
    this.drawDetailConnector(point, position.left, position.top, panelWidth, panelHeight, ballRadius, ball.side);
  };

  RedBallChart.prototype.hideDetailConnector = function () {
    if (this.detailConnector) {
      var context = this.detailConnector.getContext && this.detailConnector.getContext('2d');
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, this.detailConnector.width, this.detailConnector.height);
      }
      this.detailConnector.classList.remove('is-visible');
    }
  };

  RedBallChart.prototype.drawDetailConnector = function (point, boxLeft, boxTop, boxWidth, boxHeight, ballRadius, side) {
    if (!this.detailConnector || !this.detailConnector.getContext) {
      return;
    }
    var ballX = point[0];
    var ballY = point[1];
    var targetX = clamp(ballX, boxLeft, boxLeft + boxWidth);
    var targetY = clamp(ballY, boxTop, boxTop + boxHeight);
    var dx = ballX - targetX;
    var dy = ballY - targetY;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (!(distance > 2)) {
      this.hideDetailConnector();
      return;
    }

    var unitX = dx / distance;
    var unitY = dy / distance;
    var startX = targetX + unitX * 2;
    var startY = targetY + unitY * 2;
    var endInset = Math.min(ballRadius * 0.7, distance / 2);
    var endX = ballX - unitX * endInset;
    var endY = ballY - unitY * endInset;
    var arrowLength = 10;
    var arrowHalfWidth = 4;
    var baseX = endX - unitX * arrowLength;
    var baseY = endY - unitY * arrowLength;
    var perpendicularX = -unitY;
    var perpendicularY = unitX;
    var color = side === '买' ? BUY_COLOR : SELL_COLOR;
    var cssWidth = Math.max(1, this.chartElement.clientWidth);
    var cssHeight = Math.max(1, this.chartElement.clientHeight);
    var pixelRatio = Math.max(1, number(global.devicePixelRatio) || 1);
    var backingWidth = Math.round(cssWidth * pixelRatio);
    var backingHeight = Math.round(cssHeight * pixelRatio);
    if (this.detailConnector.width !== backingWidth || this.detailConnector.height !== backingHeight) {
      this.detailConnector.width = backingWidth;
      this.detailConnector.height = backingHeight;
    }
    this.detailConnector.style.width = cssWidth + 'px';
    this.detailConnector.style.height = cssHeight + 'px';

    var context = this.detailConnector.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    if (context.setLineDash) {
      context.setLineDash([5, 3]);
    }
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    if (context.setLineDash) {
      context.setLineDash([]);
    }
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(endX, endY);
    context.lineTo(baseX + perpendicularX * arrowHalfWidth, baseY + perpendicularY * arrowHalfWidth);
    context.lineTo(baseX - perpendicularX * arrowHalfWidth, baseY - perpendicularY * arrowHalfWidth);
    context.closePath();
    context.fill();
    this.detailConnector.classList.add('is-visible');
  };

  RedBallChart.prototype.resize = function () {
    this.chart.resize();
    if (this.selectedBall) {
      this.positionDetail(this.selectedBall);
    }
  };

  global.RedBallChart = RedBallChart;
  global.RedBallChartCore = {
    amountBucket: amountBucket,
    bucketStats: bucketStats,
    buildBalls: buildBalls,
    buildSymmetricPercentAxis: buildSymmetricPercentAxis,
    chooseDetailPosition: chooseDetailPosition,
    priceToPercent: priceToPercent,
    totals: totals,
    bigLotStats: bigLotStats
  };
}(window));
