// falladviser-us SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from falladviser-us/index.html · 97099 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "falladviser-us" }); }
    else go();
  })();
'use strict';
// ════════════════════════════════════════════════════════════════
// FallAdviser v1 · sovereign US finance / tax / retirement account / portfolio
//
// INFORMATIONAL TOOL · NOT REGULATED FINANCIAL ADVICE
// US rules calibrated for 2025-26 tax year (April 2025 - April 2026)
// User retains all decision-making · always verify with HMRC / authorised RIA
// ════════════════════════════════════════════════════════════════
const VERSION='1.0.0';const PRIME=719;const STORE='falladviser-us-v1';
// ── US 2025-26 tax constants · update annually ──
const TAX_YEAR = '2025-26';
const RULES = {
 taxYear: TAX_YEAR,
 // Income tax (England, Wales, NI · Scotland differs)
 personalAllowance: 12570,
 paTaperStart: 100000, // PA reduces by $1 per $2 over $100k
 basicRateBand: 37700, // $12,570 → $50,270
 basicRate: 0.20,
 higherRateStart: 50270,
 higherRate: 0.40,
 additionalRateStart: 125140,
 additionalRate: 0.45,
 // National insurance (employee Class 1, 2025-26)
 niPrimaryThreshold: 12570,
 niUpperEarningsLimit: 50270,
 niMainRate: 0.08,
 niUpperRate: 0.02,
 // Dividend tax
 dividendAllowance: 500,
 dividendBasicRate: 0.0875,
 dividendHigherRate: 0.3375,
 dividendAdditionalRate: 0.3935,
 // Capital gains tax
 cgtAllowance: 3000,
 cgtBasicRate: 0.18, // non-residential from 30 Oct 2024
 cgtHigherRate: 0.24,
 // Savings
 savingsAllowanceBasic: 1000,
 savingsAllowanceHigher: 500,
 savingsAllowanceAdditional: 0,
 // IRAs
 isaAllowance: 20000, // S&S + Cash + IFIRA combined
 lisaAllowance: 4000, // sub-allowance within IRA
 lisaBonusPct: 0.25,
 juniorIsaAllowance: 9000,
 // Pension
 retirement accountAnnualAllowance: 60000,
 retirement accountAATaperStart: 260000, // adjusted income
 retirement accountAATaperFloor: 10000,
 lumpSumAllowance: 268275, // LSA (replaced LTA)
 lumpSumDeathBenefit: 1073100, // LSDBA
 // State retirement account
 statePensionWeekly: 230.25,
 statePensionAnnual: 11973,
 statePensionQualifyingYears: 35,
 // IHT
 ihtNilRateBand: 325000,
 ihtResidenceNilRateBand: 175000,
 // Workplace retirement account auto-enrol
 autoEnrolMinEmployer: 0.03,
 autoEnrolMinEmployee: 0.05,
};
// ── apps / tabs ──
const TABS = [
 { id: 'dashboard', name: 'Dashboard', ico: '◐' },
 { id: 'tax', name: 'Tax', ico: '$' },
 { id: 'retirement account', name: 'Pension', ico: '☷' },
 { id: 'portfolio', name: 'Portfolio', ico: '▦' },
 { id: 'qa', name: 'Q & A', ico: '?' },
 { id: 'reports', name: 'Reports', ico: '↓' },
];
let state = {
 active: 'dashboard',
 profile: {
 name: '',
 age: 35,
 dob: '',
 region: 'England', // England | Scotland | Wales | NI
 income: 50000,
 dividendIncome: 0,
 savingsInterest: 0,
 rentalIncome: 0,
 employerPensionPct: 0.05,
 employerContribPct: 0.05,
 riskProfile: 'balanced', // cautious | balanced | adventurous | aggressive
 targetRetirementAge: 67,
 monthlyExpenses: 2500,
 emergencyFundMonths: 6,
 chasePensionFreedoms: false,
 qualifyingYearsNI: 25,
 },
 contribs: {
 isaThisYear: 0,
 lisaThisYear: 0,
 sippThisYear: 0,
 workplacePensionAnnual: 0,
 salarySacrifice: 0,
 },
 holdings: [], // [{ id, type, label, value, taxWrapper, assetClass, units?, costBasis? }]
 gains: {
 cgtRealisedThisYear: 0,
 },
 estate: { tools: [] }, // pulled from fall-registry
 chat: [], // Q&A history
 settings: {
 anthropicKey: '', geminiKey: '', openaiKey: '', openrouterKey: '',
 auditChain: true,
 },
 audit: [], // prevHash chain · P3
};
// ── util ──
const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const uid=()=>'_'+Math.random().toString(36).slice(2,11);
const now=()=>Date.now();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(+n||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0});
const money=n=>'$'+fmt(n);
const moneyP=n=>'$'+(+n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>((+n||0)*100).toFixed(1)+'%';
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),1900)}
// ── IDB · with P3 audit chain ──
let db;
async function sha256(s){const buf=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(STORE,1);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('s'))d.createObjectStore('s')};r.onsuccess=e=>{db=e.target.result;res(db)};r.onerror=rej})}
async function saveAll(){
 if(!db)await openDB();
 const snapshot=JSON.stringify({profile:state.profile,contribs:state.contribs,holdings:state.holdings,gains:state.gains,chat:state.chat,settings:state.settings,active:state.active});
 // audit chain (P3)
 if(state.settings.auditChain){
 const prevHash=state.audit.length?state.audit[state.audit.length-1].hash:'';
 const docHash=await sha256(snapshot);
 const entry={ts:Date.now(),prevHash,docHash,hash:await sha256(prevHash+docHash+Date.now())};
 state.audit.push(entry);
 if(state.audit.length>2000)state.audit=state.audit.slice(-2000);
 }
 return new Promise(r=>{const tx=db.transaction('s','readwrite');tx.objectStore('s').put({...state},'state');tx.oncomplete=r})
}
async function loadAll(){if(!db)await openDB();return new Promise(r=>{const tx=db.transaction('s','readonly');const q=tx.objectStore('s').get('state');q.onsuccess=()=>{if(q.result){const merged=q.result;state=Object.assign({},state,merged);state.profile=Object.assign({},state.profile,merged.profile||{});state.contribs=Object.assign({},state.contribs,merged.contribs||{});state.settings=Object.assign({},state.settings,merged.settings||{})}r()}})}
// ════════════════════════════════════════════════════════════════
// TAX ENGINE · US 2025-26 · T0 deterministic
// ════════════════════════════════════════════════════════════════
function adjustedPersonalAllowance(income){
 // PA tapers by $1 for every $2 over $100k, fully exhausted at $125,140
 const over=Math.max(0,income-RULES.paTaperStart);
 return Math.max(0,RULES.personalAllowance-Math.floor(over/2))
}
function incomeTax(income){
 // Returns { tax, bands: [{rate, amount, tax}], paUsed, marginalRate }
 const pa=adjustedPersonalAllowance(income);
 let remaining=Math.max(0,income-pa);
 const bands=[];
 let tax=0;
 // basic rate band
 const basic=Math.min(remaining,RULES.basicRateBand);
 if(basic>0){tax+=basic*RULES.basicRate;bands.push({label:'Basic 20%',rate:RULES.basicRate,amount:basic,tax:basic*RULES.basicRate});remaining-=basic}
 // higher rate band
 const higherBandSize=RULES.additionalRateStart-RULES.higherRateStart;
 const higher=Math.min(remaining,higherBandSize);
 if(higher>0){tax+=higher*RULES.higherRate;bands.push({label:'Higher 40%',rate:RULES.higherRate,amount:higher,tax:higher*RULES.higherRate});remaining-=higher}
 // additional rate
 if(remaining>0){tax+=remaining*RULES.additionalRate;bands.push({label:'Additional 45%',rate:RULES.additionalRate,amount:remaining,tax:remaining*RULES.additionalRate})}
 // marginal rate
 let marginalRate=0;
 if(income<=pa)marginalRate=0;
 else if(income<=RULES.higherRateStart)marginalRate=RULES.basicRate;
 else if(income<=RULES.additionalRateStart)marginalRate=RULES.higherRate;
 else marginalRate=RULES.additionalRate;
 // PA taper zone has effective marginal 60%
 if(income>RULES.paTaperStart&&income<=125140)marginalRate=0.60;
 return{tax,bands,paUsed:pa,marginalRate}
}
function nationalInsurance(income){
 // Employee Class 1 NI (employed, monthly US PAYE)
 let ni=0;
 const main=Math.max(0,Math.min(income,RULES.niUpperEarningsLimit)-RULES.niPrimaryThreshold);
 ni+=main*RULES.niMainRate;
 const upper=Math.max(0,income-RULES.niUpperEarningsLimit);
 ni+=upper*RULES.niUpperRate;
 return{ni,mainAmount:main,upperAmount:upper}
}
function dividendTax(dividend,salaryIncome){
 if(!dividend)return{tax:0,bands:[]};
 // Dividend allowance first
 let taxable=Math.max(0,dividend-RULES.dividendAllowance);
 // Stack on top of salary to determine band
 // What's left in basic band after salary?
 const pa=adjustedPersonalAllowance(salaryIncome+dividend);
 const taxableSalary=Math.max(0,salaryIncome-pa);
 const basicBandUsed=Math.min(taxableSalary,RULES.basicRateBand);
 const basicBandLeft=Math.max(0,RULES.basicRateBand-basicBandUsed);
 let tax=0;const bands=[];
 const inBasic=Math.min(taxable,basicBandLeft);
 if(inBasic>0){tax+=inBasic*RULES.dividendBasicRate;bands.push({label:'Div basic 8.75%',amount:inBasic,tax:inBasic*RULES.dividendBasicRate});taxable-=inBasic}
 const higherBandSize=(RULES.additionalRateStart-RULES.higherRateStart);
 const inHigher=Math.min(taxable,higherBandSize);
 if(inHigher>0){tax+=inHigher*RULES.dividendHigherRate;bands.push({label:'Div higher 33.75%',amount:inHigher,tax:inHigher*RULES.dividendHigherRate});taxable-=inHigher}
 if(taxable>0){tax+=taxable*RULES.dividendAdditionalRate;bands.push({label:'Div additional 39.35%',amount:taxable,tax:taxable*RULES.dividendAdditionalRate})}
 return{tax,bands}
}
function capitalGainsTax(realisedGain,salaryIncome){
 if(realisedGain<=0)return{tax:0,bands:[]};
 const taxable=Math.max(0,realisedGain-RULES.cgtAllowance);
 if(taxable<=0)return{tax:0,bands:[{label:'Within $'+RULES.cgtAllowance+' allowance',amount:realisedGain,tax:0}]};
 const pa=adjustedPersonalAllowance(salaryIncome);
 const taxableSalary=Math.max(0,salaryIncome-pa);
 const basicLeft=Math.max(0,RULES.basicRateBand-Math.min(taxableSalary,RULES.basicRateBand));
 let tax=0;const bands=[];
 const inBasic=Math.min(taxable,basicLeft);
 if(inBasic>0){tax+=inBasic*RULES.cgtBasicRate;bands.push({label:'CGT basic 18%',amount:inBasic,tax:inBasic*RULES.cgtBasicRate})}
 const inHigher=taxable-inBasic;
 if(inHigher>0){tax+=inHigher*RULES.cgtHigherRate;bands.push({label:'CGT higher 24%',amount:inHigher,tax:inHigher*RULES.cgtHigherRate})}
 return{tax,bands}
}
function totalTax(){
 const p=state.profile;
 const it=incomeTax(p.income);
 const ni=nationalInsurance(p.income);
 const dt=dividendTax(p.dividendIncome,p.income);
 const ct=capitalGainsTax(state.gains.cgtRealisedThisYear,p.income);
 const totalLiability=it.tax+ni.ni+dt.tax+ct.tax;
 const grossIncome=p.income+p.dividendIncome+p.savingsInterest+p.rentalIncome+state.gains.cgtRealisedThisYear;
 return{
 incomeTax:it.tax,bands:it.bands,paUsed:it.paUsed,marginalRate:it.marginalRate,
 ni:ni.ni,dividendTax:dt.tax,cgt:ct.tax,
 grossIncome,totalLiability,
 effectiveRate:grossIncome>0?totalLiability/grossIncome:0
 }
}
// ════════════════════════════════════════════════════════════════
// PENSION PROJECTION · compound growth
// ════════════════════════════════════════════════════════════════
function retirement accountProjection(currentPot,annualContrib,years,growthRate){
 // years to retirement, growthRate as decimal (e.g. 0.05 for 5%)
 const r=growthRate;
 if(years<=0)return currentPot;
 // future value of current pot + future value of annuity of annual contribs
 const fvPot=currentPot*Math.pow(1+r,years);
 const fvContribs=annualContrib*((Math.pow(1+r,years)-1)/r);
 return fvPot+fvContribs;
}
function annuityIncomeFromPot(pot,annuityRate){return pot*(annuityRate||0.06)}
function drawdownYears(pot,annualWithdrawal,growthRate){
 // years before depleted
 let years=0,bal=pot,r=growthRate||0.04;
 while(bal>0&&years<60){bal=bal*(1+r)-annualWithdrawal;years++;if(bal<=0)break}
 return years
}
// ════════════════════════════════════════════════════════════════
// PORTFOLIO ANALYSIS
// ════════════════════════════════════════════════════════════════
const ASSET_CLASSES = {
 cash: { label: 'Cash', risk: 0 },
 bond: { label: 'Bonds / Gilts', risk: 1 },
 equity: { label: 'Equity / Shares', risk: 3 },
 fund: { label: 'Fund / ETF', risk: 2 },
 reit: { label: 'REIT / Property', risk: 2 },
 commodity:{ label: 'Commodity / Gold', risk: 2 },
 crypto: { label: 'Crypto', risk: 5 },
 retirement account: { label: 'Pension (untyped)', risk: 2 },
 other: { label: 'Other', risk: 2 },
};
const TAX_WRAPPERS = {
 isa_ss: { label: 'S&S IRA' },
 isa_cash: { label: 'Cash IRA' },
 isa_lisa: { label: 'LIRA' },
 isa_if: { label: 'IFIRA' },
 sipp: { label: '401(k)' },
 workplace: { label: 'Workplace retirement account' },
 gia: { label: 'GIA (taxable)' },
 premium: { label: 'Premium Bonds' },
 bank: { label: 'Bank account' },
 other: { label: 'Other' },
};
const RISK_PROFILES = {
 cautious: { eq: 0.20, bond: 0.60, cash: 0.20, label: 'Cautious' },
 balanced: { eq: 0.50, bond: 0.40, cash: 0.10, label: 'Balanced' },
 adventurous: { eq: 0.75, bond: 0.20, cash: 0.05, label: 'Adventurous' },
 aggressive: { eq: 0.90, bond: 0.05, cash: 0.05, label: 'Aggressive' },
};
function portfolioAnalysis(){
 const h=state.holdings;
 const total=h.reduce((s,x)=>s+(+x.value||0),0);
 if(!total)return{total:0,byClass:{},byWrapper:{},riskScore:0,equity:0,bond:0,cash:0,concentration:[],target:RISK_PROFILES[state.profile.riskProfile]||RISK_PROFILES.balanced};
 const byClass={},byWrapper={};let riskWeighted=0;
 for(const x of h){
 const v=+x.value||0;
 byClass[x.assetClass]=(byClass[x.assetClass]||0)+v;
 byWrapper[x.taxWrapper]=(byWrapper[x.taxWrapper]||0)+v;
 riskWeighted+=v*(ASSET_CLASSES[x.assetClass]?.risk||2);
 }
 const riskScore=total>0?riskWeighted/total:0;
 // bucket into equity/bond/cash for target comparison
 const equity=(byClass.equity||0)+(byClass.fund||0)+(byClass.reit||0)+(byClass.crypto||0);
 const bond=(byClass.bond||0);
 const cash=(byClass.cash||0)+(byClass.premium||0);
 // concentration: any single holding > 10% of total
 const concentration=h.filter(x=>(+x.value||0)/total>0.10).map(x=>({label:x.label,pct:(+x.value||0)/total}));
 return{total,byClass,byWrapper,riskScore,equity:equity/total,bond:bond/total,cash:cash/total,concentration,target:RISK_PROFILES[state.profile.riskProfile]||RISK_PROFILES.balanced}
}
// ════════════════════════════════════════════════════════════════
// THE RECOMMENDER · suggestions, T0 deterministic
// ════════════════════════════════════════════════════════════════
function generateSuggestions(){
 const p=state.profile,c=state.contribs;
 const tax=totalTax();
 const out=[];
 // IRA allowance use
 const isaUsed=(+c.isaThisYear||0)+(+c.lisaThisYear||0);
 const isaLeft=RULES.isaAllowance-isaUsed;
 if(isaLeft>0&&isaLeft<5000)out.push({prio:'med',title:`Use remaining IRA allowance · $${fmt(isaLeft)}`,why:`The $${fmt(RULES.isaAllowance)} IRA allowance resets every 6 April. Unused allowance is lost.`});
 else if(isaLeft>=5000)out.push({prio:'high',title:`Big IRA allowance unused · $${fmt(isaLeft)} of $${fmt(RULES.isaAllowance)}`,why:`Tax-free growth and withdrawals. If you have spare cash earning <4% in a bank, an IRA is likely a better home.`});
 // LIRA (under 50)
 if(p.age<50){
 const lisaLeft=RULES.lisaAllowance-(+c.lisaThisYear||0);
 if(lisaLeft>0)out.push({prio:'med',title:`LIRA bonus available · 25% gov match on $${fmt(lisaLeft)}`,why:`Up to $${fmt(RULES.lisaAllowance)}/yr earns ${pct(RULES.lisaBonusPct)} gov bonus (max $1,000). First-home or age 60+ access · 25% penalty otherwise.`});
 }
 // Higher-rate taxpayer · 401(k) for relief
 if(p.income>RULES.higherRateStart){
 const reliefRate=tax.marginalRate;
 out.push({prio:'high',title:`Higher-rate · 401(k) gets ${pct(reliefRate)} tax relief`,why:`At your marginal rate (${pct(reliefRate)}), $1,000 net into a retirement account reduces your tax bill by $${fmt(1000*reliefRate/(1-reliefRate))}. Worth claiming if you're in the higher band.`});
 }
 // 60% trap (PA taper zone)
 if(p.income>RULES.paTaperStart&&p.income<=125140){
 const intoZone=p.income-RULES.paTaperStart;
 out.push({prio:'high',title:`60% effective tax trap · $${fmt(intoZone)} in the taper zone`,why:`Between $100k-$125,140 you lose $1 of personal allowance per $2 earned · creating a 60% marginal rate. Pension contribution that drops your adjusted income below $100k recovers the full PA.`});
 }
 // Pension annual allowance
 const retirement accountUsed=(+c.sippThisYear||0)+(+c.workplacePensionAnnual||0)+(+c.salarySacrifice||0);
 const retirement accountLeft=RULES.retirement accountAnnualAllowance-retirement accountUsed;
 if(retirement accountLeft<5000&&retirement accountLeft>0)out.push({prio:'low',title:`Approaching retirement account annual allowance · $${fmt(retirement accountLeft)} left of $${fmt(RULES.retirement accountAnnualAllowance)}`,why:`Contributions above $${fmt(RULES.retirement accountAnnualAllowance)} (gross) are taxed at your marginal rate. Carry-forward from previous 3 years may apply.`});
 // CGT allowance
 const cgtLeft=RULES.cgtAllowance-state.gains.cgtRealisedThisYear;
 if(cgtLeft>0&&state.gains.cgtRealisedThisYear===0)out.push({prio:'low',title:`CGT allowance unused · $${fmt(RULES.cgtAllowance)}`,why:`Annual CGT allowance is small ($${fmt(RULES.cgtAllowance)} for 2025-26). Consider Bed & IRA for non-wrapped gains to use it.`});
 // Emergency fund
 const efTarget=p.monthlyExpenses*p.emergencyFundMonths;
 const cashHoldings=state.holdings.filter(h=>h.assetClass==='cash'||h.taxWrapper==='bank'||h.taxWrapper==='isa_cash').reduce((s,h)=>s+(+h.value||0),0);
 if(cashHoldings<efTarget){
 out.push({prio:efTarget-cashHoldings>5000?'high':'med',title:`Emergency fund short · ${money(cashHoldings)} of ${money(efTarget)} target`,why:`Rule of thumb: ${p.emergencyFundMonths} months of essentials ($${fmt(p.monthlyExpenses)}/mo). Easy-access cash IRA / NS&I are typical homes. Top this up before optimising for growth.`});
 }
 // Workplace retirement account match
 if(p.employerContribPct>0){
 const employerMatch=p.income*p.employerContribPct;
 out.push({prio:'med',title:`Capture full employer match · ${pct(p.employerContribPct)} = ${money(employerMatch)}/yr`,why:`Employer matches are free money. Always contribute at least to match the maximum employer top-up before 401(k).`});
 }
 // Portfolio alignment
 const pa=portfolioAnalysis();
 if(pa.total>1000){
 const target=pa.target;
 const eqGap=pa.equity-target.eq;
 if(Math.abs(eqGap)>0.10){
 out.push({prio:Math.abs(eqGap)>0.20?'med':'low',title:`Portfolio drift · equity ${pct(pa.equity)} vs target ${pct(target.eq)} (${target.label})`,why:`Your risk profile suggests ${pct(target.eq)} equity. You are ${eqGap>0?'overweight':'underweight'} by ${pct(Math.abs(eqGap))}. Rebalance via new contributions to avoid CGT.`});
 }
 pa.concentration.forEach(c=>{
 if(c.pct>0.20)out.push({prio:'med',title:`Concentration risk · ${esc(c.label)} is ${pct(c.pct)} of portfolio`,why:`Single-position risk above 20% means a 50% drop on that line reduces total portfolio by ${pct(c.pct*0.5)}. Consider trimming.`});
 });
 }
 // State retirement account qualifying years
 if(p.qualifyingYearsNI<RULES.statePensionQualifyingYears){
 const yearsShort=RULES.statePensionQualifyingYears-p.qualifyingYearsNI;
 const yearlyImpact=RULES.statePensionAnnual*(yearsShort/RULES.statePensionQualifyingYears);
 out.push({prio:'med',title:`State retirement account short by ${yearsShort} years · ${money(yearlyImpact)}/yr at risk`,why:`Full state retirement account (${money(RULES.statePensionAnnual)}/yr) needs ${RULES.statePensionQualifyingYears} qualifying NI years. Each missing year ≈ ${money(RULES.statePensionAnnual/RULES.statePensionQualifyingYears)}/yr lost. Buy back via voluntary Class 3 NI if shortfall is recent.`});
 }
 // Income-relative checks
 if(p.income>0&&p.monthlyExpenses*12>p.income*0.8){
 out.push({prio:'med',title:`Spending is high relative to income`,why:`Annual outgoings (${money(p.monthlyExpenses*12)}) are ${pct(p.monthlyExpenses*12/p.income)} of income. Difficult to invest meaningfully above 80%. Identify one optimisable category.`});
 }
 return out.sort((a,b)=>({high:0,med:1,low:2})[a.prio]-({high:0,med:1,low:2})[b.prio])
}
// ════════════════════════════════════════════════════════════════
// THE Q&A · cascade T0/T2/T3
// ════════════════════════════════════════════════════════════════
const Cascade={
 async detectTier(){const s=state.settings;if(await this._probe())return'T2';if(s.anthropicKey||s.openaiKey||s.geminiKey||s.openrouterKey)return'T3';return'T0'},
 async _probe(){if(this._p!==undefined)return this._p;try{this._p=await Promise.race([fetch('http://127.0.0.1:11434/api/tags').then(r=>r.ok),new Promise(r=>setTimeout(()=>r(false),350))])}catch(e){this._p=false}return this._p},
 async generate(sys,user,maxTok){const s=state.settings,max=maxTok||1400;
 if(s.anthropicKey)try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':s.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:max,system:sys,messages:[{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·Claude',text:d?.content?.[0]?.text||''}}catch(e){}
 if(s.geminiKey)try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${s.geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{parts:[{text:user}]}]})});const d=await r.json();return{tier:'T3·Gemini',text:d?.candidates?.[0]?.content?.parts?.[0]?.text||''}}catch(e){}
 if(s.openaiKey)try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openaiKey},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·GPT',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
 if(s.openrouterKey)try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openrouterKey,'HTTP-Referer':location.origin},body:JSON.stringify({model:'anthropic/claude-haiku-4-5',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·OpenRouter',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
 return{tier:'T0',text:null}
 }
};
async function updateTierBadge(){const t=await Cascade.detectTier();const el=$('#tierBadge');el.textContent=t==='T0'?'offline':t;el.classList.toggle('t3',t!=='T0');$('#pTier').textContent=t==='T0'?'T0':t}
// T0 quick rule-of-thumb answers for common questions
const T0_PATTERNS=[
 {match:/isa vs ?(sipp|retirement account)|sipp vs ?isa|prioritise/i,answer:p=>{
 const t=totalTax();
 return `**IRA vs 401(k) for your profile (${TAX_YEAR}):**
You're at the ${(t.marginalRate*100).toFixed(0)}% marginal rate.
**IRA** · contribute net · tax-free growth & withdrawals · no age lock
**401(k)** · contribute gross with ${(t.marginalRate*100).toFixed(0)}% tax relief · taxable on the way out (75% taxed at retirement marginal rate, 25% tax-free lump sum)
**Heuristic:**
- If marginal rate now > expected marginal rate in retirement → **401(k)** wins on tax arbitrage
- If your employer matches workplace contributions → max the match first
- If you're under 50 and saving for a first home or age 60+ → consider **LIRA** (25% gov bonus)
- Emergency fund first, then match, then IRA/401(k) per the above
Your current IRA used: $${fmt((+state.contribs.isaThisYear||0)+(+state.contribs.lisaThisYear||0))} of $${fmt(RULES.isaAllowance)}.
Your retirement account AA used: $${fmt((+state.contribs.sippThisYear||0)+(+state.contribs.workplacePensionAnnual||0)+(+state.contribs.salarySacrifice||0))} of $${fmt(RULES.retirement accountAnnualAllowance)}.`;
 }},
 {match:/cgt|capital gains?/i,answer:p=>{
 const m=p.match(/$?(\d[\d,]*)/);const sale=m?parseInt(m[1].replace(/,/g,'')):0;
 const ct=capitalGainsTax(sale||state.gains.cgtRealisedThisYear,state.profile.income);
 return `**CGT for 2025-26:**
- Annual allowance: $${fmt(RULES.cgtAllowance)} (gains below this are tax-free)
- Basic rate: ${(RULES.cgtBasicRate*100).toFixed(0)}% · Higher rate: ${(RULES.cgtHigherRate*100).toFixed(0)}%
${sale?`Estimated CGT on $${fmt(sale)} realised gain at your income ($${fmt(state.profile.income)}): **$${fmt(ct.tax)}**`:''}
**Reductions:**
- Spouse transfer (no CGT, doubles allowance)
- Bed & IRA / Bed & 401(k) to use allowance & shelter gains
- Hold off until next tax year to use a fresh allowance
- Pair gains with losses harvested elsewhere`;
 }},
 {match:/state retirement account|qualifying years/i,answer:p=>{
 const yrs=state.profile.qualifyingYearsNI;
 const yrly=RULES.statePensionAnnual*(Math.min(yrs,35)/35);
 return `**State retirement account (2025-26):**
- Full: ${money(RULES.statePensionAnnual)}/yr (${money(RULES.statePensionWeekly)}/wk)
- Need 35 qualifying NI years for full
- Need 10 minimum to get anything
You: ${yrs} years → estimated ${money(yrly)}/yr
Each missing year ≈ ${money(RULES.statePensionAnnual/35)}/yr lost
**Top up via voluntary Class 3 NI** (~$907/year per missing year as of 2025-26) · usually pays back within 3-4 years of retirement. Worth doing if you have shortfalls in last 6 years (deadline for older years passed in April 2025).`;
 }},
 {match:/personal allowance|60% trap|taper/i,answer:p=>{
 const inc=state.profile.income;
 const pa=adjustedPersonalAllowance(inc);
 const inZone=inc>100000&&inc<=125140;
 return `**Personal Allowance taper (2025-26):**
- Full PA: $${fmt(RULES.personalAllowance)}
- Reduces $1 per $2 over $100,000
- Fully exhausted at $125,140
Your PA: **$${fmt(pa)}** of $${fmt(RULES.personalAllowance)}
${inZone?`⚠ You are IN the 60% trap.
Every $1 you earn between $100k-$125,140 is taxed at:
- 40% income tax
- + lose 50p of PA (which would have been tax-free) = 40% × 50p = 20p
- Effective: **60%** marginal rate
**Fix:** salary sacrifice or personal retirement account contribution that drops your *adjusted net income* below $100,000. $25k retirement account contribution at $125k income recovers the full PA AND gets 40% tax relief on the contribution → effective ~60% benefit.`:''}`;
 }},
];
async function answerQuestion(q){
 // T0 first
 for(const pat of T0_PATTERNS){if(pat.match.test(q))return{src:'T0 · US rules engine ('+TAX_YEAR+')',text:pat.answer(q)}}
 // T3 with full context
 const tier=await Cascade.detectTier();
 if(tier!=='T0'){
 const ctx=buildContext();
 const sys=`You are FallAdviser, a US financial-advice tool. **You are informational only — not regulated SEC advice.** Always say so.
US tax year ${TAX_YEAR} rules:
- Personal allowance $${fmt(RULES.personalAllowance)} (taper $1/$2 above $100k, gone at $125,140)
- Income tax: 20% to $50,270 · 40% to $125,140 · 45% above
- NI: 8% $12,570-$50,270, 2% above
- Dividend allowance $${fmt(RULES.dividendAllowance)}; tax 8.75/33.75/39.35%
- CGT allowance $${fmt(RULES.cgtAllowance)}; 18% basic / 24% higher
- IRA $${fmt(RULES.isaAllowance)} (LIRA $${fmt(RULES.lisaAllowance)} sub-allowance)
- Pension AA $${fmt(RULES.retirement accountAnnualAllowance)} (taper above $260k adjusted income)
- State retirement account ${money(RULES.statePensionAnnual)}/yr · need 35 NI years
The user's profile:
${ctx}
Be concrete · cite $ amounts using their numbers · use US terms · short paragraphs · always end with "Verify with HMRC or an authorised adviser before acting."`;
 const r=await Cascade.generate(sys,q,1400);
 if(r.text)return{src:r.tier,text:r.text}
 }
 return{src:'T0 · fallback',text:`I don't have a specific answer for that question in my rule engine. Add an Anthropic / Gemini / OpenAI key in Settings (Gemini is free) to enable smart Q&A grounded in your profile.\n\nIn the meantime, try one of these supported topics:\n- "IRA vs 401(k)"\n- "CGT on $15,000 sale"\n- "State retirement account qualifying years"\n- "60% tax trap / personal allowance"\n- Or check the Tax, Pension, Portfolio tabs.`}
}
function buildContext(){
 const p=state.profile,c=state.contribs;
 const tax=totalTax();
 const pa=portfolioAnalysis();
 return `Age ${p.age} · region ${p.region} · target retirement ${p.targetRetirementAge}
Salary income: ${money(p.income)}
Dividend income: ${money(p.dividendIncome)}
Savings interest: ${money(p.savingsInterest)}
Marginal rate: ${pct(tax.marginalRate)} · effective: ${pct(tax.effectiveRate)} · total tax: ${money(tax.totalLiability)}
Tax-year contributions:
- IRA: ${money(+c.isaThisYear||0)} of ${money(RULES.isaAllowance)}
- LIRA: ${money(+c.lisaThisYear||0)} of ${money(RULES.lisaAllowance)}
- 401(k): ${money(+c.sippThisYear||0)}
- Workplace retirement account (employee): ${money(+c.workplacePensionAnnual||0)} · employer ${pct(p.employerContribPct)}
- Salary sacrifice: ${money(+c.salarySacrifice||0)}
Portfolio: ${money(pa.total)} total
- Equity: ${pct(pa.equity)} · Bond: ${pct(pa.bond)} · Cash: ${pct(pa.cash)}
- Risk profile target: ${pa.target.label} (${pct(pa.target.eq)} equity)
- Risk score: ${pa.riskScore.toFixed(1)}/5
- CGT realised this year: ${money(state.gains.cgtRealisedThisYear)}
NI qualifying years: ${p.qualifyingYearsNI}/${RULES.statePensionQualifyingYears}
Monthly expenses: ${money(p.monthlyExpenses)} · emergency fund target: ${money(p.monthlyExpenses*p.emergencyFundMonths)}
Estate awareness: this user runs a sovereign-tools estate (see fall-registry).
Adjacent tools available: FallAccount (trades), FallLedger (GL), FallFlow (cashflow), FallInvoice, FallAP.`;
}
// ════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════
function showApp(id){state.active=id;saveAll();render()}
function render(){
 $('#tabNav').innerHTML=TABS.map(t=>`<button class="${state.active===t.id?'active':''}" onclick="showApp('${t.id}')"><span style="font-family:var(--serif);font-size:14px;color:var(--brass)">${t.ico}</span>${t.name}</button>`).join('');
 ({dashboard:viewDashboard,profile:viewProfile,tax:viewTax,retirement account:viewPension,portfolio:viewPortfolio,qa:viewQA,reports:viewReports})[state.active]();
}
function viewDashboard(){
 const p=state.profile;
 const t=totalTax();
 const pa=portfolioAnalysis();
 const sugg=generateSuggestions();
 const isaUsedPct=((+state.contribs.isaThisYear||0)+(+state.contribs.lisaThisYear||0))/RULES.isaAllowance;
 const retirement accountUsedPct=((+state.contribs.sippThisYear||0)+(+state.contribs.workplacePensionAnnual||0)+(+state.contribs.salarySacrifice||0))/RULES.retirement accountAnnualAllowance;
 const efTarget=p.monthlyExpenses*p.emergencyFundMonths;
 const cashHoldings=state.holdings.filter(h=>h.assetClass==='cash'||h.taxWrapper==='bank'||h.taxWrapper==='isa_cash').reduce((s,h)=>s+(+h.value||0),0);
 const efPct=Math.min(1,cashHoldings/efTarget);
 $('#view').innerHTML=`
 <div class="disclaimer">
 <strong>FallAdviser is informational, not regulated financial advice.</strong> US rules calibrated to the ${TAX_YEAR} tax year. The calculations use simplifications (e.g. England/Wales/NI rates, employed PAYE NI). For binding decisions, consult an SEC-authorised adviser or HMRC directly. Your data stays on your device · P3 audit chain ${state.settings.auditChain?'ON':'OFF'}.
 </div>
 <div class="section-h">
 <div><h2>Dashboard</h2><div class="sub">snapshot · year ${TAX_YEAR} · ${p.name||'unnamed'} · age ${p.age}</div></div>
 </div>
 <div class="grid">
 <div class="card">
 <h3>tax position <span class="meta">${TAX_YEAR}</span></h3>
 <div class="kpi"><span class="l">Income</span><span class="v">${money(p.income)}</span></div>
 <div class="kpi"><span class="l">Income tax</span><span class="v red">−${money(t.incomeTax)}</span></div>
 <div class="kpi"><span class="l">NI (employee)</span><span class="v red">−${money(t.ni)}</span></div>
 <div class="kpi"><span class="l">Dividend tax</span><span class="v red">−${money(t.dividendTax)}</span></div>
 <div class="kpi"><span class="l">CGT realised</span><span class="v red">−${money(t.cgt)}</span></div>
 <div class="kpi"><span class="l">Marginal rate</span><span class="v amber">${pct(t.marginalRate)}</span></div>
 <div class="kpi"><span class="l">Effective rate</span><span class="v brass">${pct(t.effectiveRate)}</span></div>
 </div>
 <div class="card">
 <h3>allowance usage <span class="meta">${TAX_YEAR}</span></h3>
 <div class="kpi"><span class="l">IRA · ${money((+state.contribs.isaThisYear||0)+(+state.contribs.lisaThisYear||0))} / ${money(RULES.isaAllowance)}</span><span class="v">${(isaUsedPct*100).toFixed(0)}%</span></div>
 <div class="bar"><div style="width:${Math.min(100,isaUsedPct*100)}%" class="${isaUsedPct>0.9?'green':'amber'}"></div></div>
 <div class="kpi"><span class="l">Pension AA</span><span class="v">${(retirement accountUsedPct*100).toFixed(0)}%</span></div>
 <div class="bar"><div style="width:${Math.min(100,retirement accountUsedPct*100)}%" class="${retirement accountUsedPct>0.9?'green':'brass'}"></div></div>
 <div class="kpi"><span class="l">Emergency fund</span><span class="v">${money(cashHoldings)} / ${money(efTarget)}</span></div>
 <div class="bar"><div style="width:${Math.min(100,efPct*100)}%" class="${efPct>=1?'green':'red'}"></div></div>
 <div class="kpi"><span class="l">NI years</span><span class="v">${p.qualifyingYearsNI} / ${RULES.statePensionQualifyingYears}</span></div>
 <div class="bar"><div style="width:${Math.min(100,(p.qualifyingYearsNI/RULES.statePensionQualifyingYears)*100)}%" class="${p.qualifyingYearsNI>=RULES.statePensionQualifyingYears?'green':'amber'}"></div></div>
 </div>
 <div class="card">
 <h3>portfolio <span class="meta">net ${money(pa.total)}</span></h3>
 <div class="kpi"><span class="l">Equity</span><span class="v">${pct(pa.equity)}</span></div>
 <div class="kpi"><span class="l">Bonds</span><span class="v">${pct(pa.bond)}</span></div>
 <div class="kpi"><span class="l">Cash</span><span class="v">${pct(pa.cash)}</span></div>
 <div class="kpi"><span class="l">Risk score</span><span class="v brass">${pa.riskScore.toFixed(1)}/5</span></div>
 <div class="kpi"><span class="l">Target profile</span><span class="v">${pa.target.label}</span></div>
 ${pa.concentration.length?`<div class="kpi"><span class="l">Concentration</span><span class="v amber">${pa.concentration.length}</span></div>`:''}
 </div>
 <div class="card" style="grid-column:1/-1">
 <h3>recommendations <span class="meta">${sugg.length} action${sugg.length===1?'':'s'}</span></h3>
 ${sugg.length===0?`<div style="font-size:13px;color:var(--cream-dim);font-style:italic;padding:10px">No urgent recommendations. Run through the tabs to populate your data.</div>`:sugg.slice(0,7).map(s=>`<div class="sug ${s.prio}"><div class="prio">${esc(s.prio)} priority</div><div>${esc(s.title)}</div><div class="why">${esc(s.why)}</div></div>`).join('')}
 </div>
 </div>
 `;
}
function viewProfile(){
 const p=state.profile;
 $('#view').innerHTML=`
 <div class="section-h"><div><h2>Profile</h2><div class="sub">your numbers · drives everything · stays on this device</div></div></div>
 <div class="grid">
 <div class="card">
 <h3>basics</h3>
 <div class="row">
 <div class="field"><label>name</label><input id="p_name" value="${esc(p.name)}"></div>
 <div class="field"><label>age</label><input id="p_age" type="number" min="0" max="120" value="${p.age}"></div>
 </div>
 <div class="row">
 <div class="field"><label>region</label><select id="p_region"><option ${p.region==='England'?'selected':''}>England</option><option ${p.region==='Wales'?'selected':''}>Wales</option><option ${p.region==='NI'?'selected':''}>NI</option><option ${p.region==='Scotland'?'selected':''}>Scotland</option></select><div class="hint">Scotland has different income-tax bands (not yet modelled)</div></div>
 <div class="field"><label>target retirement age</label><input id="p_tra" type="number" min="40" max="80" value="${p.targetRetirementAge}"></div>
 </div>
 </div>
 <div class="card">
 <h3>income</h3>
 <div class="field"><label>salary income (gross, $/yr)</label><input id="p_inc" type="number" value="${p.income}"></div>
 <div class="field"><label>dividend income ($/yr)</label><input id="p_div" type="number" value="${p.dividendIncome}"></div>
 <div class="field"><label>savings interest ($/yr)</label><input id="p_sav" type="number" value="${p.savingsInterest}"></div>
 <div class="field"><label>rental income ($/yr)</label><input id="p_rent" type="number" value="${p.rentalIncome}"></div>
 </div>
 <div class="card">
 <h3>workplace retirement account</h3>
 <div class="row">
 <div class="field"><label>your contribution %</label><input id="p_epp" type="number" step="0.01" value="${p.employerPensionPct}"><div class="hint">e.g. 0.05 = 5%</div></div>
 <div class="field"><label>employer match %</label><input id="p_emp" type="number" step="0.01" value="${p.employerContribPct}"></div>
 </div>
 </div>
 <div class="card">
 <h3>risk + lifestyle</h3>
 <div class="field"><label>risk profile</label><select id="p_risk">
 <option value="cautious" ${p.riskProfile==='cautious'?'selected':''}>Cautious (20% equity)</option>
 <option value="balanced" ${p.riskProfile==='balanced'?'selected':''}>Balanced (50% equity)</option>
 <option value="adventurous" ${p.riskProfile==='adventurous'?'selected':''}>Adventurous (75% equity)</option>
 <option value="aggressive" ${p.riskProfile==='aggressive'?'selected':''}>Aggressive (90% equity)</option>
 </select></div>
 <div class="row">
 <div class="field"><label>monthly essentials ($)</label><input id="p_mex" type="number" value="${p.monthlyExpenses}"></div>
 <div class="field"><label>emergency fund (months)</label><input id="p_efm" type="number" min="0" max="24" value="${p.emergencyFundMonths}"></div>
 </div>
 </div>
 <div class="card">
 <h3>state retirement account · NI</h3>
 <div class="field"><label>qualifying years so far</label><input id="p_qy" type="number" min="0" max="50" value="${p.qualifyingYearsNI}"><div class="hint">Check at <a href="https://www.gov.uk/check-state-retirement account" target="_blank">gov.uk/check-state-retirement account</a> · need ${RULES.statePensionQualifyingYears} for full</div></div>
 </div>
 <div class="card">
 <h3>this year's contributions <span class="meta">${TAX_YEAR}</span></h3>
 <div class="row">
 <div class="field"><label>IRA so far ($)</label><input id="c_isa" type="number" value="${state.contribs.isaThisYear}"></div>
 <div class="field"><label>LIRA so far ($)</label><input id="c_lisa" type="number" value="${state.contribs.lisaThisYear}"></div>
 </div>
 <div class="row">
 <div class="field"><label>401(k) so far ($)</label><input id="c_sipp" type="number" value="${state.contribs.sippThisYear}"></div>
 <div class="field"><label>workplace retirement account ($/yr)</label><input id="c_wp" type="number" value="${state.contribs.workplacePensionAnnual}"></div>
 </div>
 <div class="row">
 <div class="field"><label>salary sacrifice ($)</label><input id="c_ss" type="number" value="${state.contribs.salarySacrifice}"></div>
 <div class="field"><label>CGT realised ($)</label><input id="g_cgt" type="number" value="${state.gains.cgtRealisedThisYear}"></div>
 </div>
 </div>
 </div>
 <div style="margin-top:14px;text-align:right"><button class="btn primary" onclick="saveProfile()">save profile</button></div>
 `;
}
function saveProfile(){
 const p=state.profile,c=state.contribs;
 p.name=$('#p_name').value;p.age=+$('#p_age').value||0;p.region=$('#p_region').value;p.targetRetirementAge=+$('#p_tra').value||67;
 p.income=+$('#p_inc').value||0;p.dividendIncome=+$('#p_div').value||0;p.savingsInterest=+$('#p_sav').value||0;p.rentalIncome=+$('#p_rent').value||0;
 p.employerPensionPct=+$('#p_epp').value||0;p.employerContribPct=+$('#p_emp').value||0;
 p.riskProfile=$('#p_risk').value;p.monthlyExpenses=+$('#p_mex').value||0;p.emergencyFundMonths=+$('#p_efm').value||0;
 p.qualifyingYearsNI=+$('#p_qy').value||0;
 c.isaThisYear=+$('#c_isa').value||0;c.lisaThisYear=+$('#c_lisa').value||0;c.sippThisYear=+$('#c_sipp').value||0;c.workplacePensionAnnual=+$('#c_wp').value||0;c.salarySacrifice=+$('#c_ss').value||0;
 state.gains.cgtRealisedThisYear=+$('#g_cgt').value||0;
 saveAll();toast('profile saved');render();
}
function viewTax(){
 const t=totalTax();
 const p=state.profile;
 $('#view').innerHTML=`
 <div class="section-h"><div><h2>Tax position</h2><div class="sub">US ${TAX_YEAR} · band breakdown · liability composition</div></div></div>
 <div class="grid">
 <div class="card">
 <h3>income tax bands</h3>
 <table>
 <tr><th>band</th><th class="r">income</th><th class="r">tax</th></tr>
 <tr><td>Personal allowance</td><td class="r">${money(t.paUsed)}</td><td class="r">${money(0)}</td></tr>
 ${t.bands.map(b=>`<tr><td>${esc(b.label)}</td><td class="r">${money(b.amount)}</td><td class="r">${money(b.tax)}</td></tr>`).join('')}
 <tr class="total"><td>Income tax total</td><td class="r">${money(p.income-t.paUsed)}</td><td class="r">${money(t.incomeTax)}</td></tr>
 </table>
 <div style="margin-top:14px;font-size:11px;color:var(--cream-muted);font-family:var(--mono)">
 marginal rate · ${pct(t.marginalRate)} ${p.income>100000&&p.income<=125140?'<span class="tag red">60% TRAP</span>':''}
 </div>
 </div>
 <div class="card">
 <h3>total liability</h3>
 <table>
 <tr><th>tax</th><th class="r">amount</th></tr>
 <tr><td>Income tax</td><td class="r">${money(t.incomeTax)}</td></tr>
 <tr><td>National insurance</td><td class="r">${money(t.ni)}</td></tr>
 <tr><td>Dividend tax</td><td class="r">${money(t.dividendTax)}</td></tr>
 <tr><td>Capital gains tax</td><td class="r">${money(t.cgt)}</td></tr>
 <tr class="total"><td>TOTAL</td><td class="r">${money(t.totalLiability)}</td></tr>
 <tr><td>Effective rate</td><td class="r">${pct(t.effectiveRate)}</td></tr>
 <tr><td>Marginal rate</td><td class="r">${pct(t.marginalRate)}</td></tr>
 <tr><td>Net take-home (rough)</td><td class="r">${money(t.grossIncome-t.totalLiability)}</td></tr>
 </table>
 </div>
 <div class="card">
 <h3>allowances · ${TAX_YEAR}</h3>
 <table>
 <tr><th>allowance</th><th class="r">limit</th><th class="r">used</th></tr>
 <tr><td>Personal allowance</td><td class="r">${money(RULES.personalAllowance)}</td><td class="r">${money(t.paUsed)}</td></tr>
 <tr><td>Dividend allowance</td><td class="r">${money(RULES.dividendAllowance)}</td><td class="r">${money(Math.min(p.dividendIncome,RULES.dividendAllowance))}</td></tr>
 <tr><td>CGT allowance</td><td class="r">${money(RULES.cgtAllowance)}</td><td class="r">${money(Math.min(state.gains.cgtRealisedThisYear,RULES.cgtAllowance))}</td></tr>
 <tr><td>IRA</td><td class="r">${money(RULES.isaAllowance)}</td><td class="r">${money((+state.contribs.isaThisYear||0)+(+state.contribs.lisaThisYear||0))}</td></tr>
 <tr><td>LIRA (within IRA)</td><td class="r">${money(RULES.lisaAllowance)}</td><td class="r">${money(state.contribs.lisaThisYear||0)}</td></tr>
 <tr><td>Pension annual allowance</td><td class="r">${money(RULES.retirement accountAnnualAllowance)}</td><td class="r">${money((+state.contribs.sippThisYear||0)+(+state.contribs.workplacePensionAnnual||0)+(+state.contribs.salarySacrifice||0))}</td></tr>
 </table>
 </div>
 <div class="card">
 <h3>optimisation · what-ifs</h3>
 <p style="font-size:13px;color:var(--cream-dim);margin-bottom:10px">Model a retirement account contribution to see tax saved:</p>
 <div class="row">
 <div class="field"><label>contribute to retirement account (gross)</label><input id="wi_retirement account" type="number" value="0"></div>
 <div class="field"><label>impact</label><div id="wi_result" style="padding:7px 10px;background:var(--ink);border-radius:3px;font-size:12px;font-family:var(--mono);color:var(--brass);min-height:30px">enter amount to see effect</div></div>
 </div>
 </div>
 </div>
 `;
 // wire what-if
 $('#wi_retirement account').oninput=e=>{
 const contrib=+e.target.value||0;
 const newIncome=p.income-contrib;
 const newT=incomeTax(newIncome);
 const saved=t.incomeTax-newT.tax;
 const reliefAtSource=contrib*0.20;
 const additionalRelief=saved-reliefAtSource;
 $('#wi_result').innerHTML=contrib?`tax saved: ${money(saved)}<br>via PAYE: ${money(reliefAtSource)}<br>reclaim (SA): ${money(Math.max(0,additionalRelief))}`:`enter amount to see effect`;
 };
}
function viewPension(){
 const p=state.profile;
 const currentPot=state.holdings.filter(h=>h.taxWrapper==='sipp'||h.taxWrapper==='workplace').reduce((s,h)=>s+(+h.value||0),0);
 const annualContrib=(+state.contribs.sippThisYear||0)+(+state.contribs.workplacePensionAnnual||0)+(+state.contribs.salarySacrifice||0)+p.income*p.employerContribPct;
 const yearsToRetire=Math.max(0,p.targetRetirementAge-p.age);
 const scenarios=[
 {label:'Conservative · 3% growth',rate:0.03},
 {label:'Moderate · 5% growth',rate:0.05},
 {label:'Optimistic · 7% growth',rate:0.07},
 ];
 $('#view').innerHTML=`
 <div class="section-h"><div><h2>Pension</h2><div class="sub">state · workplace · 401(k) · ${yearsToRetire} years to ${p.targetRetirementAge}</div></div></div>
 <div class="grid">
 <div class="card">
 <h3>state retirement account</h3>
 <div class="kpi"><span class="l">Full (35 yrs NI)</span><span class="v">${money(RULES.statePensionAnnual)}/yr</span></div>
 <div class="kpi"><span class="l">Your years</span><span class="v">${p.qualifyingYearsNI}</span></div>
 <div class="kpi"><span class="l">Your est entitlement</span><span class="v brass">${money(RULES.statePensionAnnual*(Math.min(p.qualifyingYearsNI,35)/35))}/yr</span></div>
 <div class="bar"><div style="width:${Math.min(100,(p.qualifyingYearsNI/35)*100)}%" class="${p.qualifyingYearsNI>=35?'green':'amber'}"></div></div>
 ${p.qualifyingYearsNI<35?`<div style="font-size:11px;color:var(--cream-dim);margin-top:8px">Top up via Class 3 voluntary NI (~$907 per missing year · pays back in 3-4 years). Check gov.uk for the exact rate.</div>`:'<div style="font-size:11px;color:var(--green);margin-top:8px">✓ Full state retirement account entitlement.</div>'}
 </div>
 <div class="card">
 <h3>workplace + 401(k)</h3>
 <div class="kpi"><span class="l">Current pot</span><span class="v">${money(currentPot)}</span></div>
 <div class="kpi"><span class="l">Your contributions/yr</span><span class="v">${money((+state.contribs.sippThisYear||0)+(+state.contribs.workplacePensionAnnual||0)+(+state.contribs.salarySacrifice||0))}</span></div>
 <div class="kpi"><span class="l">Employer/yr</span><span class="v green">${money(p.income*p.employerContribPct)}</span></div>
 <div class="kpi"><span class="l">Total/yr</span><span class="v brass">${money(annualContrib)}</span></div>
 <div class="kpi"><span class="l">Years to retire</span><span class="v">${yearsToRetire}</span></div>
 </div>
 <div class="card" style="grid-column:1/-1">
 <h3>projection · current pot + contributions</h3>
 <table>
 <tr><th>scenario</th><th class="r">pot at ${p.targetRetirementAge}</th><th class="r">annuity income (6%)</th><th class="r">drawdown · 4% rule</th><th class="r">drawdown yrs</th></tr>
 ${scenarios.map(s=>{
 const pot=retirement accountProjection(currentPot,annualContrib,yearsToRetire,s.rate);
 const annuity=annuityIncomeFromPot(pot,0.06);
 const fourPct=pot*0.04;
 const dwYears=drawdownYears(pot,fourPct,s.rate*0.6);
 return `<tr><td>${esc(s.label)}</td><td class="r">${money(pot)}</td><td class="r">${money(annuity)}/yr</td><td class="r">${money(fourPct)}/yr</td><td class="r">${dwYears>=60?'30+':dwYears}</td></tr>`;
 }).join('')}
 </table>
 <div style="margin-top:14px;font-size:11px;color:var(--cream-muted)">
 Adds your state retirement account (${money(RULES.statePensionAnnual*(Math.min(p.qualifyingYearsNI+yearsToRetire,35)/35))}/yr est at retirement) on top of pot income. 4% rule (Trinity study) is a starting heuristic only.
 </div>
 </div>
 <div class="card">
 <h3>retirement income · combined estimate</h3>
 ${scenarios.map(s=>{
 const pot=retirement accountProjection(currentPot,annualContrib,yearsToRetire,s.rate);
 const fourPct=pot*0.04;
 const futureSP=RULES.statePensionAnnual*(Math.min(p.qualifyingYearsNI+yearsToRetire,35)/35);
 const combined=fourPct+futureSP;
 return `<div class="kpi"><span class="l">${esc(s.label)}</span><span class="v brass">${money(combined)}/yr</span></div>`;
 }).join('')}
 <div style="font-size:11px;color:var(--cream-muted);margin-top:8px">Real (inflation-adjusted) numbers in today's pounds. Apply your own inflation assumption.</div>
 </div>
 <div class="card">
 <h3>allowances · limits</h3>
 <div class="kpi"><span class="l">Annual allowance</span><span class="v">${money(RULES.retirement accountAnnualAllowance)}</span></div>
 <div class="kpi"><span class="l">Used this year</span><span class="v">${money(annualContrib-p.income*p.employerContribPct)}</span></div>
 <div class="kpi"><span class="l">Lump sum allowance</span><span class="v">${money(RULES.lumpSumAllowance)}</span></div>
 <div class="kpi"><span class="l">Tax-free cash %</span><span class="v">25%</span></div>
 <div style="font-size:11px;color:var(--cream-muted);margin-top:8px">Carry-forward: unused AA from previous 3 tax years can be brought forward if you have retirement accountable earnings to cover it.</div>
 </div>
 </div>
 `;
}
function viewPortfolio(){
 const pa=portfolioAnalysis();
 $('#view').innerHTML=`
 <div class="section-h"><div><h2>Portfolio</h2><div class="sub">${state.holdings.length} positions · ${money(pa.total)} net</div></div>
 <div class="actions"><button class="btn primary" onclick="addHolding()">+ add holding</button><button class="btn" onclick="rebalanceSuggestion()">rebalance suggestion</button></div></div>
 <div class="grid">
 <div class="card" style="grid-column:1/-1">
 <h3>holdings</h3>
 <div class="hold-row head">
 <div>label</div><div>value ($)</div><div>asset class</div><div>tax wrapper</div><div>cost basis</div><div></div>
 </div>
 <div id="holdList">${state.holdings.map((h,i)=>renderHolding(h,i)).join('')||'<div style="padding:18px;color:var(--cream-muted);font-style:italic;text-align:center">No holdings yet. Click + add holding above.</div>'}</div>
 </div>
 <div class="card">
 <h3>asset allocation</h3>
 ${pa.total>0?Object.entries(pa.byClass).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
 <div class="kpi"><span class="l">${esc(ASSET_CLASSES[k]?.label||k)}</span><span class="v">${money(v)} · ${pct(v/pa.total)}</span></div>
 <div class="bar"><div style="width:${(v/pa.total*100).toFixed(1)}%" class="brass"></div></div>
 `).join(''):'<div style="font-size:13px;color:var(--cream-muted);font-style:italic">add holdings to analyse</div>'}
 <div style="margin-top:10px"><span class="tag">target · ${pa.target.label}</span> <span class="tag">${pct(pa.target.eq)} eq</span></div>
 </div>
 <div class="card">
 <h3>tax wrapper split</h3>
 ${pa.total>0?Object.entries(pa.byWrapper).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
 <div class="kpi"><span class="l">${esc(TAX_WRAPPERS[k]?.label||k)}</span><span class="v">${money(v)} · ${pct(v/pa.total)}</span></div>
 `).join(''):'<div style="font-size:13px;color:var(--cream-muted);font-style:italic">add holdings to analyse</div>'}
 </div>
 ${pa.concentration.length?`<div class="card" style="border-color:var(--amber)">
 <h3>concentration warning</h3>
 ${pa.concentration.map(c=>`<div class="kpi"><span class="l">${esc(c.label)}</span><span class="v amber">${pct(c.pct)}</span></div>`).join('')}
 <div style="font-size:11px;color:var(--cream-muted);margin-top:8px">Positions over 10% of total · single-stock risk. Consider trimming or hedging.</div>
 </div>`:''}
 </div>
 `;
}
function renderHolding(h,i){
 return `<div class="hold-row">
 <input value="${esc(h.label||'')}" onchange="updHolding(${i},'label',this.value)" placeholder="VWRL · S&S IRA · 100 units · etc">
 <input type="number" value="${h.value||0}" onchange="updHolding(${i},'value',+this.value)">
 <select onchange="updHolding(${i},'assetClass',this.value)">${Object.entries(ASSET_CLASSES).map(([k,v])=>`<option value="${k}" ${h.assetClass===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select>
 <select onchange="updHolding(${i},'taxWrapper',this.value)">${Object.entries(TAX_WRAPPERS).map(([k,v])=>`<option value="${k}" ${h.taxWrapper===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select>
 <input type="number" value="${h.costBasis||0}" onchange="updHolding(${i},'costBasis',+this.value)">
 <span class="x" onclick="rmHolding(${i})">×</span>
 </div>`;
}
function addHolding(){state.holdings.push({id:uid(),label:'',value:0,assetClass:'equity',taxWrapper:'isa_ss',costBasis:0});saveAll();render()}
function updHolding(i,k,v){if(state.holdings[i]){state.holdings[i][k]=v;saveAll();if(k==='value'||k==='assetClass'||k==='taxWrapper')render()}}
function rmHolding(i){if(!confirm('remove this holding?'))return;state.holdings.splice(i,1);saveAll();render()}
function rebalanceSuggestion(){
 const pa=portfolioAnalysis();if(!pa.total){toast('add holdings first');return}
 const target=pa.target;
 const eqTarget=pa.total*target.eq;
 const eqCurrent=pa.total*pa.equity;
 const gap=eqTarget-eqCurrent;
 openModal('rebalance',{gap,target,pa});
}
function viewQA(){
 $('#view').innerHTML=`
 <div class="section-h"><div><h2>Q & A</h2><div class="sub">ask anything · T0 rules for common topics · T3 (BYOK) for nuanced questions</div></div>
 <div class="actions"><button class="btn sm" onclick="state.chat=[];saveAll();viewQA()">clear</button></div></div>
 <div class="card">
 <div class="chat" id="chat">${renderChat()}</div>
 <div class="chat-input">
 <input id="qInput" placeholder="ask · 'IRA or 401(k) first this year?' · 'CGT if I sell $15k of VWRL' · '60% tax trap' · 'state retirement account top-up worth it?'">
 <button class="btn primary" onclick="askQuestion()">ask</button>
 </div>
 <div style="margin-top:10px;font-size:11px;color:var(--cream-muted);font-family:var(--mono)">try: "IRA vs 401(k)" · "CGT on $20k" · "60% trap" · "state retirement account qualifying years"</div>
 </div>
 `;
 $('#qInput').addEventListener('keydown',e=>{if(e.key==='Enter')askQuestion()});
}
function renderChat(){
 if(!state.chat.length)return `<div style="text-align:center;padding:30px;color:var(--cream-muted);font-style:italic">No questions yet. Ask anything about your US finances.</div>`;
 return state.chat.map(m=>`<div class="msg ${m.role}">${esc(m.text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}${m.src?`<div class="src">${esc(m.src)}</div>`:''}</div>`).join('');
}
async function askQuestion(){
 const q=$('#qInput').value.trim();if(!q)return;
 state.chat.push({role:'user',text:q});$('#qInput').value='';
 $('#chat').innerHTML=renderChat()+`<div class="msg bot"><em style="color:var(--cream-muted)">thinking…</em></div>`;
 $('#chat').scrollTop=$('#chat').scrollHeight;
 const ans=await answerQuestion(q);
 state.chat.push({role:'bot',text:ans.text,src:ans.src});
 saveAll();$('#chat').innerHTML=renderChat();$('#chat').scrollTop=$('#chat').scrollHeight;
}
function viewReports(){
 const t=totalTax();
 const pa=portfolioAnalysis();
 const sugg=generateSuggestions();
 $('#view').innerHTML=`
 <div class="section-h"><div><h2>Reports</h2><div class="sub">downloadable summary · export your state</div></div></div>
 <div class="grid">
 <div class="card">
 <h3>annual tax summary</h3>
 <p style="font-size:13px;color:var(--cream-dim);margin-bottom:12px">Markdown summary for the ${TAX_YEAR} tax year covering income, bands, allowances, and recommendations.</p>
 <button class="btn" onclick="exportTaxSummary()">↓ download .md</button>
 <button class="btn sm" onclick="exportTaxSummary('pdf')">↓ via FallPDF</button>
 </div>
 <div class="card">
 <h3>portfolio export</h3>
 <p style="font-size:13px;color:var(--cream-dim);margin-bottom:12px">CSV of all holdings with values, asset class, tax wrapper, and cost basis.</p>
 <button class="btn" onclick="exportPortfolioCSV()">↓ holdings.csv</button>
 </div>
 <div class="card">
 <h3>full state export</h3>
 <p style="font-size:13px;color:var(--cream-dim);margin-bottom:12px">Complete JSON dump of profile, contribs, holdings, settings (no chat). Use to backup or import elsewhere.</p>
 <button class="btn" onclick="exportFullState()">↓ falladviser-us-state.json</button>
 <button class="btn danger sm" onclick="importState()">↑ import</button>
 </div>
 <div class="card">
 <h3>audit chain · P3</h3>
 <p style="font-size:13px;color:var(--cream-dim);margin-bottom:12px">${state.audit.length} entries in chain · prevHash + docHash + reasoning · download for compliance review.</p>
 <button class="btn" onclick="exportAuditChain()">↓ audit-chain.json</button>
 <button class="btn sm" onclick="state.settings.auditChain=!state.settings.auditChain;saveAll();render()">${state.settings.auditChain?'disable':'enable'} chain</button>
 </div>
 </div>
 `;
}
function downloadFile(name,content,mime){const blob=new Blob([content],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportTaxSummary(fmtType){
 const p=state.profile;const t=totalTax();const pa=portfolioAnalysis();const sugg=generateSuggestions();
 const md=`# FallAdviser · annual tax summary · ${TAX_YEAR}
**${p.name||'unnamed'} · age ${p.age} · ${p.region}**
## Income
| line | amount |
|---|---:|
| Salary | ${money(p.income)} |
| Dividend | ${money(p.dividendIncome)} |
| Savings interest | ${money(p.savingsInterest)} |
| Rental | ${money(p.rentalIncome)} |
## Tax bands (income tax)
${t.bands.map(b=>`- ${b.label}: ${money(b.amount)} → ${money(b.tax)}`).join('\n')}
**Personal allowance used:** ${money(t.paUsed)}
**Marginal rate:** ${pct(t.marginalRate)}
**Effective rate:** ${pct(t.effectiveRate)}
## Liability summary
| tax | amount |
|---|---:|
| Income tax | ${money(t.incomeTax)} |
| National insurance | ${money(t.ni)} |
| Dividend tax | ${money(t.dividendTax)} |
| Capital gains tax | ${money(t.cgt)} |
| **TOTAL** | **${money(t.totalLiability)}** |
## Allowance usage
| allowance | limit | used |
|---|---:|---:|
| IRA | ${money(RULES.isaAllowance)} | ${money((+state.contribs.isaThisYear||0)+(+state.contribs.lisaThisYear||0))} |
| LIRA (within IRA) | ${money(RULES.lisaAllowance)} | ${money(state.contribs.lisaThisYear||0)} |
| Pension AA | ${money(RULES.retirement accountAnnualAllowance)} | ${money((+state.contribs.sippThisYear||0)+(+state.contribs.workplacePensionAnnual||0)+(+state.contribs.salarySacrifice||0))} |
| CGT | ${money(RULES.cgtAllowance)} | ${money(state.gains.cgtRealisedThisYear)} |
## Portfolio
Total: **${money(pa.total)}** · ${state.holdings.length} positions
- Equity ${pct(pa.equity)} · Bonds ${pct(pa.bond)} · Cash ${pct(pa.cash)}
- Risk score: ${pa.riskScore.toFixed(1)}/5
- Target: ${pa.target.label} (${pct(pa.target.eq)} equity)
## Recommendations
${sugg.map(s=>`### [${s.prio.toUpperCase()}] ${s.title}\n${s.why}`).join('\n\n')}
---
*FallAdviser is informational only · not regulated SEC advice · US ${TAX_YEAR} tax year · always verify with HMRC or an authorised adviser.*
Generated: ${new Date().toISOString().slice(0,16).replace('T',' ')}`;
 if(fmtType==='pdf'){
 // postMessage to fallpdf
 if(target){target.contentWindow.postMessage({target:'fallpdf',action:'setSource',source:md,source_id:'falladviser-us'},'*');toast('sent to FallPDF')}
 else{downloadFile('tax-summary-'+TAX_YEAR+'.md',md,'text/markdown');toast('FallPDF not detected · downloaded .md instead')}
 }else{
 downloadFile('tax-summary-'+TAX_YEAR+'.md',md,'text/markdown');toast('exported')
 }
}
function exportPortfolioCSV(){
 const rows=[['label','value','asset_class','tax_wrapper','cost_basis']];
 state.holdings.forEach(h=>rows.push([h.label||'',h.value||0,ASSET_CLASSES[h.assetClass]?.label||h.assetClass,TAX_WRAPPERS[h.taxWrapper]?.label||h.taxWrapper,h.costBasis||0]));
 const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
 downloadFile('holdings.csv',csv,'text/csv');toast('exported')
}
function exportFullState(){
 const e={schema:'falladviser-us@'+VERSION,exported:new Date().toISOString(),tax_year:TAX_YEAR,profile:state.profile,contribs:state.contribs,holdings:state.holdings,gains:state.gains,settings:{...state.settings,anthropicKey:'',openaiKey:'',geminiKey:'',openrouterKey:''}};
 downloadFile('falladviser-us-state-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(e,null,2),'application/json');toast('exported (keys stripped)')
}
function exportAuditChain(){
 downloadFile('audit-chain-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({schema:'falladviser-us-audit@1',exported:new Date().toISOString(),entries:state.audit},null,2),'application/json');toast('audit chain exported')
}
function importState(){
 const i=document.createElement('input');i.type='file';i.accept='.json';
 i.onchange=async e=>{const f=e.target.files[0];if(!f)return;const text=await f.text();try{const d=JSON.parse(text);if(!confirm('replace local profile + holdings with imported data?'))return;state.profile=Object.assign({},state.profile,d.profile||{});state.contribs=Object.assign({},state.contribs,d.contribs||{});state.holdings=d.holdings||[];state.gains=Object.assign({},state.gains,d.gains||{});saveAll();render();toast('imported')}catch(err){alert('invalid JSON: '+err.message)}};
 i.click()
}
// ════════════════════════════════════════════════════════════════
// PALETTE · ask anything
// ════════════════════════════════════════════════════════════════
function openPalette(){$('#palette').classList.add('open');setTimeout(()=>$('#pInput').focus(),50);renderPaletteSuggestions('')}
function closePalette(){$('#palette').classList.remove('open');$('#pInput').value=''}
function renderPaletteSuggestions(q){
 const body=$('#pBody');
 if(!q.trim()){
 body.innerHTML=`
 <div class="palette-row" onclick="askPalette('IRA vs 401(k) for my profile')"><div>$</div><div>IRA vs 401(k) for my profile</div></div>
 <div class="palette-row" onclick="askPalette('60% tax trap if I earn over 100k')"><div>$</div><div>60% tax trap above $100k</div></div>
 <div class="palette-row" onclick="askPalette('CGT on selling $20,000 of shares')"><div>$</div><div>CGT on a $20k share sale</div></div>
 <div class="palette-row" onclick="askPalette('State retirement account qualifying years top up worth it?')"><div>$</div><div>State retirement account top-up</div></div>
 <div class="palette-row" onclick="showApp('dashboard');closePalette()"><div>◐</div><div>open Dashboard</div></div>
 <div class="palette-row" onclick="showApp('qa');closePalette()"><div>?</div><div>open full Q&A</div></div>
 <div style="padding:10px 12px;font-family:var(--mono);font-size:10px;color:var(--cream-muted);letter-spacing:0.1em;text-transform:uppercase;border-top:1px dashed var(--line);margin-top:6px">or type any US-finance question</div>
 `;return;
 }
 body.innerHTML=`<div class="palette-row" onclick="askPalette('${esc(q.replace(/'/g,"\\'"))}')"><div>$</div><div>ask: ${esc(q.slice(0,80))}</div></div>`;
}
async function askPalette(q){
 closePalette();
 state.active='qa';
 if(!state.chat)state.chat=[];
 state.chat.push({role:'user',text:q});
 saveAll();render();
 $('#chat').innerHTML=renderChat()+`<div class="msg bot"><em style="color:var(--cream-muted)">thinking…</em></div>`;
 $('#chat').scrollTop=$('#chat').scrollHeight;
 const ans=await answerQuestion(q);
 state.chat.push({role:'bot',text:ans.text,src:ans.src});
 saveAll();
 if(state.active==='qa'){$('#chat').innerHTML=renderChat();$('#chat').scrollTop=$('#chat').scrollHeight}
}
// ════════════════════════════════════════════════════════════════
// MODAL · settings + rebalance
// ════════════════════════════════════════════════════════════════
function openModal(kind,arg){
 if(kind==='settings'){
 $('#modalTitle').textContent='Settings · cascade keys + audit';
 $('#modalBody').innerHTML=`
 <p style="color:var(--cream-dim);font-size:12px;margin-bottom:10px">FallAdviser works fully offline with rules-based answers (T0). For nuanced Q&A grounded in your profile, add an API key below. <a href="https://aistudio.google.com/apikey" target="_blank">Gemini is free</a>. Keys stay on this device.</p>
 <div class="field"><label>anthropic · claude</label><input id="stAnth" type="password" value="${esc(state.settings.anthropicKey)}" placeholder="sk-ant-…"></div>
 <div class="field"><label>gemini · free</label><input id="stGem" type="password" value="${esc(state.settings.geminiKey)}"></div>
 <div class="field"><label>openai · gpt</label><input id="stOAI" type="password" value="${esc(state.settings.openaiKey)}"></div>
 <div class="field"><label>openrouter</label><input id="stOR" type="password" value="${esc(state.settings.openrouterKey)}"></div>
 <div class="field"><label><input type="checkbox" id="stAud" ${state.settings.auditChain?'checked':''}> P3 audit chain · prevHash on every save</label></div>
 <div class="actions"><button class="btn" onclick="closeModal()">cancel</button><button class="btn primary" onclick="saveSettings()">save</button></div>
 `;
 }else if(kind==='rebalance'){
 const{gap,target,pa}=arg;
 $('#modalTitle').textContent='Rebalance suggestion';
 $('#modalBody').innerHTML=`
 <p>Target: <strong>${target.label}</strong> · ${pct(target.eq)} equity / ${pct(target.bond)} bonds / ${pct(target.cash)} cash</p>
 <p>Current: ${pct(pa.equity)} eq / ${pct(pa.bond)} bond / ${pct(pa.cash)} cash · total ${money(pa.total)}</p>
 <hr style="margin:12px 0;border:none;border-top:1px solid var(--line)">
 <p>To reach target equity:</p>
 <ul style="margin:8px 0 12px 22px;font-size:13px;line-height:1.7">
 <li>${gap>0?`Add ${money(gap)} equity (or sell ${money(-gap*0.5)} bonds and rebuy equity).`:`Reduce equity by ${money(-gap)} · prefer adding to bonds/cash via fresh contributions to avoid CGT.`}</li>
 <li>Use IRA/401(k) wrappers for the rebalance to defer any CGT.</li>
 <li>Spread changes over 2-3 months if the gap is large (cost averaging).</li>
 </ul>
 <p style="font-size:11px;color:var(--cream-muted)">Rebalancing via new contributions is tax-efficient. Selling within a GIA can trigger CGT — use your $${fmt(RULES.cgtAllowance)} allowance.</p>
 <div class="actions"><button class="btn primary" onclick="closeModal()">got it</button></div>
 `;
 }
 $('#modal').classList.add('open');
}
function closeModal(){$('#modal').classList.remove('open')}
function saveSettings(){state.settings.anthropicKey=$('#stAnth').value;state.settings.geminiKey=$('#stGem').value;state.settings.openaiKey=$('#stOAI').value;state.settings.openrouterKey=$('#stOR').value;state.settings.auditChain=$('#stAud').checked;Cascade._p=undefined;saveAll();updateTierBadge();closeModal();toast('saved')}
// ── keyboard ──
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openPalette()}
 if(e.key==='Escape'){closePalette();closeModal()}
 if($('#palette').classList.contains('open')&&e.key==='Enter'){e.preventDefault();const q=$('#pInput').value.trim();if(q)askPalette(q)}
});
document.addEventListener('input',e=>{if(e.target.id==='pInput')renderPaletteSuggestions(e.target.value)});
document.addEventListener('click',e=>{if(e.target.id==='palette')closePalette();if(e.target.id==='modal')closeModal()});
// ── ESTATE-AWARE · pull fall-registry on boot ──
async function loadEstateContext(){
 try{
 const res=await fetch('https://raw.githubusercontent.com/sjgant80-hub/fall-registry/main/index.json',{cache:'no-cache'});
 if(res.ok){const d=await res.json();state.estate={tools:(d.apps||[]).map(a=>({name:a.name,purpose:a.purpose,url:a.url,prime:a.prime})),version:d.registryVersion}}
 }catch(e){/* offline fine */}
}
// ── KONOMI sovereign tier (inert) ──
// ── FALLMESH ──
try{const sig=new BroadcastChannel('fall-signal');sig.postMessage({source:'falladviser-us',type:'hello',prime:PRIME,version:VERSION,ts:Date.now()});sig.addEventListener('message',async e=>{const m=e.data;if(!m)return;if(m.type==='ping')sig.postMessage({source:'falladviser-us',type:'pong',prime:PRIME});if(m.source==='si-didy'&&m.type==='query'&&m.intent){const ans=await answerQuestion(m.intent);sig.postMessage({source:'falladviser-us',type:'answer',replyTo:m.id,text:ans.text})}})}catch(e){}
// ── postMessage API · si-didy integration ──
 if(m.action==='ping')r={ok:true,prime:PRIME,version:VERSION,taxYear:TAX_YEAR};
 else if(m.action==='ask'&&m.question){const a=await answerQuestion(m.question);r={ok:true,answer:a.text,src:a.src}}
 else if(m.action==='get-tax')r={ok:true,tax:totalTax(),rules:RULES};
 else if(m.action==='get-portfolio')r={ok:true,portfolio:portfolioAnalysis(),holdings:state.holdings};
 else if(m.action==='get-suggestions')r={ok:true,suggestions:generateSuggestions()};
 else if(m.action==='get-profile')r={ok:true,profile:state.profile};
 else if(m.action==='set-profile'&&m.profile){state.profile=Object.assign({},state.profile,m.profile);saveAll();r={ok:true}}
 e.source?.postMessage({target:m.source||'*',responseTo:m.action,data:r},'*')});
// ── boot ──
(async function(){await openDB();await loadAll();await updateTierBadge();await loadEstateContext();if(!state.active||!TABS.find(t=>t.id===state.active))state.active='dashboard';render();})();

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { VERSION };
export { TAX_YEAR };
