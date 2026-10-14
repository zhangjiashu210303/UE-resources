/* =====================================================================
   connect.js
   职责：GitHub 连接层
   - 配置本地存储（localStorage）
   - GitHub Contents API 读写
   - 设置模态框 / 测试连接 / 发布 / 编辑 / 删除
   ===================================================================== */
(function () {
  'use strict';

  window.RC = window.RC || {};
  var P = window.RC.parsing;

  var toastFn = function () {};
  var onChange = function () {};

  function cfgDefaults() {
    var g = (window.RC.style && window.RC.style.config && window.RC.style.config.github) || {};
    return {
      owner:  g.owner  || 'zhangjiashu210303',
      repo:   g.repo   || 'UE-resources',
      branch: g.branch || 'main',
      path:   g.path   || 'assets.json'
    };
  }
  function storageKey() {
    return (window.RC.style && window.RC.style.config && window.RC.style.config.storageKey)
      || 'res_center_gh_cfg_ue_v2';
  }

  /* ---------- 配置存取 ---------- */
  function loadCfg() {
    try {
      var raw = localStorage.getItem(storageKey());
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.owner && o.repo && o.path && o.token) return o;
    } catch (e) {}
    return null;
  }
  function saveCfg(cfg) {
    try { localStorage.setItem(storageKey(), JSON.stringify(cfg)); } catch (e) {}
  }
  function clearCfg() {
    try { localStorage.removeItem(storageKey()); } catch (e) {}
  }

  /* ---------- GitHub API ---------- */
  function ghHeaders(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }
  function ghApiUrl(cfg) {
    return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo +
           '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');
  }
  async function ghFetchCurrent(cfg) {
    var url = ghApiUrl(cfg) + '?ref=' + encodeURIComponent(cfg.branch) + '&_=' + Date.now();
    var res = await fetch(url, { headers: ghHeaders(cfg.token) });
    if (res.status === 404) return { list: [], sha: null };
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error('读取失败 HTTP ' + res.status + (err.message ? '：' + err.message : ''));
    }
    var data = await res.json();
    var text = P.base64ToUtf8(data.content), list;
    try {
      list = JSON.parse(text);
      if (!Array.isArray(list)) list = P.extractList(list) || [];
    } catch (e) { list = []; }
    return { list: list, sha: data.sha };
  }
  async function ghPut(cfg, list, sha, message) {
    var url = ghApiUrl(cfg);
    var body = {
      message: message,
      content: P.utf8ToBase64(JSON.stringify(list, null, 2)),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    var res = await fetch(url, {
      method: 'PUT', headers: ghHeaders(cfg.token), body: JSON.stringify(body)
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error('提交失败 HTTP ' + res.status + (err.message ? '：' + err.message : ''));
    }
    return await res.json();
  }

  /* ---------- 设置模态框 ---------- */
  function $ (id) { return document.getElementById(id); }

  function openSettings() {
    var cfg = loadCfg() || {};
    var d = cfgDefaults();
    $('sOwner').value  = cfg.owner  || d.owner;
    $('sRepo').value   = cfg.repo   || d.repo;
    $('sBranch').value = cfg.branch || d.branch;
    $('sPath').value   = cfg.path   || d.path;
    $('sToken').value  = cfg.token  || '';
    $('settingsModal').classList.add('on');
  }
  function closeSettings() {
    $('settingsModal').classList.remove('on');
  }

  function readSettingsForm() {
    return {
      owner:  $('sOwner').value.trim(),
      repo:   $('sRepo').value.trim(),
      branch: ($('sBranch').value.trim() || 'main'),
      path:   ($('sPath').value.trim() || 'assets.json'),
      token:  $('sToken').value.trim()
    };
  }

  function testCfg() {
    var cfg = readSettingsForm();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      toastFn('请填写 owner、repo 和 token', 'error');
      return;
    }
    toastFn('测试中…', '', 1800);
    ghFetchCurrent(cfg).then(function (r) {
      toastFn('连接成功，当前有 ' + r.list.length + ' 条记录', 'success', 4200);
    }).catch(function (e) {
      toastFn(e.message || '连接失败', 'error', 5200);
    });
  }

  function saveSettings() {
    var cfg = readSettingsForm();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      toastFn('owner、repo、token 都不能为空', 'error');
      return;
    }
    saveCfg(cfg);
    onChange();
    closeSettings();
    toastFn('配置已保存到浏览器本地，下次打开自动生效', 'success');
  }

  function clearSettings() {
    if (!confirm('确定清除本地保存的 GitHub 配置吗？\nToken 会从浏览器中删除。')) return;
    clearCfg();
    var d = cfgDefaults();
    $('sOwner').value  = d.owner;
    $('sRepo').value   = d.repo;
    $('sBranch').value = d.branch;
    $('sPath').value   = d.path;
    $('sToken').value  = '';
    onChange();
    toastFn('已清除配置', 'success');
  }

  /* ---------- 发布 / 编辑 / 删除 ---------- */
  /**
   * 新增或更新一条记录
   * @param {object} obj      表单收集到的对象
   * @param {object|null} oldItem  编辑时的旧条目（null 表示新增）
   */
  async function publish(obj, oldItem) {
    var cfg = loadCfg();
    if (!cfg) return { ok: false, needConfig: true, error: '请先在设置里配置 GitHub' };

    try {
      var cur = await ghFetchCurrent(cfg);

      if (oldItem) {
        var oldName = oldItem.name || '';
        var replaced = false;
        for (var i = 0; i < cur.list.length; i++) {
          var curName = cur.list[i].name || cur.list[i].title || '';
          if (String(curName) === oldName) { cur.list[i] = obj; replaced = true; break; }
        }
        if (!replaced) cur.list.push(obj);
        await ghPut(cfg, cur.list, cur.sha, 'Update: ' + obj.name);
      } else {
        cur.list.push(obj);
        await ghPut(cfg, cur.list, cur.sha, 'Add: ' + obj.name);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || '操作失败' };
    }
  }

  /**
   * 删除一条记录
   * @param {object} oldItem  要删除的条目（按 name 匹配）
   */
  async function publishDelete(oldItem) {
    var cfg = loadCfg();
    if (!cfg) return { ok: false, needConfig: true, error: '请先在设置里配置 GitHub' };

    try {
      var cur = await ghFetchCurrent(cfg);
      var oldName = oldItem.name || '';
      var next = [], removed = 0;
      for (var i = 0; i < cur.list.length; i++) {
        var curName = cur.list[i].name || cur.list[i].title || '';
        if (String(curName) === oldName && removed === 0) { removed = 1; continue; }
        next.push(cur.list[i]);
      }
      if (!removed) throw new Error('未找到该条目，可能已被修改');
      await ghPut(cfg, next, cur.sha, 'Delete: ' + oldName);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || '删除失败' };
    }
  }

  /* ---------- 初始化 ---------- */
  function init(opts) {
    opts = opts || {};
    if (typeof opts.toast === 'function') toastFn = opts.toast;
    if (typeof opts.onCfgChange === 'function') onChange = opts.onCfgChange;

    $('settingsClose').addEventListener('click', closeSettings);
    $('saveCfg').addEventListener('click', saveSettings);
    $('testCfg').addEventListener('click', testCfg);
    $('clearCfg').addEventListener('click', clearSettings);
    $('settingsModal').addEventListener('click', function (e) {
      if (e.target === $('settingsModal')) closeSettings();
    });
  }

  window.RC.connect = {
    init: init,
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    clearCfg: clearCfg,
    cfgDefaults: cfgDefaults,
    ghFetchCurrent: ghFetchCurrent,
    openSettings: openSettings,
    publish: publish,
    publishDelete: publishDelete
  };
})();