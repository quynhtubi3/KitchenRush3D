import './style.css';
import { Client, type Room } from '@colyseus/sdk';
import { KitchenScene } from './game/scene';
import { KitchenAudio } from './audio';
import { t, type Language } from './localization';
import { level } from '../../../packages/content/src/index';
import {
  getLevel,
  levels,
  restaurants,
  recipeById,
  items,
  customerTypes,
  unlockedLevels,
  recordWin,
  scaledLevel,
} from '../../../packages/content/src/campaign';
import type {
  Intent,
  TeamIntent,
  Result,
  Snapshot,
  Station,
} from '../../../packages/shared/src/types';
import { setupUI, lobbyUI, teamUI } from './multiplayer-ui';

const app = document.querySelector<HTMLDivElement>('#app')!;
const renderedHTML = new WeakMap<HTMLElement, string>();
let language: Language = 'vi';
try {
  language = localStorage.getItem('kr-language') === 'en' ? 'en' : 'vi';
} catch {}
const tr = (key: string): string => {
  if (items.has(key)) return items.get(key)!.name[language];
  const content = getLevel(state?.levelId ?? selectedLevel);
  const restaurant = restaurants.find((r) => r.id === content.restaurantId)!;
  const equipmentIndex = ['stove', 'board', 'oven'].indexOf(key);
  if (key === 'mixer') return language === 'vi' ? 'Trạm trộn' : 'Mixing station';
  if (equipmentIndex >= 0) return restaurant.equipment[language][equipmentIndex];
  const dispenser = content.stations.find((s) => s.id === key && s.kind === 'dispenser');
  if (dispenser?.ingredient) return items.get(dispenser.ingredient)?.name[language] ?? key;
  return t(language, key);
};
let selectedLevel = level.id;
let wins: string[] = [];
try {
  const saved = JSON.parse(localStorage.getItem('kr-campaign-wins') ?? '[]');
  if (Array.isArray(saved)) wins = saved.filter((v): v is string => typeof v === 'string');
} catch {}
let tutorialSkipped = false;
const currentContent = () => getLevel(state?.levelId ?? selectedLevel);
const stationName = (s: Station | { id: string; ingredient?: string }) =>
  s.ingredient ? tr(s.ingredient) : tr(s.id);
function levelOptions() {
  const open = unlockedLevels(wins);
  return levels
    .map(
      (l) =>
        `<option value="${l.id}" ${l.id === selectedLevel ? 'selected' : ''} ${open.includes(l) ? '' : 'disabled'}>${open.includes(l) ? '' : '🔒 '}${l.id} · ${l.name[language]}</option>`,
    )
    .join('');
}
function starThreshold(index: number) {
  return scaledLevel(currentContent().id, state?.session?.startedSize || 1).stars[index];
}
let scene: KitchenScene | null = null,
  room: Room | null = null,
  state: Snapshot | null = null;
let screen: 'menu' | 'setup' | 'connecting' | 'game' | 'error' = 'menu';
let pinging = false,
  commsOpen = false;
let lastTeamRequest: { mode: 'private' | 'public' | 'join'; code: string; size: number } | null =
  null;
let notebook = false,
  lastEvent = -1,
  lastResult = '',
  connected = true,
  saveMessage = 'saved';
const audio = new KitchenAudio();
const endpoint =
  import.meta.env.VITE_SAME_ORIGIN === 'true'
    ? location.origin
    : import.meta.env.VITE_SERVER_URL || `${location.protocol}//${location.hostname}:2567`;
const client = new Client(endpoint);
async function leaveRoom(old: Room | null) {
  if (!old) return;
  old.reconnection.enabled = false;
  if (old.connection.isOpen) await old.leave().catch(() => {});
}
function send(intent: Intent | TeamIntent) {
  if (connected) room?.send('intent', intent);
}
function best() {
  try {
    return JSON.parse(localStorage.getItem('kr-best') || 'null') as Result | null;
  } catch {
    return null;
  }
}
function save(result: Result) {
  try {
    wins = recordWin(wins, result);
    localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
    if (result.levelId && result.won) {
      const key = `kr-stars-${result.levelId}`;
      localStorage.setItem(
        key,
        String(Math.max(Number(localStorage.getItem(key) ?? 0), result.stars)),
      );
    }
    if (result.teamSize && result.teamSize > 1) {
      localStorage.setItem(`kr-team-${result.teamSize}-last`, JSON.stringify(result));
      saveMessage = 'saved';
      return;
    }
    const previous = best();
    if (!previous || result.score > previous.score)
      localStorage.setItem('kr-best', JSON.stringify(result));
    localStorage.setItem('kr-last-result', JSON.stringify(result));
    saveMessage = 'saved';
  } catch {
    saveMessage = 'storageUnavailable';
  }
}
function topbar() {
  return `<header class="topbar"><a class="brand" href="#" data-action="home"><span class="brand-icon">✦</span><span>KITCHEN<span class="brand-second">RUSH <b>3D</b></span></span></a><div class="header-actions"><button class="subtle" data-action="sound" aria-pressed="${audio.enabled}">♫ <span>${tr('sound')}: ${tr(audio.enabled ? 'on' : 'off')}</span></button><button class="subtle" data-action="language">◎ ${tr('language')}</button></div></header>`;
}
function render() {
  const b = best();
  const content = currentContent(),
    stations = content.stations;
  const restaurant = restaurants.find((r) => r.id === content.restaurantId)!;
  if (screen === 'menu') {
    scene?.setLabels([]);
    app.innerHTML = `${topbar()}<main class="menu"><section class="intro"><p class="eyebrow"><span></span> ${tr('tagline')}</p><h1>${tr('title').replace('\n', '<br>')}</h1><p class="description">${tr('intro')}</p><div class="location"><span class="sun">☀</span><div><strong>${restaurant.name[language]}</strong><small>${content.name[language]}</small></div><span class="location-number">${String(content.number).padStart(2, '0')}</span></div><label class="campaign-select">${language === 'vi' ? 'Chọn màn' : 'Choose level'}<select id="campaign-level">${levelOptions()}</select></label><button class="primary play" data-action="play">${tr('play')} <span>↗</span></button><p class="micro">${tr('phase')}</p>${b ? `<div class="best">${tr('best')} <strong>${b.score}</strong> <span>${'★'.repeat(b.stars)}</span></div>` : ''}</section><div class="scene-caption"><span>${restaurant.name[language]}</span><small>${tr('footer')}</small></div></main><footer class="menu-footer"><span>${content.id.toUpperCase()}</span><span>${tr('controls')}</span></footer>`;
    app
      .querySelector('.intro')
      ?.insertAdjacentHTML(
        'beforeend',
        `<button class="coop-entry" data-action="multiplayer">♟ ${tr('cookTogether')}</button>`,
      );
  } else if (screen === 'setup') {
    scene?.setLabels([]);
    app.innerHTML = topbar() + setupUI(tr);
    document
      .querySelector('.multiplayer-setup')
      ?.insertAdjacentHTML(
        'afterbegin',
        `<label>${language === 'vi' ? 'Chọn màn' : 'Choose level'}<select id="campaign-level">${levelOptions()}</select></label>`,
      );
  } else if (screen === 'connecting' || screen === 'error') {
    scene?.setLabels([]);
    app.innerHTML = `${topbar()}<div class="veil"><section class="dialog"><span class="dialog-symbol">${screen === 'error' ? '☁' : '☀'}</span><h2>${tr(screen === 'error' ? 'connectionFailed' : 'connecting')}</h2>${screen === 'error' ? `<button class="primary" data-action="play">${tr('retry')}</button><button data-action="home">${tr('home')}</button>` : '<div class="loader"></div>'}</section></div>`;
  } else if (state?.phase === 'lobby') {
    scene?.setLabels([]);
    app.innerHTML =
      topbar() + '<div class="lobby-wrap"><div id="lobby"></div></div><div id="overlay"></div>';
    updateLobby();
  } else {
    app.innerHTML = `${topbar()}<section class="hud"><div class="shift"><span class="eyebrow">${restaurant.name[language]}</span><strong>${content.name[language]}</strong></div><div class="stat"><small>${tr('time')}</small><strong id="timer">3:00</strong></div><div class="stat"><small>${tr('score')}</small><strong id="score">0 <em>/ 220</em></strong></div><div class="stat"><small>${tr('orders')}</small><strong id="orders">0 <em>/ 2</em></strong></div><div class="stat combo"><small>${tr('combo')}</small><strong id="combo">×0</strong></div><button class="icon-button" data-action="pause" aria-label="${tr('pause')}">Ⅱ</button></section><section id="orders-list" class="orders-list" aria-label="${tr('orders')}"></section><div id="station-labels">${stations.map((s) => `<button class="station-label" id="label-${s.id}" data-station="${s.id}"><span>${stationName(s)}</span><small></small></button>`).join('')}</div><aside class="help-card"><div class="eyebrow">✦ ${tr('tutorial')}</div><p>${tr('tutorialHint')}</p><button data-action="skip-tutorial">${language === 'vi' ? 'Ẩn hướng dẫn' : 'Hide tutorial'}</button><button data-action="recipe">▤ ${tr('recipe')} <span>↗</span></button></aside><div class="game-tools"><button data-action="camera" aria-label="${tr('resetView')}">⌖</button><button data-action="recipe">▤ <span>${tr('recipe')}</span></button></div><section class="bottom-bar"><div class="hand"><span class="hand-icon">♧</span><div><small>${tr('hand')}</small><strong id="hand">${tr('empty')}</strong></div></div><p id="toast" role="status"></p><button class="primary" id="finish" data-action="finish" hidden>${tr('finish')} ↗</button></section><div id="overlay"></div>`;
    if (state?.session) {
      app.insertAdjacentHTML('beforeend', '<aside id="team-panel"></aside>');
      document.querySelector('[data-action="pause"]')?.remove();
    }
    scene?.setLabels(
      stations.map((s) => ({ id: s.id, node: document.getElementById(`label-${s.id}`)! })),
    );
    updateHud();
  }
  document.body.dataset.screen = screen;
  document.body.dataset.mode = state?.session ? 'coop' : 'solo';
  scene?.resetCamera();
}
function stationStatus(s: Station) {
  if (s.kind === 'counter' && s.stock.length)
    return `${s.item ? tr(s.item.kind) : ''} +${s.stock.length} ${tr('recoveringItems')}`;
  if (s.kind === 'rack') return `${s.stock.length} ${tr('plate').toLowerCase()}`;
  if (s.kind === 'seat') {
    const c = state?.customers.find((c) => c.seat === s.id);
    if (c?.state === 'WaitingForFood' && c.recipe !== 'sunshine-burger')
      return `${language === 'vi' ? 'Đợi' : 'Waiting'}: ${recipeById(c.recipe).name[language]}`;
    if (c)
      return tr(
        c.state === 'Eating'
          ? 'eating'
          : c.state === 'Leaving'
            ? 'leaving'
            : c.state === 'WaitingForFood'
              ? 'waiting'
              : 'arriving',
      );
    return tr(s.item ? 'dirty' : 'free');
  }
  if (s.kind === 'board' && s.phase === 'processing')
    return `${tr('chopCount')} ${s.progress}/${s.process?.taps ?? 3}`;
  if (s.phase === 'processing')
    return `${tr(s.kind === 'sink' ? 'washing' : 'cooking')} ${Math.round(s.progress * 100)}%`;
  if (s.phase === 'burnt') return tr('burnt');
  if (s.phase === 'ready') return tr('ready');
  if (s.item?.kind === 'plate' && s.item.parts.length) return s.item.parts.map(tr).join(' + ');
  return s.item ? tr(s.item.kind) : '';
}
function updateHud() {
  if (!state || screen !== 'game') return;
  if (state.phase === 'lobby') {
    updateLobby();
    return;
  }
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el && renderedHTML.get(el) !== value) {
      el.innerHTML = value;
      renderedHTML.set(el, value);
    }
  };
  const content = currentContent();
  const hint = document.querySelector('.help-card p');
  const card = document.querySelector<HTMLElement>('.help-card');
  if (card) card.hidden = tutorialSkipped || !content.tutorial;
  if (hint) {
    const dirty = state.stations.some((s) => s.item?.kind === 'dirtyPlate');
    const processing = state.stations.some((s) => s.phase === 'processing');
    hint.textContent =
      language === 'vi'
        ? dirty
          ? 'Thu đĩa bẩn → bồn rửa → lấy đĩa sạch. Khách mới cần bàn sạch.'
          : processing
            ? 'Thiết bị tự nấu: chuẩn bị nhánh còn lại trong lúc chờ. Nhấp sổ để xem công thức.'
            : 'Lấy đĩa → bày món. Lấy nguyên liệu → thiết bị tương ứng; mỗi lần nhấp là một thao tác.'
        : dirty
          ? 'Clear dirty plates, wash and reuse. New guests need a clean seat.'
          : processing
            ? 'Prepare the other branch while the cooker runs. Open the recipe book.'
            : 'Place a plate on assembly. Carry each ingredient to its processor; one click performs one action.';
  }
  const seconds = Math.ceil(state.remaining);
  set('timer', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
  document.getElementById('timer')?.classList.toggle('urgent', seconds < 30);
  const targetScore = state.session?.targetScore ?? content.targetScore,
    targetOrders = state.session?.targetOrders ?? content.targetOrders;
  set('score', `${state.score} <em>/ ${targetScore}</em>`);
  set('orders', `${state.served} <em>/ ${targetOrders}</em>`);
  set('combo', `×${state.combo}`);
  const c = state.chefs[room?.sessionId || ''];
  set('hand', c?.item ? tr(c.item.kind) : tr('empty'));
  set('toast', tr(state.event.key));
  document.getElementById('finish')!.hidden =
    state.score < targetScore || state.served < targetOrders;
  if (state.session) {
    const ownVote = state.session.votes.includes(room?.sessionId ?? '');
    set('finish', tr(ownVote ? 'cancelVote' : 'voteFinish'));
    set('team-panel', teamUI(state, room?.sessionId ?? '', tr, pinging));
    const options = document.getElementById('comms-options');
    if (options) options.hidden = !commsOpen;
  }
  const tickets = state.customers.filter((c) => c.seat && c.state === 'WaitingForFood');
  set(
    'orders-list',
    tickets
      .map(
        (c) =>
          `<button class="ticket" data-action="recipe"><span class="food-icon">🍔</span><div><small>${tr(c.seat!)}</small><strong>${recipeById(c.recipe).name[language]} · ${customerTypes[c.type ?? 'regular'].name[language]}</strong><div class="patience"><i style="width:${Math.max(0, (c.patience / c.maxPatience) * 100)}%;background:${c.patience < 25 ? '#dd826e' : '#568f74'}"></i></div></div><span class="ticket-time">${Math.ceil(c.patience)}s</span></button>`,
      )
      .join('') +
      `<div class="queue-pill">♟ ${tr('queue')}: ${state.customers.filter((c) => !c.seat).length}/${content.queueLimit}</div>`,
  );
  for (const s of state.stations) {
    const el = document.getElementById(`label-${s.id}`);
    if (el) {
      el.querySelector('small')!.textContent = stationStatus(s);
      el.classList.toggle('station-ready', s.phase === 'ready' || s.item?.kind === 'burger');
      el.classList.toggle('station-burnt', s.phase === 'burnt');
      el.classList.toggle('station-target', c?.target === s.id);
      el.classList.toggle(
        'station-ping',
        !!state.session?.signals.some((signal) => signal.type === 'ping' && signal.value === s.id),
      );
    }
  }
  if (state.event.seq !== lastEvent) {
    lastEvent = state.event.seq;
    audio.play(state.event.key);
  }
  if (state.result && lastResult !== state.result.matchId) {
    lastResult = state.result.matchId;
    save(state.result);
  }
  updateOverlay();
}
function updateLobby() {
  const el = document.getElementById('lobby');
  if (!el || !state?.session) return;
  const html = lobbyUI(
    state,
    room?.sessionId ?? '',
    tr,
    unlockedLevels(wins).map((l) => ({ id: l.id, name: l.name[language] })),
  );
  if (renderedHTML.get(el) !== html) {
    el.innerHTML = html;
    renderedHTML.set(el, html);
  }
  updateOverlay();
}
function updateOverlay() {
  const overlay = document.getElementById('overlay');
  if (!overlay || !state) return;
  let html = '';
  if (!connected)
    html = `<div class="veil"><section class="dialog"><h2>${tr('disconnected')}</h2><div class="loader"></div></section></div>`;
  else if (state.result) {
    const r = state.result;
    html = `<div class="veil"><section class="dialog results"><div class="result-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div><p class="eyebrow">${currentContent().name[language]}</p><h2>${tr(r.won ? 'won' : 'lost')}</h2><p>${tr('resultHint')}</p><div class="result-grid"><div><small>${tr('score')}</small><strong>${r.score}</strong></div><div><small>${tr('orders')}</small><strong>${r.served}</strong></div><div><small>${tr('bestCombo')}</small><strong>×${r.bestCombo}</strong></div><div><small>${tr('missed')}</small><strong>${r.missed}</strong></div></div><small>${tr(saveMessage)}</small><button class="primary" data-action="play">${tr('replay')} ↗</button><button data-action="home">${tr('home')}</button></section></div>`;
  } else if (state.phase === 'paused')
    html = `<div class="veil"><section class="dialog"><span class="dialog-symbol">☕</span><h2>${tr('paused')}</h2><p>${tr('pausedHint')}</p><button class="primary" data-action="pause">${tr('resume')}</button><button data-action="home">${tr('home')}</button></section></div>`;
  else if (notebook)
    html = `<div class="notebook" role="dialog" aria-modal="false" aria-label="${tr('recipe')}"><button class="notebook-close" data-action="recipe" aria-label="${tr('close')}">×</button><p class="eyebrow">${tr('recipe')}</p><div class="recipe-hero">🍔</div>${currentContent()
      .recipes.map((id) => {
        const r = recipeById(id);
        return `<h2>${r.name[language]}</h2><p>${tr('recipeHint')}</p><div class="recipe-steps">${r.steps.map((step) => `<p>${step.inputs.map(tr).join(' + ')} → <b>${tr(step.station)}</b> ${step.seconds ? step.seconds + 's' : step.taps ? step.taps + '×' : ''} → ${tr(step.output)}</p>`).join('')}</div>`;
      })
      .join(
        '',
      )}<small>${currentContent().washSeconds}s ${tr('sink')}</small><p>★★ ${starThreshold(1)} ${tr('score')} · ★★★ ${starThreshold(2)} ${tr('score')}, ≤${currentContent().maxMissedThreeStars} ${tr('missed')}, ≤${currentContent().maxAverageServiceThreeStars}s, ${tr('combo')} ≥${currentContent().minComboThreeStars}</p></div>`;
  if (overlay.innerHTML !== html) overlay.innerHTML = html;
  if (state.result && state.session) {
    const replay = overlay.querySelector<HTMLButtonElement>('[data-action="play"]');
    if (replay) {
      replay.dataset.action = 'multiplayer';
      replay.textContent = tr('cookTogether');
    }
  }
}
async function attach(r: Room) {
  // A single retry owner avoids the SDK retry loop competing with explicit reconnects.
  r.reconnection.enabled = false;
  room = r;
  connected = true;
  screen = 'game';
  notebook = false;
  lastEvent = -1;
  pinging = false;
  commsOpen = false;
  render();
  try {
    sessionStorage.setItem('kr-reconnect', r.reconnectionToken);
  } catch {}
  const receive = (s: any) => {
    if (!s.snapshot) return;
    try {
      const previousLobby = state?.phase === 'lobby',
        previousCoop = !!state?.session,
        previousLevel = state?.levelId;
      state = JSON.parse(s.snapshot) as Snapshot;
      selectedLevel = state.session?.levelId ?? state.levelId ?? level.id;
      scene?.update(state, r.sessionId);
      if (
        previousLevel !== state.levelId ||
        previousLobby !== (state.phase === 'lobby') ||
        previousCoop !== !!state.session
      )
        render();
      else updateHud();
    } catch (e) {
      console.error('Invalid snapshot', e);
    }
  };
  r.onStateChange(receive);
  r.onMessage('notice', (key: string) => {
    const el = document.getElementById('team-notice') ?? document.getElementById('toast');
    if (el) el.textContent = tr(key);
  });
  receive(r.state);
  r.onDrop(() => {
    if (room === r) {
      connected = false;
      updateOverlay();
    }
  });
  r.onReconnect(() => {
    if (room === r) {
      connected = true;
      try {
        sessionStorage.setItem('kr-reconnect', r.reconnectionToken);
      } catch {}
      updateOverlay();
    }
  });
  r.onLeave(async () => {
    if (room !== r || screen !== 'game') return;
    connected = false;
    updateOverlay();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (room !== r || screen !== 'game') return;
      try {
        await attach(await client.reconnect(r.reconnectionToken));
        return;
      } catch {}
    }
    if (room === r) {
      screen = 'error';
      render();
    }
  });
  r.onError(() => {
    if (room === r) {
      connected = false;
      updateOverlay();
    }
  });
}
async function play() {
  lastTeamRequest = null;
  audio.unlock();
  const old = room;
  room = null;
  await leaveRoom(old);
  state = null;
  screen = 'connecting';
  render();
  try {
    tutorialSkipped = false;
    await attach(await client.create('solo', { levelId: selectedLevel }));
  } catch (e) {
    console.error(e);
    screen = 'error';
    render();
  }
}
async function playTeam(mode: 'private' | 'public' | 'join', code = '', preferredSize?: number) {
  const size =
    preferredSize ?? Number(document.querySelector<HTMLSelectElement>('#team-size')?.value ?? 4);
  lastTeamRequest = { mode, code, size };
  audio.unlock();
  const old = room;
  room = null;
  await leaveRoom(old);
  state = null;
  screen = 'connecting';
  render();
  try {
    const next =
      mode === 'join'
        ? await client.joinById(code.trim())
        : mode === 'public'
          ? await client.joinOrCreate('coop_public', { teamSize: size, levelId: selectedLevel })
          : await client.create('coop_private', { teamSize: size, levelId: selectedLevel });
    await attach(next);
  } catch (e) {
    console.error(e);
    screen = 'error';
    render();
  }
}
app.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).id === 'campaign-level') {
    selectedLevel = (e.target as HTMLSelectElement).value;
    render();
  }
  if ((e.target as HTMLElement).id === 'level-select')
    send({ type: 'selectLevel', levelId: (e.target as HTMLSelectElement).value });
});
app.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('button,[data-action]');
  if (!target) return;
  e.preventDefault();
  audio.unlock();
  if (target.dataset.chat) {
    send({ type: 'quickChat', value: target.dataset.chat as 'thanks' });
    return;
  }
  if (target.dataset.emote) {
    send({ type: 'emote', value: target.dataset.emote as 'wave' });
    return;
  }
  if (target.dataset.station) {
    if (pinging) {
      send({ type: 'ping', value: target.dataset.station });
      pinging = false;
      updateHud();
      return;
    }
    send({ type: 'interact', station: target.dataset.station });
    return;
  }
  switch (target.dataset.action) {
    case 'skip-tutorial':
      tutorialSkipped = true;
      updateHud();
      break;
    case 'multiplayer': {
      const old = room;
      room = null;
      void leaveRoom(old);
      state = null;
      screen = 'setup';
      try {
        sessionStorage.removeItem('kr-reconnect');
      } catch {}
      render();
      break;
    }
    case 'create-private':
      void playTeam('private');
      break;
    case 'matchmake':
      void playTeam('public');
      break;
    case 'join-private':
      void playTeam('join', document.querySelector<HTMLInputElement>('#room-code')?.value ?? '');
      break;
    case 'ready':
      send({
        type: 'ready',
        ready: !state?.session?.members.find((m) => m.id === room?.sessionId)?.ready,
      });
      break;
    case 'start-team':
      send({ type: 'start' });
      break;
    case 'copy-invite': {
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('room', state?.session?.code ?? '');
      void Promise.resolve()
        .then(() => navigator.clipboard.writeText(url.href))
        .then(() => {
          const el = document.getElementById('team-notice');
          if (el) el.textContent = tr('inviteCopied');
        })
        .catch(() => {
          const el = document.getElementById('team-notice');
          if (el) el.textContent = tr('copyLinkFailed');
        });
      break;
    }
    case 'toggle-comms':
      commsOpen = !commsOpen;
      updateHud();
      break;
    case 'ping-mode':
      pinging = !pinging;
      updateHud();
      break;
    case 'play':
      if (screen === 'error' && lastTeamRequest)
        void playTeam(lastTeamRequest.mode, lastTeamRequest.code, lastTeamRequest.size);
      else void play();
      break;
    case 'home': {
      const old = room;
      room = null;
      void leaveRoom(old);
      state = null;
      screen = 'menu';
      notebook = false;
      try {
        sessionStorage.removeItem('kr-reconnect');
      } catch {}
      render();
      break;
    }
    case 'language':
      language = language === 'vi' ? 'en' : 'vi';
      document.documentElement.lang = language;
      try {
        localStorage.setItem('kr-language', language);
      } catch {}
      render();
      break;
    case 'sound':
      audio.enabled = !audio.enabled;
      render();
      break;
    case 'recipe':
      notebook = !notebook;
      updateOverlay();
      break;
    case 'pause':
      send({ type: 'pause' });
      break;
    case 'finish':
      if (state?.session)
        send({ type: 'voteFinish', agree: !state.session.votes.includes(room?.sessionId ?? '') });
      else send({ type: 'finish' });
      break;
    case 'camera':
      scene?.resetCamera();
      break;
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screen === 'game') {
    if (notebook) {
      notebook = false;
      updateOverlay();
    } else if (!state?.session) send({ type: 'pause' });
  }
});
try {
  scene = new KitchenScene(document.querySelector<HTMLCanvasElement>('#game')!);
  scene.onMove = (p) => {
    if (screen === 'game') send({ type: 'move', ...p });
  };
  scene.onInteract = (station) => {
    if (screen === 'game') {
      if (pinging) {
        send({ type: 'ping', value: station });
        pinging = false;
        updateHud();
      } else send({ type: 'interact', station });
    }
  };
  render();
  let token: string | null = null;
  try {
    token = sessionStorage.getItem('kr-reconnect');
  } catch {}
  const invitation = new URL(location.href).searchParams.get('room');
  if (invitation) {
    history.replaceState(null, '', location.pathname);
    void playTeam('join', invitation);
  } else if (token) {
    screen = 'connecting';
    render();
    client
      .reconnect(token)
      .then(attach)
      .catch(() => {
        screen = 'menu';
        render();
      });
  }
} catch (e) {
  console.error(e);
  app.innerHTML = `<div class="veil"><section class="dialog"><h2>${tr('webgl')}</h2></section></div>`;
}
