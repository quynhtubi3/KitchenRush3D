import type { Snapshot } from '../../../packages/shared/src/types';
import { QUICK_CHAT, EMOTES } from '../../../packages/shared/src/types';
type Translate = (key: string) => string;
export const chefColors = ['#437e72', '#dd826e', '#a18bd1', '#d6a038'];
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function setupUI(t: Translate) {
  return `<div class="veil"><section class="dialog multiplayer-setup"><p class="eyebrow">KITCHEN RUSH · CO-OP</p><h2>${t('cookTogether')}</h2><p>${t('coopIntro')}</p><label>${t('teamSize')}<select id="team-size"><option value="2">2</option><option value="3">3</option><option value="4" selected>4</option></select></label><button class="primary" data-action="create-private">${t('createPrivate')}</button><button data-action="matchmake">${t('findTeam')}</button><div class="join-code"><label for="room-code">${t('roomCode')}</label><input id="room-code" autocomplete="off" spellcheck="false" maxlength="30"/><button data-action="join-private">${t('joinRoom')}</button></div><button data-action="home">${t('home')}</button></section></div>`;
}
export function lobbyUI(
  s: Snapshot,
  id: string,
  t: Translate,
  levels: { id: string; name: string }[] = [{ id: 'little-sun-01', name: 'Little Sun 01' }],
) {
  const info = s.session!;
  const own = info.members.find((m) => m.id === id);
  const host = info.host === id;
  const canStart =
    info.members.length >= 2 &&
    info.members.every((m) => m.connected && m.ready) &&
    (info.visibility === 'private' || info.members.length === info.capacity);
  return `<section class="lobby-panel"><p class="eyebrow">${t(info.visibility === 'private' ? 'privateRoom' : 'publicRoom')}</p><h2>${t('cookTogether')}</h2><div class="room-code"><small>${t('roomCode')}</small><strong id="invite-code">${escape(info.code)}</strong><button data-action="copy-invite">${t('copyInvite')}</button></div><label>${t('selectLevel')}<select id="level-select" ${host && info.visibility === 'private' ? '' : 'disabled'}>${[...levels, ...(!levels.some((l) => l.id === info.levelId) ? [{ id: info.levelId, name: info.levelId }] : [])].map((l) => `<option value="${escape(l.id)}" ${l.id === info.levelId ? 'selected' : ''}>${escape(l.name)}</option>`).join('')}</select></label><div class="lobby-members">${info.members.map((m) => `<div class="lobby-member" data-member="${escape(m.id)}"><span class="chef-dot" style="background:${chefColors[m.slot]}"></span><strong>${t('chef')} ${m.slot + 1} ${m.id === id ? `(${t('you')})` : ''}</strong><span>${m.id === info.host ? '♛ ' + t('host') : ''}</span><b>${t(!m.connected ? 'offline' : m.ready ? 'ready' : 'notReadyLabel')}</b></div>`).join('')}</div><p>${info.members.length}/${info.capacity} · ${t('lobbyHint')}</p><div class="lobby-actions"><button class="primary" data-action="ready" aria-pressed="${own?.ready ?? false}">${t(own?.ready ? 'cancelReady' : 'readyUp')}</button>${info.visibility === 'private' ? `<button data-action="start-team" ${host && canStart ? '' : 'disabled'}>${t('startTeam')}</button>` : `<span>${t('autoStart')}</span>`}<button data-action="home">${t('leaveRoom')}</button></div><div id="team-notice" role="status"></div></section>`;
}
export function teamUI(s: Snapshot, id: string, t: Translate, pinging: boolean) {
  const info = s.session;
  if (!info) return '';
  const names = new Map(info.members.map((m) => [m.id, `${t('chef')} ${m.slot + 1}`]));
  return `<div class="team-roster">${info.members.map((m) => `<span data-teammate="${escape(m.id)}" class="teammate ${m.id === id ? 'self' : ''}"><i style="background:${chefColors[m.slot]}"></i>${names.get(m.id)}${m.id === info.host ? ' ♛' : ''}<small>${m.connected ? t(s.chefs[m.id]?.item?.kind ?? 'empty') : t('offline')}</small></span>`).join('')}</div><div class="team-social"><button data-action="toggle-comms" aria-label="${t('teamComms')}">☏ ${t('teamComms')}</button><button data-action="ping-mode" aria-pressed="${pinging}">⌖ ${t(pinging ? 'choosePing' : 'ping')}</button><button data-action="home">${t('leaveRoom')}</button></div><div id="comms-options" hidden>${QUICK_CHAT.map((value) => `<button data-chat="${value}">${t(value)}</button>`).join('')}${EMOTES.map((value) => `<button data-emote="${value}">${t(value)}</button>`).join('')}</div><div class="team-signals" role="status">${info.signals.map((signal) => `<span data-signal="${signal.type}">${names.get(signal.from) ?? t('chef')}: ${signal.type === 'ping' ? '⌖ ' : ''}${t(signal.value)}</span>`).join('')}</div><div class="vote-status">${info.votes.length ? `${t('finishVotes')}: ${info.votes.length}/${info.members.filter((m) => m.connected).length}` : ''}</div>`;
}
