import './style.css';
import { serverEndpoint } from './server-endpoint';
import { TapNavigation } from './tap-navigation';
import { guidance } from './guidance';
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
  dishRecipe,
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
import { AccountClient } from './account';
import { loadPreferences, savePreferences, type Preferences } from './preferences';
import { SettingsPanel } from './settings';
import { keyboardDirection, movementTarget, MobileControls } from './mobile-controls';
import { customerUrgent, stationFeedback, FeedbackCues } from './feedback';
import { popCore, popSemantic, restaurantPopTheme } from './game/chaotic-pop-theme';

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
const accountClient = new AccountClient();
let accountOpen = false;
let accountAuthMode: 'login' | 'register' = 'login';
let saveProgressNudgeDismissed = false;
let accountMessage = '';
let accountReady: Promise<unknown> = Promise.resolve();
let pendingAccountAction: { purpose: 'verifyEmail' | 'resetPassword'; token: string } | null = null;
try {
  const url = new URL(window.location.href);
  const actionParams = new URLSearchParams(url.hash.slice(1));
  const verifyEmail = actionParams.get('verifyEmail') ?? url.searchParams.get('verifyEmail');
  const resetPassword = actionParams.get('resetPassword') ?? url.searchParams.get('resetPassword');
  if (verifyEmail) pendingAccountAction = { purpose: 'verifyEmail', token: verifyEmail };
  else if (resetPassword) pendingAccountAction = { purpose: 'resetPassword', token: resetPassword };
  if (pendingAccountAction) {
    accountOpen = true;
    url.searchParams.delete('verifyEmail');
    url.searchParams.delete('resetPassword');
    url.hash = '';
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
} catch {}
const currentContent = () => getLevel(state?.levelId ?? selectedLevel);
const recipeIcon = (id: string) => {
  if (id.includes('chicken') || id.includes('friedChicken')) return '🍗';
  if (id.includes('fries')) return '🍟';
  if (id.includes('cheese')) return '🧀';
  if (id.startsWith('tide-'))
    return id.includes('signature-b') || id.includes('signature-c') ? '🍣' : '🍙';
  if (id.startsWith('olive-')) return id.includes('signature-c') ? '🧀' : '🍝';
  if (id.startsWith('lantern-')) return id.includes('signature-c') ? '🥟' : '🍜';
  if (id.startsWith('orbit-')) return '🪐';
  return '🍔';
};
const stationName = (s: Station | { id: string; ingredient?: string }) =>
  s.ingredient ? tr(s.ingredient) : tr(s.id);
function levelOptions() {
  const openIds =
    accountClient.state.configured && accountClient.state.available && accountClient.state.progress
      ? new Set(accountClient.state.progress.unlocked)
      : new Set(unlockedLevels(wins).map((l) => l.id));
  return restaurants
    .map(
      (restaurant) =>
        `<optgroup label="${restaurant.name[language]}">${levels
          .filter((l) => l.restaurantId === restaurant.id)
          .map(
            (l) =>
              `<option value="${l.id}" ${l.id === selectedLevel ? 'selected' : ''} ${openIds.has(l.id) ? '' : 'disabled'}>${openIds.has(l.id) ? '' : '?? '}${l.number}. ${l.name[language]}</option>`,
          )
          .join('')}</optgroup>`,
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
  ordersExpanded = false,
  lastEvent = -1,
  lastResult = '',
  connected = true,
  saveMessage = 'saved';
const audio = new KitchenAudio();
let preferences = loadPreferences();
function applyPreferences(patch: Partial<Preferences> = {}) {
  preferences = { ...preferences, ...patch };
  audio.configure(preferences);
  scene?.configure(preferences);
  mobileControls.sync();
  document.body.dataset.reducedMotion = String(preferences.reducedMotion);
  document.body.dataset.quality = preferences.quality;
  document.body.dataset.controls = preferences.touchControls;
  const sound = document.querySelector<HTMLButtonElement>('[data-action="sound"]');
  if (sound) {
    sound.setAttribute('aria-pressed', String(audio.enabled));
    sound.innerHTML = `♫ <span>${tr('sound')}: ${tr(audio.enabled ? 'on' : 'off')}</span>`;
  }
  return savePreferences(preferences);
}
const settings = new SettingsPanel(applyPreferences, () => {
  audio.unlock();
  audio.play('served');
});
audio.configure(preferences);
const endpoint = serverEndpoint(location.origin, {
  dev: import.meta.env.DEV,
  sameOrigin: import.meta.env.VITE_SAME_ORIGIN,
  serverUrl: import.meta.env.VITE_SERVER_URL,
});
const client = new Client(endpoint);
const feedbackCues = new FeedbackCues();
const tapNavigation = new TapNavigation();
let trackedOrder: string | undefined;
let notebookRecipe: string | undefined;
let rotationDismissed = false;
const mobileControls = new MobileControls(
  () => ({
    state,
    chef: state?.chefs[room?.sessionId ?? ''],
    enabled:
      screen === 'game' &&
      connected &&
      preferences.touchControls === 'joystick' &&
      navigator.maxTouchPoints > 0,
    alpha: scene?.camera.alpha ?? Math.PI / 2.65,
    vi: language === 'vi',
  }),
  send,
  stationName,
  (stationId) => scene?.setInteractionTarget(stationId),
);
function escapeHTML(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}
function accountPanel() {
  const state = accountClient.state;
  const vi = language === 'vi';
  const message = accountMessage || state.error;
  const pendingActionPanel = pendingAccountAction
    ? pendingAccountAction.purpose === 'verifyEmail'
      ? `<div class="account-actions"><button class="primary" data-action="account-verify-email">${vi ? 'Xác nhận email' : 'Confirm email'}</button></div>`
      : `<label>${vi ? 'Mật khẩu mới (10–128 ký tự)' : 'New password (10–128 characters)'}<input id="account-recovery-password" type="password" autocomplete="new-password" minlength="10" maxlength="128"></label><div class="account-actions"><button class="primary" data-action="account-reset-password">${vi ? 'Đặt lại mật khẩu' : 'Reset password'}</button></div>`
    : '';
  const actionNotice = state.verificationPending
    ? `<p class="account-note" role="status">${vi ? 'Nếu địa chỉ có thể đăng ký, email xác minh sẽ được gửi. Hãy kiểm tra hộp thư và thư rác.' : 'If this address can be registered, a verification email is on its way. Check your inbox and spam folder.'}</p>`
    : '';
  const legacy = state.progress?.legacyProgressIsUnverified
    ? `<p class="account-note">${vi ? 'Tiến trình Guest cũ được lưu riêng để đối chiếu; dữ liệu chưa xác minh không mở khóa màn.' : 'Legacy Guest progress is archived separately. It is unverified and does not unlock levels.'}</p>`
    : '';
  if (!state.configured)
    return `<section class="account-panel"><button class="account-close" data-action="account">×</button><strong>${vi ? 'Khách · lưu trên thiết bị' : 'Guest · saved on this device'}</strong><p>${vi ? 'Bạn vẫn có thể chơi Solo và Multiplayer.' : 'Solo and multiplayer remain available.'}</p>${pendingActionPanel}</section>`;
  if (!state.available)
    return `<section class="account-panel"><button class="account-close" data-action="account">×</button><strong>${vi ? 'Đồng bộ tài khoản tạm thời không khả dụng' : 'Account sync is temporarily unavailable'}</strong><p>${escapeHTML(message || (vi ? 'Không kết nối được cơ sở dữ liệu.' : 'Database is not responding.'))}</p>${pendingActionPanel}</section>`;
  if (!state.account)
    return `<section class="account-panel"><button class="account-close" data-action="account">×</button><strong>${vi ? 'Hồ sơ Guest' : 'Guest profile'}</strong><p>${escapeHTML(message)}</p>${pendingActionPanel}</section>`;
  const identity = escapeHTML(state.account.displayName);
  const wins = state.progress?.wins.length ?? 0;
  if (state.account.isGuest) {
    const authForm = state.authEnabled
      ? `<div class="account-auth" data-mode="${accountAuthMode}">
          <p class="account-note account-login-only">${vi ? 'Tên Guest ở trên chỉ tạm thời. Khi đăng nhập, game dùng tên đã lưu trong tài khoản của bạn.' : 'The Guest name above is temporary. Signing in uses the name saved on your account.'}</p>
          ${
            state.registrationEnabled
              ? `<div class="account-auth-modes" role="group" aria-label="${vi ? 'Chế độ tài khoản' : 'Account mode'}">
            <button type="button" data-action="account-auth-mode" data-auth-mode="login" aria-pressed="${accountAuthMode === 'login'}">${vi ? 'Đăng nhập' : 'Sign in'}</button>
            <button type="button" data-action="account-auth-mode" data-auth-mode="register" aria-pressed="${accountAuthMode === 'register'}">${vi ? 'Tạo tài khoản' : 'Create account'}</button>
          </div>`
              : ''
          }
          <label>${vi ? 'Email' : 'Email'}<input id="account-email" type="email" autocomplete="email" maxlength="254" inputmode="email"></label>
          <label class="account-register-only">${vi ? 'Tên hiển thị' : 'Display name'}<input id="account-display-name" autocomplete="nickname" maxlength="32"></label>
          <p class="account-register-only account-field-help">${vi ? 'Tên này được lưu vào tài khoản; lần đăng nhập sau không cần nhập lại.' : 'This name is saved to your account; you do not enter it again when signing in.'}</p>
          <label>${vi ? 'Mật khẩu (10–128 ký tự)' : 'Password (10–128 characters)'}<input id="account-password" type="password" autocomplete="${accountAuthMode === 'login' ? 'current-password' : 'new-password'}" minlength="10" maxlength="128"></label>
          <details class="account-import-options"><summary>${vi ? 'Tiến trình Guest cũ (tùy chọn)' : 'Older Guest progress (optional)'}</summary><label class="account-import"><input id="account-import-progress" type="checkbox">${vi ? 'Gửi bản lưu cũ để lưu trữ đối chiếu; dữ liệu này không mở khóa màn.' : 'Archive an older local save for review; it does not unlock levels.'}</label></details>
          <div class="account-actions">
            <button class="primary account-login-only" data-action="account-login">${vi ? 'Đăng nhập' : 'Sign in'}</button>
            ${state.registrationEnabled ? `<button class="primary account-register-only" data-action="account-register">${vi ? 'Tạo tài khoản & giữ tiến trình Guest' : 'Create account & keep Guest progress'}</button>` : ''}
          </div>
          ${state.emailDeliveryConfigured ? `<div class="account-actions account-login-only"><button data-action="account-resend-verification">${vi ? 'Gửi lại email xác minh' : 'Resend verification email'}</button><button data-action="account-request-reset">${vi ? 'Quên mật khẩu?' : 'Forgot password?'}</button></div>` : ''}
          ${!state.registrationEnabled ? `<p class="account-note">${vi ? 'Đăng ký mới hiện đang tắt.' : 'New registration is currently disabled.'}</p>` : ''}${actionNotice}
        </div>`
      : '';
    return `<section class="account-panel"><button class="account-close" data-action="account">×</button><strong>${identity}</strong><small>${escapeHTML(state.account.playerCode)} · ${vi ? 'Khách' : 'Guest'}</small><p>${state.cloudSaveEnabled ? (vi ? `${wins} màn đã đồng bộ với máy chủ.` : `${wins} levels synced to the server.`) : vi ? 'Tiến trình chỉ lưu trên thiết bị này.' : 'Progress is saved on this device only.'}</p>${legacy}${authForm}${pendingActionPanel}<p class="account-message" role="status">${escapeHTML(message)}</p></section>`;
  }
  const created = new Date(state.account.createdAt).toLocaleDateString(vi ? 'vi-VN' : 'en-US');
  const lastPlayed = state.account.lastPlayedAt
    ? new Date(state.account.lastPlayedAt).toLocaleDateString(vi ? 'vi-VN' : 'en-US')
    : vi
      ? 'chưa chơi'
      : 'not yet';
  return `<section class="account-panel"><button class="account-close" data-action="account">×</button><strong>${identity}</strong><small>${escapeHTML(state.account.email ?? state.account.username ?? '')} · ${escapeHTML(state.account.playerCode)}</small><small>${vi ? 'Tham gia' : 'Joined'} ${created} · ${vi ? 'Chơi gần nhất' : 'Last played'} ${lastPlayed}</small><p>${state.cloudSaveEnabled ? (vi ? `${wins} màn thắng · đã đồng bộ` : `${wins} wins · synced`) : vi ? 'Tiến trình chỉ lưu trên thiết bị này.' : 'Progress is saved on this device only.'}</p>${legacy}<label>${vi ? 'Mật khẩu hiện tại' : 'Current password'}<input id="account-current-password" type="password" autocomplete="current-password"></label><label>${vi ? 'Mật khẩu mới (10–128 ký tự)' : 'New password (10–128 characters)'}<input id="account-next-password" type="password" autocomplete="new-password" minlength="10" maxlength="128"></label><div class="account-actions"><button data-action="account-password">${vi ? 'Đổi mật khẩu' : 'Change password'}</button>${state.emailDeliveryConfigured && state.account.email ? `<button data-action="account-request-reset">${vi ? 'Gửi link đặt lại mật khẩu' : 'Email a password reset link'}</button>` : ''}<button data-action="account-logout">${vi ? 'Đăng xuất' : 'Sign out'}</button></div>${pendingActionPanel}<p class="account-message" role="status">${escapeHTML(message)}</p></section>`;
}
async function leaveRoom(old: Room | null) {
  if (!old) return;
  old.reconnection.enabled = false;
  if (old.connection.isOpen) await old.leave().catch(() => {});
}
let connectionAttempt = new AbortController();
function invalidateConnection() {
  connectionAttempt.abort();
  connectionAttempt = new AbortController();
  connected = false;
  tapNavigation.cancel();
  try {
    sessionStorage.removeItem('kr-reconnect');
  } catch {}
  return connectionAttempt.signal;
}
function send(intent: Intent | TeamIntent) {
  if (intent.type === 'move') tapNavigation.cancel();
  if (connected) room?.send('intent', intent);
}
function selectStation(station: string) {
  if (!state || !room || !connected) return;
  const intent = tapNavigation.select(
    state,
    room.sessionId,
    station,
    performance.now(),
    preferences.tapInteraction === 'arrival',
  );
  scene?.setInteractionTarget(station);
  if (intent) room.send('intent', intent);
  const button = document.getElementById(`label-${station}`) as HTMLButtonElement | null;
  if (button && intent) {
    button.disabled = true;
    window.setTimeout(() => {
      button.disabled = false;
    }, 320);
  }
}
async function prepareAccountSession() {
  // Guest play must not be held hostage by an optional account status request.
  // When account support is enabled, let its response decide whether this
  // session can start; when the service is slow, keep the Guest path responsive.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    accountReady,
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), 2000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  // Account persistence is optional: database/auth outages must not prevent Guest play.
}
async function updateAccount(
  action:
    | 'login'
    | 'register'
    | 'logout'
    | 'password'
    | 'verify-email'
    | 'reset-password'
    | 'request-verification'
    | 'request-reset',
) {
  accountMessage = '';
  try {
    if (action === 'logout') await accountClient.logout();
    else if (action === 'password') {
      const currentPassword =
        document.querySelector<HTMLInputElement>('#account-current-password')?.value ?? '';
      const nextPassword =
        document.querySelector<HTMLInputElement>('#account-next-password')?.value ?? '';
      await accountClient.changePassword(currentPassword, nextPassword);
      accountMessage = language === 'vi' ? 'Đã đổi mật khẩu.' : 'Password changed.';
    } else if (action === 'verify-email') {
      if (!pendingAccountAction || pendingAccountAction.purpose !== 'verifyEmail')
        throw new Error('invalidActionToken');
      await accountClient.verifyEmail(pendingAccountAction.token);
      pendingAccountAction = null;
      accountMessage =
        language === 'vi'
          ? 'Email đã được xác minh và tài khoản đã đăng nhập.'
          : 'Email verified and account signed in.';
    } else if (action === 'reset-password') {
      if (!pendingAccountAction || pendingAccountAction.purpose !== 'resetPassword')
        throw new Error('invalidActionToken');
      const nextPassword =
        document.querySelector<HTMLInputElement>('#account-recovery-password')?.value ?? '';
      await accountClient.completePasswordReset(pendingAccountAction.token, nextPassword);
      pendingAccountAction = null;
      accountMessage =
        language === 'vi'
          ? 'Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.'
          : 'Password reset. Sign in with your new password.';
    } else if (action === 'request-verification' || action === 'request-reset') {
      const email =
        document.querySelector<HTMLInputElement>('#account-email')?.value.trim() ||
        accountClient.state.account?.email ||
        '';
      if (action === 'request-verification') await accountClient.requestEmailVerification(email);
      else await accountClient.requestPasswordReset(email);
      accountMessage =
        language === 'vi'
          ? 'Nếu email đủ điều kiện, hướng dẫn sẽ được gửi. Hãy kiểm tra cả thư rác.'
          : 'If this email is eligible, instructions are on the way. Check your spam folder too.';
    } else {
      const email = document.querySelector<HTMLInputElement>('#account-email')?.value.trim() ?? '';
      const displayName =
        action === 'register'
          ? (document.querySelector<HTMLInputElement>('#account-display-name')?.value.trim() ?? '')
          : '';
      const password = document.querySelector<HTMLInputElement>('#account-password')?.value ?? '';
      const importLegacy =
        document.querySelector<HTMLInputElement>('#account-import-progress')?.checked ?? false;
      await accountClient.authenticate(action, email, password, displayName, importLegacy);
      if (accountClient.state.verificationPending)
        accountMessage =
          language === 'vi'
            ? 'Kiểm tra email để xác minh tài khoản. Tiến trình Guest hiện tại vẫn được giữ.'
            : 'Check your email to verify the account. Your current Guest progress is preserved.';
    }
    const progress = accountClient.state.progress;
    if (progress) {
      wins = progress.wins;
      if (!progress.unlocked.includes(selectedLevel))
        selectedLevel = progress.unlocked.at(-1) ?? level.id;
    }
    const keepOpen =
      [
        'password',
        'verify-email',
        'reset-password',
        'request-verification',
        'request-reset',
      ].includes(action) || accountClient.state.verificationPending;
    if (!keepOpen) {
      accountOpen = false;
      accountAuthMode = 'login';
    }
  } catch (error) {
    accountMessage = error instanceof Error ? error.message : 'requestFailed';
  }
  render();
}
function best() {
  if (
    accountClient.state.configured &&
    accountClient.state.available &&
    accountClient.state.progress
  ) {
    const record = [...accountClient.state.progress.levels].sort(
      (a, b) => b.bestScore - a.bestScore,
    )[0];
    if (!record || record.bestScore === 0) return null;
    return {
      levelId: record.levelId,
      teamSize: 1,
      won: record.completed,
      stars: record.bestStars,
      score: record.bestScore,
      served: record.bestServed,
      missed: record.bestMissed,
      bestCombo: record.bestCombo,
      averageService: record.bestAverageService,
      duration: 0,
      matchId: 'server-best',
    } satisfies Result;
  }
  try {
    return JSON.parse(localStorage.getItem('kr-best') || 'null') as Result | null;
  } catch {
    return null;
  }
}
function save(result: Result) {
  if (accountClient.state.configured) {
    saveMessage = 'serverSavePending';
    void (async () => {
      let synced = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const progress = await accountClient.refresh(result.matchId).catch(() => null);
        if (!progress) continue;
        wins = progress.wins;
        if (!progress.unlocked.includes(selectedLevel))
          selectedLevel = progress.unlocked.at(-1) ?? level.id;
        synced = true;
        break;
      }
      saveMessage = synced ? 'serverSaved' : 'serverSaveFailed';
      if (screen === 'menu') render();
      else updateOverlay();
    })();
    return;
  }
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
  return `<header class="topbar"><a class="brand" href="#" data-action="home"><span class="brand-icon">✦</span><span>KITCHEN<span class="brand-second">RUSH <b>3D</b></span></span></a><div class="header-actions"><button class="subtle" data-action="sound" aria-label="${tr('sound')}" aria-pressed="${audio.enabled}">♫ <span>${tr('sound')}: ${tr(audio.enabled ? 'on' : 'off')}</span></button><button class="subtle" data-action="language" aria-label="${tr('language')}">◎ ${tr('language')}</button></div></header>`;
}
function render() {
  const b = best();
  const content = currentContent(),
    stations = content.stations;
  const restaurant = restaurants.find((r) => r.id === content.restaurantId)!;
  const visualTheme = restaurantPopTheme(restaurant.id);
  document.body.dataset.restaurant = restaurant.id;
  document.body.style.setProperty('--pop-ink', popCore.ink);
  document.body.style.setProperty('--pop-paper', popCore.paper);
  document.body.style.setProperty('--pop-danger', popSemantic.danger);
  document.body.style.setProperty('--pop-success', popSemantic.success);
  document.body.style.setProperty('--pop-warning', popSemantic.warning);
  document.body.style.setProperty('--pop-room', visualTheme.room);
  document.body.style.setProperty('--pop-cabinet', visualTheme.cabinet);
  document.body.style.setProperty('--pop-accent', visualTheme.accent);
  document.body.style.setProperty('--pop-secondary', visualTheme.secondary);
  document.body.style.setProperty('--pop-wood', visualTheme.wood);
  if (screen === 'menu') {
    scene?.setLabels([]);
    const canInviteAccount =
      accountClient.state.configured &&
      accountClient.state.available &&
      accountClient.state.authEnabled &&
      accountClient.state.cloudSaveEnabled &&
      accountClient.state.account?.isGuest &&
      !saveProgressNudgeDismissed;
    app.innerHTML = `${topbar()}<main class="menu"><section class="intro"><p class="eyebrow"><span></span> ${tr('tagline')}</p><h1>${tr('title').replace('\n', '<br>')}</h1><p class="description">${tr('intro')}</p><div class="location"><span class="sun">☀</span><div><strong>${restaurant.name[language]}</strong><small>${content.name[language]}</small></div><span class="location-number">${String(content.number).padStart(2, '0')}</span></div><label class="campaign-select">${language === 'vi' ? 'Chọn màn' : 'Choose level'}<select id="campaign-level">${levelOptions()}</select></label><button class="primary play" data-action="play">${tr('play')} <span>↗</span></button>${canInviteAccount ? `<aside class="save-progress-nudge" role="note"><span class="save-progress-icon" aria-hidden="true">☁</span><div class="save-progress-copy"><strong>${tr('saveProgressCta')}</strong><small>${tr('saveProgressNudge')}</small></div><button class="save-progress-open" data-action="account-open-login" aria-label="${tr('saveProgressCta')}">↗</button><button class="save-progress-dismiss" data-action="dismiss-save-progress" aria-label="${tr('dismissNudge')}">×</button></aside>` : ''}<p class="micro">${tr('phase')}</p>${b ? `<div class="best">${tr('best')} <strong>${b.score}</strong> <span>${'★'.repeat(b.stars)}</span></div>` : ''}</section><div class="scene-caption"><span>${restaurant.name[language]}</span><small>${tr('footer')}</small></div></main><footer class="menu-footer"><span>${content.id.toUpperCase()}</span><span>${tr('controls')}</span></footer>`;
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
    app.innerHTML = `${topbar()}<div class="veil"><section class="dialog"><span class="dialog-symbol">${screen === 'error' ? '☁' : '☀'}</span><h2>${tr(screen === 'error' ? 'connectionFailed' : 'connecting')}</h2>${screen === 'error' ? `<button class="primary" data-action="play">${tr('retry')}</button>` : '<div class="loader"></div>'}<button data-action="home">${tr('home')}</button></section></div>`;
  } else if (state?.phase === 'lobby') {
    scene?.setLabels([]);
    app.innerHTML =
      topbar() + '<div class="lobby-wrap"><div id="lobby"></div></div><div id="overlay"></div>';
    updateLobby();
  } else {
    app.innerHTML = `${topbar()}<section class="hud"><div class="shift"><span class="eyebrow">${restaurant.name[language]}</span><strong>${content.name[language]}</strong></div><div class="stat"><small>${tr('time')}</small><strong id="timer">3:00</strong></div><div class="stat"><small>${tr('score')}</small><strong id="score">0 <em>/ 220</em></strong></div><div class="stat"><small>${tr('orders')}</small><strong id="orders">0 <em>/ 2</em></strong></div><div class="stat combo"><small>${tr('combo')}</small><strong id="combo">×0</strong></div><button class="icon-button" data-action="pause" aria-label="${tr('pause')}">Ⅱ</button></section><section id="orders-list" class="orders-list" aria-label="${tr('orders')}"></section><div id="station-labels">${stations.map((s) => `<button class="station-label" id="label-${s.id}" data-station="${s.id}" data-component-source="${s.id.startsWith('ingredient-')}"><span>${stationName(s)}</span><small></small></button>`).join('')}</div><aside class="help-card"><div class="eyebrow">✦ ${tr('tutorial')}</div><p>${tr('tutorialHint')}</p><button data-action="skip-tutorial">${language === 'vi' ? 'Ẩn hướng dẫn' : 'Hide tutorial'}</button><button data-action="recipe">▤ ${tr('recipe')} <span>↗</span></button></aside><div class="game-tools"><button data-action="camera" aria-label="${tr('resetView')}">⌖</button><button data-action="recipe">▤ <span>${tr('recipe')}</span></button></div><section class="bottom-bar"><div class="hand"><span class="hand-icon">♧</span><div><small>${tr('hand')}</small><strong id="hand">${tr('empty')}</strong></div></div><p id="toast" role="status"></p><button class="primary" id="finish" data-action="finish" hidden>${tr('finish')} ↗</button></section><div id="overlay"></div>`;
    if (state?.session) {
      app.insertAdjacentHTML('beforeend', '<aside id="team-panel"></aside>');
      document.querySelector('[data-action="pause"]')?.remove();
    }
    scene?.setLabels(
      stations.map((s) => ({ id: s.id, node: document.getElementById(`label-${s.id}`)! })),
    );
    updateHud();
  }
  const headerActions = document.querySelector('.header-actions');
  headerActions?.insertAdjacentHTML(
    'beforeend',
    `<button class="subtle" data-action="settings" aria-label="${language === 'vi' ? 'Cài đặt' : 'Settings'}">⚙ <span>${language === 'vi' ? 'Cài đặt' : 'Settings'}</span></button>` +
      (accountClient.state.configured
        ? `<button class="subtle account-toggle" data-action="account">${escapeHTML(accountClient.state.account?.displayName ?? 'Guest')}</button>`
        : `<span class="guest-badge">${language === 'vi' ? 'Khách' : 'Guest'}</span>`),
  );
  if (accountOpen && (screen === 'menu' || screen === 'setup'))
    app.insertAdjacentHTML('beforeend', accountPanel());
  document.body.dataset.screen = screen;
  document.body.dataset.mode = state?.session ? 'coop' : 'solo';
  document.body.dataset.controls = preferences.touchControls;
  scene?.setCatPlayerName(accountClient.state.account?.displayName ?? '', language);
  if (screen === 'game') {
    app.insertAdjacentHTML(
      'beforeend',
      '<aside id="guidance" class="guidance-card" aria-live="polite"></aside>',
    );
    if (!rotationDismissed && navigator.maxTouchPoints > 0)
      app.insertAdjacentHTML(
        'beforeend',
        `<button class="rotation-hint" data-action="dismiss-rotation">${language === 'vi' ? '↻ Xoay ngang để thấy bếp rộng hơn · ×' : '↻ Rotate for a wider kitchen · ×'}</button>`,
      );
  }
  mobileControls.sync();
  audio.setTheme(screen === 'game' ? restaurant.id : 'menu');
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
  if (s.kind === 'board' && s.phase === 'processing' && s.process?.taps)
    return `${tr('chopCount')} ${s.progress}/${s.process?.taps ?? 3}`;
  if (s.kind === 'board' && s.phase === 'processing')
    return `${language === 'vi' ? 'Đang trộn' : 'Mixing'} ${Math.round(s.progress * 100)}%`;
  if (s.phase === 'processing')
    return `${tr(s.kind === 'sink' ? 'washing' : 'cooking')} ${Math.round(s.progress * 100)}%`;
  if (s.phase === 'burnt') return tr('burnt');
  if (s.phase === 'ready') return tr('ready');
  if (s.item?.kind === 'plate' && s.item.assemblyRecipe)
    return `${recipeById(s.item.assemblyRecipe).name[language]} · ${s.item.parts.length}/${recipeById(s.item.assemblyRecipe).components.length}`;
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
  mobileControls.sync();
  const hint = document.querySelector('.help-card p');
  const card = document.querySelector<HTMLElement>('.help-card');
  if (card) card.hidden = tutorialSkipped || !content.tutorial;
  if (hint) {
    const dirty = state.stations.some((s) => s.item?.kind === 'dirtyPlate');
    const processing = state.stations.some((s) => s.phase === 'processing');
    const controlHint =
      navigator.maxTouchPoints > 0
        ? preferences.touchControls === 'joystick'
          ? language === 'vi'
            ? 'Cần trái để đi, nút phải thao tác. '
            : 'Left stick to move; right button to use a station. '
          : language === 'vi'
            ? 'Chạm sàn để đi, chạm trạm để thao tác. '
            : 'Tap the floor to move and a station to use it. '
        : language === 'vi'
          ? 'PC: giữ WASD/mũi tên để đi, nhấp trạm để thao tác. '
          : 'PC: hold WASD/arrows to move, click a station to use it. ';
    hint.textContent =
      language === 'vi'
        ? dirty
          ? `${controlHint}Thu đĩa bẩn → bồn rửa → lấy đĩa sạch. Khách mới cần bàn sạch.`
          : processing
            ? `${controlHint}Thiết bị tự nấu: chuẩn bị nhánh còn lại trong lúc chờ. Nhấp sổ để xem công thức.`
            : `${controlHint}Lấy đĩa → bày món. Lấy nguyên liệu → thiết bị tương ứng; mỗi lần nhấp là một thao tác.`
        : dirty
          ? `${controlHint}Clear dirty plates, wash and reuse. New guests need a clean seat.`
          : processing
            ? `${controlHint}Prepare the other branch while the cooker runs. Open the recipe book.`
            : `${controlHint}Place a plate on assembly. Carry each ingredient to its processor; one click performs one action.`;
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
  if (!(navigator.maxTouchPoints > 0 && preferences.touchControls === 'joystick'))
    scene?.setInteractionTarget(tapNavigation.pending?.station ?? c?.target ?? null);
  set('hand', c?.item ? tr(c.item.kind) : tr('empty'));
  document.body.dataset.handEmpty = String(!c?.item);
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
  const nextHint = preferences.guidance
    ? guidance(state, room?.sessionId ?? '', trackedOrder)
    : null;
  const guide = document.getElementById('guidance');
  if (guide) {
    guide.hidden = !nextHint;
    if (nextHint) {
      trackedOrder = nextHint.customer;
      const destination = state.stations.find((s) => s.id === nextHint.station);
      const verbs =
        language === 'vi'
          ? {
              take: 'Lấy',
              put: 'Đặt vào',
              prep: 'Sơ chế',
              serve: 'Phục vụ',
              wait: 'Đợi nhánh đang chuẩn bị',
            }
          : {
              take: 'Take',
              put: 'Place at',
              prep: 'Prepare',
              serve: 'Serve',
              wait: 'Waiting for work in progress',
            };
      const html = `<strong>${verbs[nextHint.action]}${destination ? ` · ${stationName(destination)}` : ''}</strong><small>${language === 'vi' ? 'Còn thiếu' : 'Missing'}: ${nextHint.missing.map(tr).join(' · ') || '✓'}</small>`;
      if (guide.innerHTML !== html) guide.innerHTML = html;
    }
  }
  const ordersList = document.getElementById('orders-list')!;
  let ordersToggle = ordersList.querySelector<HTMLButtonElement>('.orders-toggle');
  if (!ordersToggle) {
    ordersToggle = document.createElement('button');
    ordersToggle.className = 'orders-toggle';
    ordersToggle.dataset.action = 'toggle-orders';
    ordersList.prepend(ordersToggle);
  }
  let ordersContent = ordersList.querySelector<HTMLElement>('.orders-content');
  if (!ordersContent) {
    ordersContent = document.createElement('div');
    ordersContent.id = 'orders-content';
    ordersContent.className = 'orders-content';
    while (ordersToggle.nextSibling) ordersContent.append(ordersToggle.nextSibling);
    ordersList.append(ordersContent);
  }
  ordersToggle.hidden = !navigator.maxTouchPoints;
  const urgentOrderCount = state.customers.filter((customer) => customerUrgent(customer)).length;
  ordersToggle.setAttribute('aria-expanded', String(ordersExpanded));
  ordersToggle.dataset.urgent = String(urgentOrderCount > 0);
  ordersToggle.textContent = `${urgentOrderCount ? '⚠ ' : ''}${language === 'vi' ? 'Đơn' : 'Orders'} ${tickets.length} ${ordersExpanded ? '▲' : '▼'}`;
  // Keep each ticket button alive between snapshots so touch/click can finish.
  for (const existing of Array.from(ordersContent.querySelectorAll<HTMLElement>('.ticket'))) {
    if (!tickets.some((ticket) => ticket.id === existing.dataset.order)) existing.remove();
  }
  for (const customer of tickets) {
    let ticket = ordersContent.querySelector<HTMLButtonElement>(`[data-order="${customer.id}"]`);
    if (!ticket) {
      ticket = document.createElement('button');
      ticket.className = 'ticket';
      ticket.dataset.action = 'track-order';
      ticket.dataset.order = customer.id;
      ticket.innerHTML =
        '<span class="food-icon"></span><div><small></small><strong></strong><div class="patience"><i></i></div></div><span class="ticket-time"></span>';
      ordersContent.append(ticket);
    }
    const urgent = customerUrgent(customer);
    ticket.classList.toggle('customer-urgent', urgent);
    ticket.setAttribute('aria-pressed', String(customer.id === trackedOrder));
    ticket.querySelector('.food-icon')!.textContent = urgent ? '⚠' : recipeIcon(customer.recipe);
    ticket.querySelector('small')!.textContent =
      tr(customer.seat!) + (urgent ? (language === 'vi' ? ' · Sắp bỏ đi' : ' · Leaving soon') : '');
    ticket.querySelector('strong')!.textContent =
      `${recipeById(customer.recipe).name[language]} · ${customerTypes[customer.type ?? 'regular'].name[language]}`;
    const patience = ticket.querySelector<HTMLElement>('.patience i')!;
    patience.style.width = `${Math.max(0, (customer.patience / customer.maxPatience) * 100)}%`;
    patience.style.background = customer.patience < 25 ? '#dd826e' : '#568f74';
    ticket.querySelector('.ticket-time')!.textContent = `${Math.ceil(customer.patience)}s`;
  }
  let queuePill = ordersContent.querySelector<HTMLElement>('.queue-pill');
  if (!queuePill) {
    queuePill = document.createElement('div');
    queuePill.className = 'queue-pill';
  }
  ordersContent.append(queuePill);
  const queueUrgent = state.customers.some(
    (customer) => !customer.seat && customerUrgent(customer),
  );
  queuePill.classList.toggle('customer-urgent', queueUrgent);
  queuePill.textContent = `♟ ${tr('queue')}: ${state.customers.filter((customer) => !customer.seat).length}/${content.queueLimit}${queueUrgent ? (language === 'vi' ? ' · ⚠ Sắp bỏ đi' : ' · ⚠ Leaving soon') : ''}`;
  ordersList.dataset.expanded = String(ordersExpanded);
  for (const s of state.stations) {
    const el = document.getElementById(`label-${s.id}`);
    if (el) {
      el.dataset.icon = {
        dispenser: '▣',
        board: '✂',
        stove: '♨',
        assembly: '◉',
        rack: '◎',
        sink: '≈',
        trash: '×',
        seat: '♟',
        counter: '▤',
      }[s.kind];
      const feedback = stationFeedback(s, content.burnSeconds);
      el.dataset.feedback = feedback ?? '';
      el.querySelector('small')!.textContent =
        feedback === 'burn-soon'
          ? language === 'vi'
            ? '⚠ Sắp cháy!'
            : '⚠ Burning soon!'
          : stationStatus(s);
      el.classList.toggle(
        'station-ready',
        s.phase === 'ready' || !!(s.item && dishRecipe(s.item.kind)),
      );
      el.classList.toggle('station-burnt', s.phase === 'burnt');
      el.classList.toggle('station-target', (tapNavigation.pending?.station ?? c?.target) === s.id);
      el.classList.toggle('station-guidance', nextHint?.station === s.id);
      el.classList.toggle(
        'station-occupied',
        Object.values(state.chefs).some(
          (other) =>
            other.id !== room?.sessionId &&
            other.connected &&
            (other.target === s.id ||
              (other.path.length > 0 &&
                Math.hypot(other.path.at(-1)!.x - s.x, other.path.at(-1)!.z - s.z) <= 1.05)),
        ),
      );
      el.classList.toggle(
        'station-ping',
        !!state.session?.signals.some((signal) => signal.type === 'ping' && signal.value === s.id),
      );
    }
  }
  if (state.event.seq !== lastEvent) {
    const firstSnapshot = lastEvent < 0;
    lastEvent = state.event.seq;
    if (!firstSnapshot) audio.play(state.event.key);
  }
  for (const cue of feedbackCues.update(state, content.burnSeconds)) {
    if (!['foodReady', 'washed'].includes(cue) || state.event.key !== cue) audio.play(cue);
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
    html = `<div class="veil"><section class="dialog"><h2>${tr('disconnected')}</h2><div class="loader"></div><button data-action="home">${tr('home')}</button></section></div>`;
  else if (state.countdown) {
    html = `<div class="veil"><section class="dialog" role="status"><p>${language === 'vi' ? 'Sẵn sàng vào bếp' : 'Ready for the kitchen'}</p><h2>${state.countdown}</h2><p>${language === 'vi' ? 'Chạm sàn để đi · Chạm trạm để thao tác' : 'Tap the floor to walk · Tap a station to use it'}</p></section></div>`;
  } else if (state.result) {
    const r = state.result;
    const isSessionHost = state.session?.host === room?.sessionId;
    html = `<div class="veil"><section class="dialog results"><div class="result-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div><p class="eyebrow">${currentContent().name[language]}</p><h2>${tr(r.won ? 'won' : 'lost')}</h2><p>${tr('resultHint')}</p><div class="result-grid"><div><small>${tr('score')}</small><strong>${r.score}</strong></div><div><small>${tr('orders')}</small><strong>${r.served}</strong></div><div><small>${tr('bestCombo')}</small><strong>×${r.bestCombo}</strong></div><div><small>${tr('missed')}</small><strong>${r.missed}</strong></div></div>${state.session ? `<p class="team-streak-result">${tr('teamStreak')}: ×${state.session.teamStreak}</p>` : ''}<small>${tr(saveMessage)}</small>${state.session ? (isSessionHost ? `<button class="primary" data-action="continue-team">${tr(r.won ? 'continueNext' : 'retryTogether')} ↗</button>` : `<p class="team-waiting">${tr('waitingForHost')}</p>`) : `<button class="primary" data-action="play">${tr('replay')} ↗</button>`}<button data-action="home">${tr('home')}</button></section></div>`;
  } else if (state.phase === 'paused')
    html = `<div class="veil"><section class="dialog"><span class="dialog-symbol">☕</span><h2>${tr('paused')}</h2><p>${tr('pausedHint')}</p><button class="primary" data-action="pause">${tr('resume')}</button><button data-action="home">${tr('home')}</button></section></div>`;
  else if (notebook)
    html = `<div class="notebook" role="dialog" aria-modal="false" aria-label="${tr('recipe')}"><button class="notebook-close" data-action="recipe" aria-label="${tr('close')}">×</button><p class="eyebrow">${tr('recipe')}</p><nav class="recipe-tabs" aria-label="${tr('recipe')}">${currentContent()
      .recipes.map(
        (id) =>
          `<button class="recipe-tab" data-action="recipe-tab" data-recipe="${id}" aria-pressed="${id === (notebookRecipe ?? currentContent().recipes[0])}">${recipeIcon(id)} ${recipeById(id).name[language]}</button>`,
      )
      .join('')}</nav>${currentContent()
      .recipes.filter(
        (id) =>
          id ===
          (currentContent().recipes.includes(notebookRecipe ?? '')
            ? notebookRecipe
            : currentContent().recipes[0]),
      )
      .map((id) => {
        const r = recipeById(id);
        return `<div class="recipe-hero">${recipeIcon(r.id)}</div><h2>${r.name[language]}</h2><p>${tr('recipeHint')}</p><ol class="recipe-steps">${r.steps.map((step, index) => `<li class="recipe-step"><strong>${index + 1}. ${tr(step.output)}</strong><p>${step.inputs.map(tr).join(' + ')} → <b>${tr(step.station)}</b> ${step.seconds ? step.seconds + 's' : step.taps ? step.taps + '×' : ''}</p><small>${step.dependsOn.length ? `${language === 'vi' ? 'Sau bước' : 'After step'} ${step.dependsOn.map((id) => r.steps.findIndex((s) => s.id === id) + 1).join(', ')}` : language === 'vi' ? 'Nhánh độc lập · có thể chuẩn bị song song' : 'Independent branch · prepare in parallel'}</small></li>`).join('')}</ol>`;
      })
      .join(
        '',
      )}<small>${currentContent().washSeconds}s ${tr('sink')}</small><p>★★ ${starThreshold(1)} ${tr('score')} · ★★★ ${starThreshold(2)} ${tr('score')}, ≤${currentContent().maxMissedThreeStars} ${tr('missed')}, ≤${currentContent().maxAverageServiceThreeStars}s, ${tr('combo')} ≥${currentContent().minComboThreeStars}</p></div>`;
  if (overlay.innerHTML !== html) overlay.innerHTML = html;
  if (state.result?.won && !state.session && !overlay.querySelector('[data-action="next-level"]')) {
    const next = levels[levels.findIndex((l) => l.id === currentContent().id) + 1];
    if (next && unlockedLevels(wins).some((l) => l.id === next.id))
      overlay
        .querySelector('.results')
        ?.insertAdjacentHTML(
          'beforeend',
          `<button class="primary" data-action="next-level">${language === 'vi' ? 'Màn tiếp theo' : 'Next level'} →</button>`,
        );
  }
}
async function attach(r: Room, signal: AbortSignal) {
  if (signal.aborted) {
    void leaveRoom(r);
    return;
  }
  const isCurrent = () => !signal.aborted && room === r;
  tapNavigation.cancel();
  trackedOrder = undefined;
  notebookRecipe = undefined;
  // A single retry owner avoids the SDK retry loop competing with explicit reconnects.
  r.reconnection.enabled = false;
  room = r;
  connected = true;
  screen = 'game';
  notebook = false;
  lastEvent = -1;
  feedbackCues.reset();
  mobileControls.stop(false);
  pinging = false;
  commsOpen = false;
  render();
  try {
    sessionStorage.setItem('kr-reconnect', r.reconnectionToken);
  } catch {}
  const receive = (s: any) => {
    if (!isCurrent() || !s.snapshot) return;
    try {
      const previousLobby = state?.phase === 'lobby',
        previousCoop = !!state?.session,
        previousLevel = state?.levelId;
      state = JSON.parse(s.snapshot) as Snapshot;
      const interaction = tapNavigation.receive(state, r.sessionId, performance.now());
      if (interaction && connected) r.send('intent', interaction);
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
    if (!isCurrent()) return;
    const el = document.getElementById('team-notice') ?? document.getElementById('toast');
    if (el) el.textContent = tr(key);
  });
  receive(r.state);
  r.onDrop(() => {
    if (isCurrent()) {
      tapNavigation.cancel();
      connected = false;
      updateOverlay();
    }
  });
  r.onReconnect(() => {
    if (isCurrent()) {
      connected = true;
      try {
        sessionStorage.setItem('kr-reconnect', r.reconnectionToken);
      } catch {}
      updateOverlay();
    }
  });
  r.onLeave(async () => {
    if (!isCurrent() || screen !== 'game') return;
    connected = false;
    updateOverlay();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!isCurrent() || screen !== 'game') return;
      try {
        await attach(await connectRoom(client.reconnect(r.reconnectionToken), signal), signal);
        return;
      } catch {
        if (signal.aborted) return;
      }
    }
    if (isCurrent()) {
      screen = 'error';
      render();
    }
  });
  r.onError(() => {
    if (isCurrent()) {
      connected = false;
      updateOverlay();
    }
  });
}
function connectRoom(operation: Promise<Room>, signal: AbortSignal) {
  let cancelled = signal.aborted;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const guarded = operation.then((connectedRoom) => {
    if (cancelled || signal.aborted) {
      void leaveRoom(connectedRoom);
      throw new Error('roomConnectionCancelled');
    }
    return connectedRoom;
  });
  let onAbort: () => void;
  return Promise.race([
    guarded,
    new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        cancelled = true;
        reject(new Error('roomConnectionCancelled'));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      timeout = setTimeout(() => {
        cancelled = true;
        reject(new Error('roomConnectionTimeout'));
      }, 15000);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  });
}
async function play() {
  const signal = invalidateConnection();
  lastTeamRequest = null;
  audio.unlock();
  const old = room;
  room = null;
  void leaveRoom(old);
  state = null;
  screen = 'connecting';
  render();
  try {
    tutorialSkipped = false;
    await prepareAccountSession();
    if (signal.aborted) return;
    await attach(
      await connectRoom(client.create('solo', { levelId: selectedLevel }), signal),
      signal,
    );
  } catch (e) {
    if (signal.aborted) return;
    console.error(e);
    screen = 'error';
    render();
  }
}
async function playTeam(mode: 'private' | 'public' | 'join', code = '', preferredSize?: number) {
  const signal = invalidateConnection();
  const size =
    preferredSize ?? Number(document.querySelector<HTMLSelectElement>('#team-size')?.value ?? 4);
  lastTeamRequest = { mode, code, size };
  audio.unlock();
  const old = room;
  room = null;
  void leaveRoom(old);
  state = null;
  screen = 'connecting';
  render();
  try {
    await prepareAccountSession();
    if (signal.aborted) return;
    const next =
      mode === 'join'
        ? client.joinById(code.trim())
        : mode === 'public'
          ? client.joinOrCreate('coop_public', { teamSize: size, levelId: selectedLevel })
          : client.create('coop_private', { teamSize: size, levelId: selectedLevel });
    await attach(await connectRoom(Promise.resolve(next), signal), signal);
  } catch (e) {
    if (signal.aborted) return;
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
  if (target.dataset.action === 'account-auth-mode') {
    const mode = target.dataset.authMode;
    if (mode === 'login' || mode === 'register') {
      accountAuthMode = mode;
      const form = target.closest<HTMLElement>('.account-auth');
      if (form) {
        form.dataset.mode = mode;
        form.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
        });
        const password = form.querySelector<HTMLInputElement>('#account-password');
        if (password)
          password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
      }
    }
    return;
  }
  if (target.dataset.action === 'copy-game-link') {
    const url = window.location.href;
    void (async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        target.textContent = tr('linkCopied');
      } catch {
        window.prompt(tr('copyPrompt'), url);
      }
    })();
    return;
  }
  if (target.dataset.action === 'reload-game') {
    window.location.reload();
    return;
  }
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
    mobileControls.stop(false);
    scene?.setInteractionTarget(target.dataset.station);
    if (pinging) {
      send({ type: 'ping', value: target.dataset.station });
      pinging = false;
      updateHud();
      return;
    }
    selectStation(target.dataset.station);
    return;
  }
  switch (target.dataset.action) {
    case 'next-level': {
      const next = levels[levels.findIndex((l) => l.id === currentContent().id) + 1];
      if (next && !state?.session && unlockedLevels(wins).some((l) => l.id === next.id)) {
        selectedLevel = next.id;
        void play();
      }
      break;
    }
    case 'dismiss-rotation':
      rotationDismissed = true;
      target.remove();
      break;
    case 'recipe-tab':
      if (currentContent().recipes.includes(target.dataset.recipe ?? '')) {
        notebookRecipe = target.dataset.recipe;
        updateHud();
      }
      break;
    case 'track-order':
      trackedOrder = target.dataset.order;
      {
        const order = state?.customers.find((customer) => customer.id === trackedOrder);
        if (order) send({ type: 'selectRecipe', recipe: order.recipe });
      }
      if (navigator.maxTouchPoints) ordersExpanded = false;
      updateHud();
      break;
    case 'settings':
      tapNavigation.cancel();
      mobileControls.stop();
      settings.open(preferences, language);
      break;
    case 'account':
      accountOpen = !accountOpen;
      accountAuthMode = 'login';
      accountMessage = '';
      render();
      break;
    case 'account-open-login':
      accountOpen = true;
      accountAuthMode = 'login';
      accountMessage = '';
      render();
      break;
    case 'dismiss-save-progress':
      saveProgressNudgeDismissed = true;
      render();
      break;
    case 'account-register':
      void updateAccount('register');
      break;
    case 'account-login':
      void updateAccount('login');
      break;
    case 'account-logout':
      void updateAccount('logout');
      break;
    case 'account-password':
      void updateAccount('password');
      break;
    case 'account-verify-email':
      void updateAccount('verify-email');
      break;
    case 'account-reset-password':
      void updateAccount('reset-password');
      break;
    case 'account-resend-verification':
      void updateAccount('request-verification');
      break;
    case 'account-request-reset':
      void updateAccount('request-reset');
      break;
    case 'skip-tutorial':
      tutorialSkipped = true;
      updateHud();
      break;
    case 'multiplayer': {
      invalidateConnection();
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
    case 'continue-team': {
      if (!state?.session || state.session.host !== room?.sessionId || !state.result) break;
      const next = levels[levels.findIndex((l) => l.id === currentContent().id) + 1];
      const canAdvance =
        state.result.won && next && unlockedLevels(wins).some((l) => l.id === next.id);
      send({
        type: 'continue',
        levelId: canAdvance ? next.id : currentContent().id,
      });
      break;
    }
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
      invalidateConnection();
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
      applyPreferences({ muted: !preferences.muted });
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
      scene?.toggleCameraView();
      {
        const button = document.querySelector<HTMLButtonElement>('[data-action="camera"]');
        if (button) {
          const overview = scene?.isCameraOverview ?? false;
          const label = overview
            ? language === 'vi'
              ? 'Theo đầu bếp'
              : 'Follow chef'
            : language === 'vi'
              ? 'Toàn cảnh'
              : 'Overview';
          button.setAttribute('aria-label', label);
          button.dataset.view = overview ? 'overview' : 'follow';
          button.innerHTML = `${overview ? '↩' : '⌖'} <span>${label}</span>`;
        }
      }
      break;
    case 'toggle-orders':
      ordersExpanded = !ordersExpanded;
      updateHud();
      break;
  }
});
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape' && screen === 'game') {
    if (notebook) {
      notebook = false;
      updateOverlay();
    } else if (!state?.session) send({ type: 'pause' });
  }
});
const keyboardMoves = new Set<string>();
let keyboardTimer = 0;
let lastKeyboardMove = 0;
function sendKeyboardMove() {
  if (screen !== 'game' || document.hidden || notebook || document.querySelector('dialog[open]'))
    return;
  const chef = state?.chefs[room?.sessionId ?? ''];
  const direction = keyboardDirection(keyboardMoves);
  if (!chef || !state || !direction || chef.path.length) return;
  const now = performance.now();
  if (now - lastKeyboardMove < 220) return;
  const goal = movementTarget(chef, direction, state.stations, scene?.camera.alpha ?? Math.PI / 4);
  if (!goal) return;
  lastKeyboardMove = now;
  send({ type: 'move', ...goal });
}
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (!['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key))
    return;
  const target = e.target as HTMLElement | null;
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? ''))
    return;
  if (screen !== 'game' || state?.phase !== 'playing' || document.querySelector('dialog[open]'))
    return;
  e.preventDefault();
  keyboardMoves.add(key);
  if (!keyboardTimer) keyboardTimer = window.setInterval(sendKeyboardMove, 80);
  sendKeyboardMove();
});
window.addEventListener('keyup', (e) => {
  keyboardMoves.delete(e.key.toLowerCase());
  if (!keyboardMoves.size && keyboardTimer) {
    window.clearInterval(keyboardTimer);
    keyboardTimer = 0;
  }
});
window.addEventListener('blur', () => {
  keyboardMoves.clear();
  if (keyboardTimer) window.clearInterval(keyboardTimer);
  keyboardTimer = 0;
});
try {
  scene = new KitchenScene(document.querySelector<HTMLCanvasElement>('#game')!);
  scene.onCatMeow = () => audio.play('catMeow');
  scene.onCatPet = () => audio.play('catPurr');
  applyPreferences();
  scene.onMove = (p) => {
    mobileControls.stop(false);
    if (screen === 'game') send({ type: 'move', ...p });
  };
  scene.onInteract = (station) => {
    mobileControls.stop(false);
    scene?.setInteractionTarget(station);
    if (screen === 'game') {
      if (pinging) {
        send({ type: 'ping', value: station });
        pinging = false;
        updateHud();
      } else selectStation(station);
    }
  };
  render();
  accountReady = accountClient.bootstrap(endpoint).then((accountState) => {
    if (accountState.available && accountState.progress) {
      wins = accountState.progress.wins;
      if (!accountState.progress.unlocked.includes(selectedLevel))
        selectedLevel = accountState.progress.unlocked.at(-1) ?? level.id;
    }
    render();
    return accountState;
  });
  let token: string | null = null;
  try {
    token = sessionStorage.getItem('kr-reconnect');
  } catch {}
  const invitation = new URL(location.href).searchParams.get('room');
  if (invitation) {
    history.replaceState(null, '', location.pathname);
    void playTeam('join', invitation);
  } else if (token) {
    const signal = invalidateConnection();
    screen = 'connecting';
    render();
    void prepareAccountSession()
      .then(() => {
        if (signal.aborted) throw new Error('roomConnectionCancelled');
        return connectRoom(client.reconnect(token!), signal);
      })
      .then((r) => attach(r, signal))
      .catch(() => {
        if (signal.aborted) return;
        screen = 'menu';
        render();
      });
  }
} catch (e) {
  console.error(e);
  const userAgent = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const errorText = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const webglUnavailable = /webgl|graphics context/i.test(errorText);
  const hint = !webglUnavailable
    ? tr('startupGeneralHint')
    : isIOS
      ? tr('webglIosHint')
      : isAndroid
        ? tr('webglAndroidHint')
        : tr('webglDesktopHint');
  const details = escapeHTML(errorText).slice(0, 600);
  app.innerHTML = `<div class="veil"><section class="dialog webgl-recovery" role="alert">
    <div class="dialog-symbol" aria-hidden="true">◌</div>
    <h2>${tr('webgl')}</h2>
    <p>${hint}</p>
    <div class="webgl-recovery-actions">
      <button class="primary" data-action="copy-game-link">${tr('copyGameLink')}</button>
      <button data-action="reload-game">${tr('tryAgain')}</button>
    </div>
    <details><summary>${tr('technicalDetails')}</summary><code>${details}</code></details>
  </section></div>`;
}
