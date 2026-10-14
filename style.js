/* =====================================================================
   style.js
   职责：
   1. 读取 config.json（含失败兜底默认值）
   2. 把样式相关配置应用到 <html> 上的开关类
   3. 指针跟随高光（--mx / --my）的运行时后处理
   ===================================================================== */
(function () {
  'use strict';

  window.RC = window.RC || {};

  var DEFAULTS = {
    github: { owner: 'zhangjiashu210303', repo: 'UE-resources', branch: 'main', path: 'assets.json' },
    storageKey: 'res_center_gh_cfg_ue_v2',
    batch: 12,
    animMs: 750,
    maxLinks: 10,
    searchDebounce: 180,
    features: { aurora: true, noise: true, cursorGlow: true },
    panList: [
      { host: 'pan.baidu.com', name: '百度网盘' },
      { host: 'yun.baidu.com', name: '百度网盘' },
      { host: 'eyun.baidu.com', name: '百度网盘' },
      { host: 'aliyundrive.com', name: '阿里云盘' },
      { host: 'alipan.com', name: '阿里云盘' },
      { host: 'pan.quark.cn', name: '夸克网盘' },
      { host: 'weiyun.com', name: '腾讯微云' },
      { host: 'lanzou.com', name: '蓝奏云' },
      { host: 'lanzoui.com', name: '蓝奏云' },
      { host: 'lanzoux.com', name: '蓝奏云' },
      { host: 'lanzouw.com', name: '蓝奏云' },
      { host: 'lanzoup.com', name: '蓝奏云' },
      { host: 'lanzoub.com', name: '蓝奏云' },
      { host: 'lanzoue.com', name: '蓝奏云' },
      { host: 'lanzouf.com', name: '蓝奏云' },
      { host: 'lanzoug.com', name: '蓝奏云' },
      { host: 'lanzouh.com', name: '蓝奏云' },
      { host: 'lanzouj.com', name: '蓝奏云' },
      { host: 'lanzouk.com', name: '蓝奏云' },
      { host: 'lanzoul.com', name: '蓝奏云' },
      { host: 'cloud.189.cn', name: '天翼云盘' },
      { host: '115.com', name: '115网盘' },
      { host: 'anxia.com', name: '115网盘' },
      { host: 'pan.xunlei.com', name: '迅雷云盘' },
      { host: '123pan.com', name: '123云盘' },
      { host: '123684.com', name: '123云盘' },
      { host: '123865.com', name: '123云盘' },
      { host: '123912.com', name: '123云盘' },
      { host: 'cowtransfer.com', name: '奶牛快传' },
      { host: 'wetransfer.com', name: 'WeTransfer' },
      { host: 'drive.google.com', name: 'Google Drive' },
      { host: 'mega.nz', name: 'MEGA' },
      { host: 'mediafire.com', name: 'MediaFire' },
      { host: 'dropbox.com', name: 'Dropbox' },
      { host: '1drv.ms', name: 'OneDrive' },
      { host: 'onedrive.live.com', name: 'OneDrive' }
    ]
  };

  function merge(base, over) {
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (!over) return out;
    for (var j in over) {
      if (!Object.prototype.hasOwnProperty.call(over, j)) continue;
      var bv = base[j], ov = over[j];
      if (bv && ov && typeof bv === 'object' && !Array.isArray(bv) &&
          typeof ov === 'object' && !Array.isArray(ov)) {
        out[j] = merge(bv, ov);
      } else if (ov !== undefined && ov !== null) {
        out[j] = ov;
      }
    }
    return out;
  }

  function applyFeatureClasses(cfg) {
    var html = document.documentElement;
    html.classList.toggle('no-aurora', !cfg.features.aurora);
    html.classList.toggle('no-noise', !cfg.features.noise);
    html.classList.toggle('no-cursor-glow', !cfg.features.cursorGlow);
  }

  /* ---------- 指针跟随高光（样式后处理） ---------- */
  var CURSOR_TARGETS = '.cursor-glow, .card, .link-btn, .glass-pill, .tool-btn';
  var pendingPointer = null, pointerRaf = null, pointerBound = false;

  function applyPointer() {
    pointerRaf = null;
    if (!pendingPointer) return;
    var p = pendingPointer;
    pendingPointer = null;
    var el = document.elementFromPoint(p.x, p.y);
    if (!el) return;
    var t = el.closest(CURSOR_TARGETS);
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (p.x - r.left) + 'px');
    t.style.setProperty('--my', (p.y - r.top) + 'px');
  }

  function initCursorGlow() {
    if (pointerBound) return;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    pointerBound = true;
    document.addEventListener('pointermove', function (e) {
      pendingPointer = { x: e.clientX, y: e.clientY };
      if (!pointerRaf) pointerRaf = requestAnimationFrame(applyPointer);
    }, { passive: true });
  }

  RC.style = {
    config: DEFAULTS,

    /** 读取 config.json，失败则使用内置默认值 */
    load: function () {
      return fetch('config.json', { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          RC.style.config = merge(DEFAULTS, json);
          return RC.style.config;
        })
        .catch(function () {
          RC.style.config = merge(DEFAULTS, null);
          return RC.style.config;
        })
        .then(function (cfg) {
          applyFeatureClasses(cfg);
          if (cfg.features.cursorGlow) initCursorGlow();
          return cfg;
        });
    }
  };
})();