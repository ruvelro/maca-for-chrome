const els = {
  q: document.getElementById('q'),
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  toast: document.getElementById('toast'),
  openOptions: document.getElementById('openOptions'),
  openPrivacy: document.getElementById('openPrivacy'),
  clearHistory: document.getElementById('clearHistory')
};

function fmtTimeFromItem(item) {
  try {
    const ts =
      (typeof item?.ts === "number" && Number.isFinite(item.ts)) ? item.ts :
      (typeof item?.ts === "string" && item.ts.trim() ? Number(item.ts) : NaN);
    const t2 = Number.isFinite(ts) ? ts :
      (item?.time ? Date.parse(item.time) : NaN);
    const d = new Date(Number.isFinite(t2) ? t2 : 0);
    return d.toLocaleString("es-ES", { hour12: false });
  } catch (_) {
    return "";
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

function toast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (els.toast.hidden = true), 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado');
  } catch (_) {
    toast('No se pudo copiar');
  }
}

function renderItem(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const chips = [];
  chips.push(fmtTimeFromItem(item));
  const site = item.site || safeHost(item.pageUrl);
  if (site) chips.push(site);
  if (item.mode) chips.push(String(item.mode));
  for (const text of chips) {
    const s = String(text || '').trim();
    if (!s) continue;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = s;
    meta.appendChild(chip);
  }

  const altK = document.createElement('div');
  altK.className = 'k';
  altK.textContent = 'ALT';
  const altV = document.createElement('div');
  altV.className = 'v';
  altV.textContent = item.alt || '';

  const capK = document.createElement('div');
  capK.className = 'k';
  capK.textContent = 'Leyenda';
  const capV = document.createElement('div');
  capV.className = 'v';
  capV.textContent = item.leyenda || '';

  const row = document.createElement('div');
  row.className = 'rowbtn';

  const bAlt = document.createElement('button');
  bAlt.className = 'btn';
  bAlt.textContent = 'Copiar ALT';
  bAlt.addEventListener('click', () => copyText(item.alt || ''));

  const bCap = document.createElement('button');
  bCap.className = 'btn';
  bCap.textContent = 'Copiar leyenda';
  bCap.addEventListener('click', () => copyText(item.leyenda || ''));

  const bBoth = document.createElement('button');
  bBoth.className = 'btn primary';
  bBoth.textContent = 'Copiar ambos';
  bBoth.addEventListener('click', async () => {
    const a = (item.alt || '').trim();
    const c = (item.leyenda || '').trim();
    await copyText(a && c ? `ALT: ${a}\n\nLeyenda: ${c}` : (a || c));
  });

  row.appendChild(bAlt);
  row.appendChild(bCap);
  row.appendChild(bBoth);

  card.appendChild(meta);
  card.appendChild(altK);
  card.appendChild(altV);
  card.appendChild(capK);
  card.appendChild(capV);
  card.appendChild(row);

  return card;
}

function applyFilter(items, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return items;
  return items.filter(it => {
    const hay = `${it.alt || ''}\n${it.leyenda || ''}\n${it.site || ''}`.toLowerCase();
    return hay.includes(s);
  });
}

async function loadCfg() {
  const cfg = await chrome.storage.sync.get({ historyEnabled: true });
  return cfg || { historyEnabled: true };
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  return Array.isArray(history) ? history : [];
}

async function render() {
  const items = await loadHistory();
  const filtered = applyFilter(items, els.q?.value);

  els.list.innerHTML = '';
  const cfg = await loadCfg();
  els.empty.hidden = filtered.length !== 0;
  if (!els.empty.hidden) {
    els.empty.textContent = (cfg.historyEnabled === false)
      ? 'El historial está desactivado en Ajustes.'
      : 'No hay elementos en el historial.';
  }

  for (const it of filtered) {
    els.list.appendChild(renderItem(it));
  }
}

els.q?.addEventListener('input', () => void render());

els.openOptions?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage?.();
});

els.openPrivacy?.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    const url = chrome.runtime.getURL('options.html#privacy');
    chrome.tabs?.create?.({ url });
  } catch (_) {
    chrome.runtime.openOptionsPage?.();
  }
});

els.clearHistory?.addEventListener('click', async () => {
  await chrome.storage.local.set({ history: [] });
  toast('Historial vaciado');
  await render();
});

// Initial render
render().catch(() => {});
