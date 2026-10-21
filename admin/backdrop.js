// Animated chart backdrop: a live chart in the top-right corner (candles follow
// a random walk, the last one ticks like a live market, then a new one opens and
// the chart slides left), single candles floating in the side margins, and a
// few glowing waves with a spark running along them. Pauses when the tab is hidden; reduced motion
// gets one still frame.
(function () {
  var host = document.querySelector(".backdrop");
  if (!host || !window.requestAnimationFrame) return;

  var canvas = document.createElement("canvas");
  host.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var width = 0, height = 0;
  var charts = [];
  var running = false;

  var STEP = 21;         // px between candles
  var BODY = 11;         // candle body width
  var floaters = [];     // single big candles that fade in and out at random places
  var nextFloater = 0;
  var CANDLE_MS = 2400;  // how long a candle stays "live"
  var SLIDE_MS = 700;

  var waves = [
    { y: 0.30, amp: 30, k: 0.0040, speed: 0.00022, alpha: 0.11, spark: 0.06 },
    { y: 0.66, amp: 44, k: 0.0030, speed: -0.00016, alpha: 0.08, spark: 0.045 }
  ];

  function gauss() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  // One closed candle, picking a shape so the chart has the usual mix:
  // regular bars, dojis, hammers, shooting stars and full-body marubozus.
  function makeCandle(open, vol) {
    var r = Math.random();
    var move = gauss() * vol;
    var close, upper, lower;
    if (r < 0.12) {                       // doji
      close = open + gauss() * vol * 0.06;
      upper = vol * (0.3 + Math.random() * 0.6);
      lower = vol * (0.3 + Math.random() * 0.6);
    } else if (r < 0.22) {                // hammer
      close = open + Math.abs(move) * 0.4;
      upper = vol * 0.08 * Math.random();
      lower = Math.abs(move) * 1.4 + vol * 0.5;
    } else if (r < 0.32) {                // shooting star
      close = open - Math.abs(move) * 0.4;
      upper = Math.abs(move) * 1.4 + vol * 0.5;
      lower = vol * 0.08 * Math.random();
    } else if (r < 0.42) {                // marubozu
      close = open + move * 1.6;
      upper = 0;
      lower = 0;
    } else {                              // regular
      close = open + move;
      upper = vol * Math.random() * 0.6;
      lower = vol * Math.random() * 0.6;
    }
    return {
      o: open, c: close,
      h: Math.max(open, close) + upper,
      l: Math.min(open, close) - lower
    };
  }

  // A live chart that floats: it fades in at area, drifts slowly while it
  // keeps ticking, then fades out and a new one appears somewhere else.
  function makeChart(area, now) {
    var band = area.band;
    var step = area.step || STEP;
    var count = Math.max(6, Math.floor(band / step));
    var chart = {
      step: step,
      body: area.body || BODY,
      strength: area.strength || 1,
      x0: area.x0,
      band: band,
      count: count,
      top: area.top,
      bottom: area.bottom,
      born: now,
      life: 14000 + Math.random() * 8000,
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random() * 0.003),   // px per ms
      vy: (Math.random() - 0.5) * 0.002,
      vol: 1,
      candles: [],
      opened: now,
      slide: 0,
      lo: 0,
      hi: 1
    };
    var price = 100;
    for (var i = 0; i <= count; i++) {
      var c = makeCandle(price, chart.vol);
      chart.candles.push(c);
      price = c.c;
    }
    fitRange(chart, 1);
    return chart;
  }

  function maxCharts() {
    return 1;
  }

  // The headline block stays clear: charts are placed around it, and anything
  // that drifts in is faded out behind it (see clearQuiet).
  var QUIET = ".page > .eyebrow, .page > h1, .page > .lead, .page > .facts, .page > .status-row, .page > .tabs";

  // Headline blocks are full width, but the text in them is not: measure the text.
  var range = document.createRange();
  function textBox(el) {
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  }

  function quietRects() {
    var out = [];
    document.querySelectorAll(QUIET).forEach(function (el) {
      var r = textBox(el);
      if (r.bottom < 0 || r.top > height || !r.width) return;
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
    return out;
  }

  // Soft-edged hole in the canvas over the headline, for whatever drifts behind it.
  function clearQuiet() {
    var rects = quietRects();
    if (!rects.length) return;
    var soft = width < 760 ? 10 : 30;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = soft;
    rects.forEach(function (r) {
      ctx.fillRect(r.left - 6, r.top - 4, r.right - r.left + 12, r.bottom - r.top + 8);
    });
    ctx.restore();
  }

  // The chart always sits in the top-right corner, under the site header and to
  // the right of the headline text, as wide as that space allows. Size varies per
  // chart (regular or big on desktop, small on phones).
  function spawnChart(now) {
    var mobile = width < 760;
    var big = !mobile && Math.random() < 0.4;
    var want, tall, minBand, step, body, gap;
    if (mobile) {
      want = 110 + Math.random() * 40; tall = 70 + Math.random() * 25;
      minBand = 80; step = 13; body = 7; gap = 18;
    } else if (big) {
      want = 420 + Math.random() * 220; tall = 200 + Math.random() * 120;
      minBand = 220; step = 30; body = 16; gap = 64;
    } else {
      want = 240 + Math.random() * 140; tall = 130 + Math.random() * 90;
      minBand = 180; step = STEP; body = BODY; gap = 64;
    }
    var margin = mobile ? 14 : Math.max(24, width * 0.03);
    // the site header is loaded by header.js and may not be there yet on the first frame
    var head = document.querySelector(".bt-header, .page-top");
    var headBottom = head ? Math.max(0, head.getBoundingClientRect().bottom)
      : document.getElementById("header") ? (mobile ? 76 : 96) : 0;
    var top = headBottom + (mobile ? 12 : 28);
    var rects = quietRects();
    var band = 0;
    // shorter charts fit beside more of the headline, so shrink until it fits
    for (var tries = 0; tries < 4; tries++) {
      var limit = 0;
      rects.forEach(function (r) {
        if (r.top < top + tall + gap / 2 && r.bottom > top - gap / 2) limit = Math.max(limit, r.right + gap);
      });
      band = Math.min(want, width - margin - limit);
      if (band >= minBand) break;
      tall *= 0.75;
    }
    if (band < minBand) return false;   // no room right now (e.g. scrolled); try again later
    var chart = makeChart({
      x0: width - margin - band, band: band, top: top, bottom: top + tall,
      step: step, body: body, strength: big ? 0.75 : 1
    }, now);
    chart.vx = chart.vy = 0;   // stays put in its corner
    chart.boost = mobile ? 1.7 : 1;   // the small phone chart needs more contrast to be seen
    charts.push(chart);
    return true;
  }

  // Fades out once the headline scrolls away, so the chart never sits behind cards.
  function heroFade() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    return Math.max(0, Math.min(1, 1 - (y - 40) / 220));
  }

  function fitRange(chart, ease) {
    var lo = Infinity, hi = -Infinity;
    chart.candles.forEach(function (c) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
    var pad = (hi - lo) * 0.12 || 1;
    chart.lo += (lo - pad - chart.lo) * ease;
    chart.hi += (hi + pad - chart.hi) * ease;
  }

  var nextChart = 0;
  function build() {
    charts = [];
    var now = window.performance ? performance.now() : 0;
    if (spawnChart(now)) charts[0].born = now - charts[0].life * 0.3;   // the first one is already visible on load
    nextChart = now + 2500;
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  // The live candle wanders towards the shape it will close with (with some
  // tick noise on the way); every CANDLE_MS it closes, a new one opens at its
  // close and the chart slides one step left.
  function tick(chart, now) {
    var live = chart.candles[chart.candles.length - 1];
    var p = Math.min(1, (now - chart.opened) / CANDLE_MS);
    if (live.target) {
      var goal = live.target;
      live.c = live.o + (goal.c - live.o) * p + gauss() * chart.vol * 0.15 * (1 - p);
      live.h = Math.max(live.h, live.c, Math.max(live.o, live.c) + (goal.h - Math.max(goal.o, goal.c)) * p);
      live.l = Math.min(live.l, live.c, Math.min(live.o, live.c) - (Math.min(goal.o, goal.c) - goal.l) * p);
    }

    if (p >= 1) {
      if (live.target) {
        live.c = live.target.c;
        live.h = Math.max(live.h, live.target.h);
        live.l = Math.min(live.l, live.target.l);
        delete live.target;
      }
      chart.opened = now;
      var next = { o: live.c, c: live.c, h: live.c, l: live.c, target: makeCandle(live.c, chart.vol) };
      chart.candles.push(next);
      if (chart.candles.length > chart.count + 1) chart.candles.shift();
      chart.slide = now;
      chart.vol = Math.max(0.5, Math.min(1.8, chart.vol * (0.9 + Math.random() * 0.2)));
    }
    fitRange(chart, 0.06);
  }

  function priceY(chart, p) {
    return chart.bottom - (p - chart.lo) / (chart.hi - chart.lo) * (chart.bottom - chart.top);
  }

  function drawChart(chart, now) {
    var age = now - chart.born;
    var fade = Math.max(0, Math.min(1, age / 2500, (chart.life - age) / 3000)) * heroFade();
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade * chart.strength;
    ctx.translate(chart.vx * age, chart.vy * age);
    drawCandles(chart, now);
    ctx.restore();
  }

  function drawCandles(chart, now) {
    var t = Math.min(1, (now - chart.slide) / SLIDE_MS);
    var offset = (1 - (1 - Math.pow(1 - t, 3))) * chart.step;   // eases the slide to the left
    var n = chart.candles.length;
    var closes = [];

    for (var i = 0; i < n; i++) {
      var c = chart.candles[i];
      var x = chart.x0 + (i - (n - 1 - chart.count)) * chart.step + offset;
      if (x < chart.x0 - chart.step || x > chart.x0 + chart.band + chart.step) continue;

      // brightest in the middle of the chart, fading out at both ends
      var edge = 1 - Math.abs((x - chart.x0) / chart.band - 0.5) * 2;
      var a = Math.min(1, (0.08 + Math.max(0, Math.min(1, edge)) * 0.34) * chart.boost);
      var up = c.c >= c.o;
      var yo = priceY(chart, c.o), yc = priceY(chart, c.c);
      var top = Math.min(yo, yc), h = Math.max(1.5, Math.abs(yc - yo));

      ctx.strokeStyle = up ? "rgba(61, 180, 255," + a + ")" : "rgba(130, 160, 220," + a * 0.8 + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, priceY(chart, c.h));
      ctx.lineTo(x + 0.5, priceY(chart, c.l));
      ctx.stroke();

      if (up) {
        ctx.shadowColor = "rgba(0, 194, 255, 0.55)";
        ctx.shadowBlur = i === n - 1 ? 10 : 4;
        ctx.fillStyle = "rgba(61, 180, 255," + a + ")";
        ctx.fillRect(x - chart.body / 2, top, chart.body, h);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "rgba(2, 6, 23, 0.6)";
        ctx.fillRect(x - chart.body / 2, top, chart.body, h);
        ctx.strokeRect(x - chart.body / 2 + 0.5, top + 0.5, chart.body - 1, Math.max(0.5, h - 1));
      }
      closes.push([x, yc, a]);
    }

    // price marker at the live candle
    var last = closes[closes.length - 1];
    if (last) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = "rgba(61, 180, 255, 0.25)";
      ctx.beginPath();
      ctx.moveTo(chart.x0, last[1]);
      ctx.lineTo(chart.x0 + chart.band, last[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---------- floating candles ----------

  function maxFloaters() {
    return width < 760 ? 3 : 7;
  }

  // Only in the empty margins beside the page content. Returns null when the
  // screen is too narrow to have any.
  function floaterX() {
    var page = document.querySelector(".page");
    var r = page ? page.getBoundingClientRect() : { left: width * 0.3, right: width * 0.7 };
    var left = r.left + 8, right = width - r.right + 8;
    if (left < 60 && right < 60) return null;
    var useLeft = right < 60 || (left >= 60 && Math.random() < 0.5);
    return useLeft ? 14 + Math.random() * (left - 28) : width - 14 - Math.random() * (right - 28);
  }

  function spawnFloater(now) {
    var x = floaterX();
    if (x === null) return;
    var big = Math.random() < 0.25;
    var body = big ? 70 + Math.random() * 110 : 24 + Math.random() * 60;
    floaters.push({
      x: Math.round(x),
      y: height * 0.1 + Math.random() * height * 0.8,
      vy: (Math.random() - 0.5) * 0.008,           // slow drift up or down, px per ms
      body: body,
      wickUp: 8 + Math.random() * body * 0.6,
      wickDown: 8 + Math.random() * body * 0.6,
      size: big ? 12 + Math.random() * 8 : 6 + Math.random() * 6,
      up: Math.random() < 0.6,
      born: now,
      life: 6000 + Math.random() * 5000,
      peak: big ? 0.2 : 0.28                      // big ones stay fainter so the page stays readable
    });
  }

  function drawFloater(f, now) {
    var p = (now - f.born) / f.life;
    var fade = p < 0.3 ? p / 0.3 : p > 0.65 ? (1 - p) / 0.35 : 1;
    var grow = 1 - Math.pow(1 - Math.min(1, p / 0.4), 3);
    var a = Math.max(0, fade) * f.peak;
    var y = f.y + f.vy * (now - f.born);
    var body = f.body * grow;
    var color = f.up ? "rgba(61, 180, 255," + a + ")" : "rgba(120, 150, 210," + a * 0.75 + ")";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(f.x + 0.5, y - body / 2 - f.wickUp * grow);
    ctx.lineTo(f.x + 0.5, y + body / 2 + f.wickDown * grow);
    ctx.stroke();

    if (f.up) {
      ctx.shadowColor = "rgba(0, 194, 255, 0.6)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.fillRect(f.x - f.size / 2, y - body / 2, f.size, body);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "rgba(2, 6, 23, 0.5)";
      ctx.fillRect(f.x - f.size / 2, y - body / 2, f.size, body);
      ctx.strokeRect(f.x - f.size / 2 + 0.5, y - body / 2, f.size - 1, body);
    }
  }

  function waveY(wave, x, t) {
    return wave.y * height
      + Math.sin(x * wave.k + t * wave.speed) * wave.amp
      + Math.sin(x * wave.k * 0.37 + t * wave.speed * 1.7) * wave.amp * 0.45;
  }

  function drawWave(wave, t) {
    ctx.beginPath();
    for (var x = -20; x <= width + 20; x += 14) {
      var y = waveY(wave, x, t);
      if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(0, 194, 255," + wave.alpha * 0.35 + ")";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = "rgba(61, 180, 255," + wave.alpha + ")";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    var span = width + 300;
    var sx = ((t * wave.spark) % span + span) % span - 150;
    var sy = waveY(wave, sx, t);
    var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
    glow.addColorStop(0, "rgba(180, 230, 255, 0.45)");
    glow.addColorStop(0.3, "rgba(61, 180, 255, 0.18)");
    glow.addColorStop(1, "rgba(61, 180, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 30, sy - 30, 60, 60);
  }

  var lastTick = 0;
  function frame(now) {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < waves.length; i++) drawWave(waves[i], now);
    var doTick = now - lastTick > 90;   // ticks ~11x a second, smooth enough and cheap
    if (doTick) lastTick = now;
    if (now >= nextFloater && floaters.length < maxFloaters()) {
      spawnFloater(now);
      nextFloater = now + 1200 + Math.random() * 1600;
    }
    floaters = floaters.filter(function (f) { return now - f.born < f.life; });
    for (var f = 0; f < floaters.length; f++) drawFloater(floaters[f], now);
    charts = charts.filter(function (c) { return now - c.born < c.life; });
    if (now >= nextChart && charts.length < maxCharts()) {
      nextChart = spawnChart(now) ? now + 4000 + Math.random() * 5000 : now + 1500;
    }
    for (var j = 0; j < charts.length; j++) {
      if (doTick) tick(charts[j], now);
      drawChart(charts[j], now);
    }
    clearQuiet();
    window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    window.requestAnimationFrame(frame);
  }

  function drawStill() {
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < waves.length; i++) drawWave(waves[i], 40000);
    if (charts.length < maxCharts()) spawnChart(0);
    for (var j = 0; j < charts.length; j++) {
      charts[j].born = -charts[j].life / 2;
      charts[j].vx = charts[j].vy = 0;
      drawChart(charts[j], 0);
    }
    floaters = [];
    for (var k = 0; k < maxFloaters() / 2; k++) spawnFloater(0);
    floaters.forEach(function (f) {
      f.born = -f.life * 0.5;
      drawFloater(f, 0);
    });
    clearQuiet();
  }

  resize();
  window.addEventListener("resize", function () {
    resize();
    if (still) drawStill();
  });

  if (still) {
    drawStill();
    return;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) running = false; else start();
  });
  start();
})();
