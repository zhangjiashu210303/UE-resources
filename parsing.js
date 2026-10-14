/* =====================================================================
   parsing.js
   职责：纯数据解析层
   - 原始 JSON → 内部统一结构
   - 字段名兼容、链接提取、媒体类型判断、网盘识别、文件名生成
   - 内建 12 条预览数据生成
   ===================================================================== */
(function () {
  'use strict';

  window.RC = window.RC || {};

  var NAME_KEYS = ['name','title','filename','fileName','assetName','名称','文件名','资源名'];
  var DESC_KEYS = ['desc','description','intro','summary','note','remark','描述','简介','说明','备注'];
  var DIR_KEYS  = ['downloadDir','download_dir','downloadPath','dir','directory','folder','path','savePath','outDir','outputDir','目录','下载目录','保存目录','路径'];
  var PREVIEW_KEYS = ['preview','previewUrl','cover','poster','thumbnail','thumb','封面','预览','预览图','缩略图'];
  var URL_KEYS  = ['url','downloadUrl','download_url','src','source','href','link','image','img','picture','pic','video','videoUrl','file','地址','下载地址','链接','图片','视频'];
  var MIRROR_KEYS = ['url2','link2','download2','mirror','backup','备用地址','下载地址二','链接二','备用链接'];

  var IMG_EXT = { png:1,jpg:1,jpeg:1,gif:1,webp:1,bmp:1,svg:1,avif:1,tga:1,exr:1,hdr:1,psd:1,ico:1 };
  var VID_EXT = { mp4:1,webm:1,mov:1,m4v:1,avi:1,mkv:1,ogv:1,wmv:1,flv:1 };
  var DL_EXT = { zip:1,rar:1,'7z':1,tar:1,gz:1,bz2:1,xz:1,
    png:1,jpg:1,jpeg:1,gif:1,webp:1,bmp:1,svg:1,psd:1,
    mp4:1,webm:1,mov:1,m4v:1,avi:1,mkv:1,
    pdf:1,txt:1,json:1,fbx:1,obj:1,blend:1,max:1,
    uasset:1,umap:1,upk:1,exe:1,dmg:1,apk:1,iso:1,bin:1 };

  /* ---------- 基础工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escAttr(s) { return esc(s); }

  function extOf(str) {
    if (!str) return '';
    var clean = String(str).split('#')[0].split('?')[0];
    var dot = clean.lastIndexOf('.'), slash = clean.lastIndexOf('/');
    if (dot < 0 || dot < slash) return '';
    return clean.slice(dot + 1).toLowerCase();
  }
  function isDataUrl(u) { return !!u && String(u).indexOf('data:') === 0; }

  function guessMediaType(url) {
    if (!url) return 'none';
    if (/^data:image\//i.test(url)) return 'image';
    if (/^data:video\//i.test(url)) return 'video';
    var e = extOf(url);
    if (IMG_EXT[e]) return 'image';
    if (VID_EXT[e]) return 'video';
    return 'none';
  }

  function panList() {
    var cfg = window.RC.style && window.RC.style.config;
    return (cfg && cfg.panList) || [];
  }

  function detectPan(url) {
    if (!url || isDataUrl(url)) return null;
    var host;
    try { host = new URL(url, location.href).hostname.toLowerCase().replace(/^www\./, ''); }
    catch (e) { return null; }
    var list = panList();
    for (var i = 0; i < list.length; i++) {
      var h = list[i].host;
      if (host === h || host.slice(-(h.length + 1)) === '.' + h) return list[i].name;
    }
    return null;
  }

  function shouldDownload(url) {
    if (!url) return false;
    if (isDataUrl(url)) return true;
    if (detectPan(url)) return false;
    return !!DL_EXT[extOf(String(url).split('#')[0].split('?')[0])];
  }

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  function pickFirstUrl(obj) {
    for (var i = 0; i < URL_KEYS.length; i++) {
      var key = URL_KEYS[i], v = obj[key];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'object') {
        v = v.url || v.href || v.src || v.base64 || v.data || null;
        if (!v) continue;
      }
      return { value: String(v).trim(), field: key };
    }
    return null;
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function dataUrlToBlob(dataUrl) {
    var comma = dataUrl.indexOf(',');
    var head = dataUrl.slice(5, comma), body = dataUrl.slice(comma + 1);
    var isB64 = /;base64/i.test(head);
    var mime = head.split(';')[0] || 'application/octet-stream';
    var bytes;
    if (isB64) {
      var bin = atob(body);
      bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(body));
    }
    return new Blob([bytes], { type: mime });
  }

  function extFromMime(mime) {
    var map = {
      'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/gif':'gif',
      'image/webp':'webp','image/bmp':'bmp','image/svg+xml':'svg','image/avif':'avif',
      'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-msvideo':'avi'
    };
    return map[mime] || '';
  }

  function filenameFor(item, mime, fallbackUrl) {
    var base = (item && item.name || '').trim();
    if (!base && fallbackUrl) {
      var clean = String(fallbackUrl).split('#')[0].split('?')[0];
      var idx = clean.lastIndexOf('/');
      base = idx >= 0 ? clean.slice(idx + 1) : clean;
      try { base = decodeURIComponent(base); } catch (e) {}
    }
    if (!base) base = 'file';
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    if (/\.[A-Za-z0-9]{1,6}$/.test(base)) return base;
    var ext = extFromMime(mime) || extOf(fallbackUrl) ||
      (guessMediaType(fallbackUrl) === 'video' ? 'mp4'
        : guessMediaType(fallbackUrl) === 'image' ? 'png' : 'bin');
    return base + '.' + ext;
  }

  /* ---------- 单条归一化 ---------- */
  function normalize(raw) {
    if (typeof raw === 'string') {
      var t = raw.trim();
      return {
        name: '', desc: '', dir: '', preview: '', previewType: 'none',
        links: [{ name: detectPan(t) || '下载', url: t, code: '' }]
      };
    }
    if (!raw || typeof raw !== 'object') return null;

    var name = pick(raw, NAME_KEYS);
    var desc = pick(raw, DESC_KEYS);
    var dir  = pick(raw, DIR_KEYS);
    var previewUrl = pick(raw, PREVIEW_KEYS) || '';

    if (!previewUrl) {
      var lv = raw.video || raw.videoUrl || '';
      var li = raw.image || raw.img || raw.picture || raw.pic || '';
      if (lv) previewUrl = String(lv);
      else if (li) previewUrl = String(li);
    }
    previewUrl = String(previewUrl || '').trim();

    var links = [];
    if (Array.isArray(raw.links)) {
      for (var i = 0; i < raw.links.length; i++) {
        var L = raw.links[i];
        if (!L) continue;
        if (typeof L === 'string') {
          var lu0 = L.trim();
          if (!lu0) continue;
          links.push({ name: detectPan(lu0) || '下载', url: lu0, code: '' });
        } else if (typeof L === 'object') {
          var lu = L.url || L.href || L.link || L.address || L.src || '';
          if (!lu) continue;
          lu = String(lu).trim();
          links.push({
            name: String(L.name || L.label || detectPan(lu) || '下载'),
            url: lu,
            code: String(L.code || L.password || L.pwd || L.extract || '')
          });
        }
      }
    }

    if (!links.length) {
      var single = pickFirstUrl(raw);
      if (single && single.value) {
        links.push({
          name: detectPan(single.value) ||
                (single.field === 'video' || single.field === 'videoUrl' ? '视频' : '下载'),
          url: single.value, code: ''
        });
      }
    }

    for (var m = 0; m < MIRROR_KEYS.length; m++) {
      var mv = raw[MIRROR_KEYS[m]];
      if (typeof mv === 'string' && mv.trim()) {
        var murl = mv.trim();
        links.push({ name: detectPan(murl) || '备用', url: murl, code: '' });
      }
    }

    var seen = {}, finalLinks = [];
    for (var k = 0; k < links.length; k++) {
      if (seen[links[k].url]) continue;
      seen[links[k].url] = 1;
      finalLinks.push(links[k]);
    }

    return {
      name: name ? String(name) : '',
      desc: desc ? String(desc) : '',
      dir: dir ? String(dir) : '',
      preview: previewUrl,
      previewType: guessMediaType(previewUrl),
      links: finalLinks
    };
  }

  function itemMainType(item) {
    if (item.previewType === 'image' || item.previewType === 'video') return item.previewType;
    for (var i = 0; i < item.links.length; i++) {
      var t = guessMediaType(item.links[i].url);
      if (t !== 'none') return t;
    }
    return 'file';
  }

  function itemPanName(item) {
    for (var i = 0; i < item.links.length; i++) {
      var p = detectPan(item.links[i].url);
      if (p) return p;
    }
    return null;
  }

  function extractList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.list)) return data.list;
      if (Array.isArray(data.assets)) return data.assets;
      if (Array.isArray(data.files)) return data.files;
      if (Array.isArray(data.images)) return data.images;
      if (Array.isArray(data.data)) return data.data;
      if (data.name || data.url || data.links) return [data];
    }
    return null;
  }

  /* ---------- 内建预览数据 ---------- */
  function makePreviewCard(name, dir, colors, num) {
    var cv = document.createElement('canvas');
    cv.width = 800; cv.height = 500;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 800, 500);
    g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 500);

    ctx.globalAlpha = 0.12; ctx.fillStyle = '#ffffff';
    for (var k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.arc((num*97+k*173)%800, (num*61+k*131)%500, 60+((k*37)%130), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.06; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    for (var x = 40; x < 800; x += 80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,500); ctx.stroke(); }
    for (var y = 40; y < 500; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(800,y); ctx.stroke(); }

    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = '800 120px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num).padStart(2, '0'), 400, 250);

    return { name: name, downloadDir: dir, url: cv.toDataURL('image/jpeg', 0.85) };
  }

  function makePreviewItems() {
    var specs = [
      ['T_Rock_Cliff_01.png','岩石悬崖漫反射贴图，2K，含法线','/Game/Textures/Terrain',['#8c78ff','#5a8bff']],
      ['T_Grass_Diffuse_A.png','草地漫反射，4K，UE 标准 PBR','/Game/Textures/Terrain',['#22d3a5','#5a8bff']],
      ['T_Metal_Rough_02.png','金属粗糙度贴图，PBR 通道打包','/Game/Textures/Metal',['#f0a97a','#c0504d']],
      ['T_Wood_Base_Planks.png','木地板基础色，含 AO','/Game/Textures/Wood',['#e0a94a','#8a5a20']],
      ['T_Concrete_Aged.png','老化混凝土，2K 无缝','/Game/Textures/Concrete',['#8b90a4','#4a5058']],
      ['T_Fabric_Weave_02.png','织物编织纹理，含法线','/Game/Textures/Fabric',['#ff5a9e','#8c78ff']],
      ['T_Sky_HDRI_Dusk.png','黄昏 HDRI 环境球，8K','/Game/Textures/Sky',['#ff7a59','#7c2d12']],
      ['T_Emissive_Glow_A.png','自发光遮罩，适合霓虹效果','/Game/Textures/FX',['#00d4ff','#22d3a5']],
      ['T_Sand_Dunes_01.png','沙丘高度图，4K','/Game/Textures/Desert',['#f59e0b','#b45309']],
      ['T_Ice_Crystal_A.png','冰晶表面，含次表面散射参数','/Game/Textures/Ice',['#7dd3fc','#0369a1']],
      ['T_Lava_Crack_02.png','熔岩裂纹自发光，动画可用','/Game/Textures/Lava',['#ef4444','#7c2d12']],
      ['T_Moss_Ground_01.png','苔藓地面混合材质','/Game/Textures/Moss',['#65a30d','#14532d']]
    ];
    return specs.map(function (spec, i) {
      var card = makePreviewCard(spec[0], spec[2], spec[3], i + 1);
      return {
        name: card.name,
        desc: spec[1],
        downloadDir: card.downloadDir,
        preview: card.url,
        links: [
          { name: '百度网盘', url: 'https://pan.baidu.com/s/1demo' + (i + 1), code: 'ue' + (i + 1) },
          { name: '夸克网盘', url: 'https://pan.quark.cn/s/demo' + (i + 1) }
        ]
      };
    });
  }

  window.RC.parsing = {
    NAME_KEYS: NAME_KEYS,
    DESC_KEYS: DESC_KEYS,
    DIR_KEYS: DIR_KEYS,
    PREVIEW_KEYS: PREVIEW_KEYS,
    URL_KEYS: URL_KEYS,
    MIRROR_KEYS: MIRROR_KEYS,
    IMG_EXT: IMG_EXT,
    VID_EXT: VID_EXT,
    DL_EXT: DL_EXT,
    esc: esc,
    escAttr: escAttr,
    extOf: extOf,
    isDataUrl: isDataUrl,
    guessMediaType: guessMediaType,
    detectPan: detectPan,
    shouldDownload: shouldDownload,
    pick: pick,
    pickFirstUrl: pickFirstUrl,
    utf8ToBase64: utf8ToBase64,
    base64ToUtf8: base64ToUtf8,
    dataUrlToBlob: dataUrlToBlob,
    extFromMime: extFromMime,
    filenameFor: filenameFor,
    normalize: normalize,
    itemMainType: itemMainType,
    itemPanName: itemPanName,
    extractList: extractList,
    makePreviewItems: makePreviewItems
  };
})();