import type { Chef, Point, Snapshot, Intent, Station } from '../../../packages/shared/src/types';
import { map } from '../../../packages/content/src/index';
import { dishRecipe } from '../../../packages/content/src/campaign';

const INTERACTION_RADIUS = 1.05;
const TARGET_HYSTERESIS = 0.32;

export function stickDirection(x: number, y: number): Point | null {
  if (!Number.isFinite(x + y) || Math.hypot(x, y) < 0.22) return null;
  const angle = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) * Math.PI) / 4;
  return { x: Math.round(Math.cos(angle)), z: Math.round(Math.sin(angle)) };
}
export function keyboardDirection(keys: ReadonlySet<string>): Point | null {
  const x =
    Number(keys.has('d') || keys.has('arrowright')) -
    Number(keys.has('a') || keys.has('arrowleft'));
  const z =
    Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  return x || z ? { x, z } : null;
}
export function movementTarget(
  chef: Chef,
  direction: Point,
  stations: Station[],
  alpha: number,
): Point | null {
  // Babylon's left-handed view sees world -X on screen-right at alpha=PI/2.
  const wx = -direction.x * Math.sin(alpha) + direction.z * Math.cos(alpha);
  const wz = direction.x * Math.cos(alpha) + direction.z * Math.sin(alpha);
  const length = Math.hypot(wx, wz);
  const dx = Math.abs(wx / length) > 0.38 ? Math.sign(wx) : 0;
  const dz = Math.abs(wz / length) > 0.38 ? Math.sign(wz) : 0;
  const origin = { x: Math.round(chef.x), z: Math.round(chef.z) };
  const free = (p: Point) =>
    p.x >= 1 &&
    p.z >= 2 &&
    p.x < map.width - 1 &&
    p.z < map.height - 1 &&
    !stations.some((s) => s.x === p.x && s.z === p.z);
  const horizontal = { x: origin.x + dx, z: origin.z };
  const vertical = { x: origin.x, z: origin.z + dz };
  const diagonal = { x: origin.x + dx, z: origin.z + dz };
  if (free(diagonal) && (!dx || !dz || (free(horizontal) && free(vertical)))) return diagonal;
  const candidates = Math.abs(wx) >= Math.abs(wz) ? [horizontal, vertical] : [vertical, horizontal];
  return candidates.find((p) => (p.x !== origin.x || p.z !== origin.z) && free(p)) ?? null;
}
export function nearbyStation(
  chef: Chef,
  stations: Station[],
  preferredId?: string | null,
): Station | undefined {
  let nearest: Station | undefined;
  let nearestDistance = INTERACTION_RADIUS;
  let preferred: Station | undefined;
  let preferredDistance = INTERACTION_RADIUS;
  for (const station of stations) {
    const distance = Math.hypot(station.x - chef.x, station.z - chef.z);
    if (distance <= nearestDistance) {
      if (distance < nearestDistance || !nearest || station.id.localeCompare(nearest.id) < 0) {
        nearest = station;
        nearestDistance = distance;
      }
    }
    if (station.id === preferredId && distance <= preferredDistance) {
      preferred = station;
      preferredDistance = distance;
    }
  }
  if (preferred && nearest && preferred.id !== nearest.id) {
    if (nearestDistance + TARGET_HYSTERESIS > preferredDistance) return preferred;
  }
  return nearest;
}

export function expectedInteraction(chef: Chef, station: Station, state: Snapshot, vi: boolean) {
  const held = chef.item;
  const text = (en: string, local: string) => (vi ? local : en);
  switch (station.kind) {
    case 'dispenser':
      return held ? text('Hands full', 'Tay đang bận') : text('Take ingredient', 'Lấy nguyên liệu');
    case 'counter':
      if (held && !station.item) return text('Place item', 'Đặt món');
      if (!held && station.item) return text('Take item', 'Lấy món');
      return text('Use counter', 'Dùng bàn trung gian');
    case 'rack':
      if (!held && station.stock.length) return text('Take clean plate', 'Lấy đĩa sạch');
      if (held?.kind === 'plate' && !held.parts.length)
        return text('Return clean plate', 'Trả đĩa sạch');
      return text('Check plate rack', 'Kiểm tra giá đĩa');
    case 'board':
    case 'stove':
      if (!held && (station.phase === 'ready' || station.phase === 'burnt'))
        return text('Take prepared food', 'Lấy món đã chế biến');
      if (!held && station.phase === 'processing' && station.process?.taps)
        return text('Continue chopping', 'Tiếp tục sơ chế');
      if (held && station.phase === 'idle')
        return station.kind === 'stove'
          ? text('Start cooking', 'Bắt đầu nấu')
          : text('Start prep', 'Bắt đầu sơ chế');
      return text('Check station', 'Kiểm tra trạm');
    case 'assembly':
      if (!held && station.item) return text('Take assembled dish', 'Lấy món đã ráp');
      if (held?.kind === 'plate' && !station.item) return text('Set a plate', 'Đặt đĩa');
      if (held && station.item?.kind === 'plate') return text('Add ingredient', 'Thêm nguyên liệu');
      return text('Check assembly', 'Kiểm tra bàn ráp món');
    case 'sink':
      if (!held && station.phase === 'ready' && station.item)
        return text('Take clean plate', 'Lấy đĩa sạch');
      if (held?.kind === 'dirtyPlate' && !station.item)
        return text('Wash dirty plate', 'Rửa đĩa bẩn');
      return text('Check sink', 'Kiểm tra bồn rửa');
    case 'seat': {
      const customer = state.customers.find((guest) => guest.seat === station.id);
      const recipe = customer && dishRecipe(customer.recipe);
      if (!held && station.item?.kind === 'dirtyPlate')
        return text('Collect dirty plate', 'Thu đĩa bẩn');
      if (
        held &&
        recipe &&
        customer?.state === 'WaitingForFood' &&
        held.kind === recipe.steps.at(-1)?.output
      )
        return text('Serve order', 'Phục vụ món');
      return text('Check guest', 'Kiểm tra khách');
    }
    case 'trash':
      return held
        ? text('Discard ingredient', 'Bỏ nguyên liệu')
        : text('Trash is empty', 'Không có gì để bỏ');
  }
}

export class MobileControls {
  private root = document.createElement('section');
  private pad: HTMLButtonElement;
  private action: HTMLButtonElement;
  private knob: HTMLElement;
  private pointer: number | null = null;
  private direction: Point | null = null;
  private lastGoal: Point | null = null;
  private lastSent = 0;
  private visible = false;
  private selectedStationId: string | null = null;
  constructor(
    private read: () => {
      state: Snapshot | null;
      chef?: Chef;
      enabled: boolean;
      alpha: number;
      vi: boolean;
    },
    private send: (intent: Intent) => void,
    private name: (s: Station) => string,
    private focus: (stationId: string | null) => void = () => {},
  ) {
    this.root.id = 'mobile-controls';
    this.root.hidden = true;
    this.root.innerHTML =
      '<button id="joystick" type="button"><span class="stick-knob"></span><span class="stick-hint">✥</span></button><button id="touch-interact" type="button" aria-live="polite"><span class="interact-verb"></span><strong class="interact-station"></strong></button>';
    document.body.append(this.root);
    this.pad = this.root.querySelector('#joystick')!;
    this.knob = this.root.querySelector('.stick-knob')!;
    this.action = this.root.querySelector('#touch-interact')!;
    this.pad.addEventListener('pointerdown', (e) => {
      if (this.pointer !== null || !this.usable()) return;
      e.preventDefault();
      this.pointer = e.pointerId;
      this.pad.setPointerCapture(e.pointerId);
      this.drag(e);
      this.tick();
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (this.pointer === e.pointerId) this.drag(e);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      this.pad.addEventListener(type, (e) => {
        if ((e as PointerEvent).pointerId === this.pointer) this.stop();
      });
    this.action.addEventListener('click', () => {
      if (!this.usable()) return;
      const { chef, state } = this.read();
      this.stop(false);
      if (this.selectedStationId) this.send({ type: 'interact', station: this.selectedStationId });
    });
    window.addEventListener('blur', () => this.stop());
    window.addEventListener('resize', () => this.stop());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
    });
    setInterval(() => this.tick(), 80);
  }
  private usable() {
    const v = this.read();
    return (
      v.enabled &&
      v.state?.phase === 'playing' &&
      v.chef?.connected &&
      !document.hidden &&
      !document.querySelector('dialog[open], .notebook')
    );
  }
  private drag(e: PointerEvent) {
    const rect = this.pad.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.4);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.4);
    const scale = Math.max(1, Math.hypot(x, y));
    this.knob.style.transform = `translate(${(x / scale) * 28}px, ${(y / scale) * 28}px)`;
    this.direction = stickDirection(x, y);
    if (!this.direction) this.stopMovement();
  }
  private stopMovement() {
    const { chef } = this.read();
    if (this.lastGoal && chef) {
      const p = chef.path[0] ?? { x: Math.round(chef.x), z: Math.round(chef.z) };
      this.send({ type: 'move', ...p });
    }
    this.lastGoal = null;
  }
  stop(sendStop = true) {
    this.pointer = null;
    this.direction = null;
    this.knob.style.transform = '';
    if (sendStop) this.stopMovement();
    else this.lastGoal = null;
  }
  sync() {
    const { enabled, vi, state, chef } = this.read();
    const visible = enabled && !!state && state.phase !== 'lobby' && state.phase !== 'finished';
    if (!visible) this.stop();
    this.root.hidden = !visible;
    if (visible !== this.visible) {
      this.visible = visible;
      document.body.dataset.joystick = String(visible);
      window.dispatchEvent(new Event('resize'));
    }
    this.pad.setAttribute('aria-label', vi ? 'Cần điều khiển 8 hướng' : 'Eight-direction joystick');
    const station =
      visible && chef && state
        ? nearbyStation(chef, state.stations, this.selectedStationId)
        : undefined;
    this.selectedStationId = station?.id ?? null;
    this.focus(this.selectedStationId);
    this.action.disabled = !station || !this.usable();
    const verb = this.action.querySelector<HTMLElement>('.interact-verb')!;
    const target = this.action.querySelector<HTMLElement>('.interact-station')!;
    verb.textContent =
      station && state && chef
        ? expectedInteraction(chef, station, state, vi)
        : vi
          ? 'Đến gần trạm'
          : 'Move near a station';
    target.textContent = station ? this.name(station) : '';
    this.action.setAttribute(
      'aria-label',
      station ? `${verb.textContent} · ${this.name(station)}` : verb.textContent,
    );
    this.action.dataset.status = state?.event.key === 'invalid' ? 'invalid' : 'ready';
    this.root.dataset.x = String(chef?.x ?? '');
    this.root.dataset.z = String(chef?.z ?? '');
    this.action.dataset.stationTarget = station?.id ?? '';
    document
      .querySelectorAll('.station-nearby')
      .forEach((el) => el.classList.remove('station-nearby'));
    if (visible && station)
      document.getElementById(`label-${station.id}`)?.classList.add('station-nearby');
  }
  private tick() {
    if (!this.usable()) {
      this.stop();
      return;
    }
    if (!this.direction) return;
    const { chef, state, alpha } = this.read();
    if (!chef || !state || chef.path.length) return;
    const now = performance.now();
    if (now - this.lastSent < 220) return;
    const goal = movementTarget(chef, this.direction, state.stations, alpha);
    if (!goal) return;
    this.lastGoal = goal;
    this.lastSent = now;
    this.send({ type: 'move', ...goal });
  }
}
