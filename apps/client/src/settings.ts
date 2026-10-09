import type { Preferences } from './preferences';
import type { Language } from './localization';

export class SettingsPanel {
  private dialog = document.createElement('dialog');
  constructor(
    private change: (patch: Partial<Preferences>) => boolean,
    private preview: () => void,
  ) {
    this.dialog.className = 'settings-dialog';
    this.dialog.setAttribute('aria-labelledby', 'settings-title');
    document.body.append(this.dialog);
    this.dialog.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      const key = input.dataset.preference as keyof Preferences | undefined;
      if (!key) return;
      const value =
        input.type === 'checkbox'
          ? input.checked
          : input.type === 'range'
            ? Number(input.value) / 100
            : input.value;
      const stored = this.change({ [key]: value });
      const output = this.dialog.querySelector(`output[for="${input.id}"]`);
      if (output) output.textContent = `${input.value}%`;
      this.dialog.querySelector<HTMLElement>('.settings-storage')!.hidden = stored;
    });
    this.dialog.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-setting-action]')
        ?.dataset.settingAction;
      if (action === 'close') this.dialog.close();
      if (action === 'preview') this.preview();
    });
  }
  open(value: Preferences, language: Language) {
    const vi = language === 'vi';
    const slider = (key: 'masterVolume' | 'musicVolume' | 'sfxVolume', label: string) =>
      `<label class="settings-slider" for="setting-${key}"><span>${label}</span><output for="setting-${key}">${Math.round(value[key] * 100)}%</output><input id="setting-${key}" data-preference="${key}" type="range" min="0" max="100" value="${Math.round(value[key] * 100)}"></label>`;
    this.dialog.innerHTML = `<header><h2 id="settings-title">${vi ? 'Cài đặt' : 'Settings'}</h2><button data-setting-action="close" aria-label="${vi ? 'Đóng cài đặt' : 'Close settings'}">×</button></header>
      <p>${vi ? 'Lưu trên thiết bị này. Trận đấu vẫn tiếp tục khi mở cài đặt.' : 'Saved on this device. The match continues while settings are open.'}</p>
      <label class="settings-check"><input type="checkbox" data-preference="muted" ${value.muted ? 'checked' : ''}>${vi ? 'Tắt âm thanh' : 'Mute all audio'}</label>
      ${slider('masterVolume', vi ? 'Âm lượng tổng' : 'Master volume')}${slider('musicVolume', vi ? 'Nhạc nền' : 'Music volume')}${slider('sfxVolume', vi ? 'Hiệu ứng âm thanh' : 'Sound effects')}
      <button data-setting-action="preview">${vi ? 'Nghe thử hiệu ứng' : 'Preview sound effect'}</button>
      <label class="settings-quality" for="setting-quality">${vi ? 'Chất lượng đồ họa' : 'Graphics quality'}<select id="setting-quality" data-preference="quality"><option value="standard" ${value.quality === 'standard' ? 'selected' : ''}>${vi ? 'Balanced — cân bằng' : 'Balanced'}</option><option value="low" ${value.quality === 'low' ? 'selected' : ''}>${vi ? 'Nhẹ — tắt bóng đổ' : 'Low — shadows off'}</option><option value="high" ${value.quality === 'high' ? 'selected' : ''}>High</option></select></label>
      <label for="setting-sharpness">Render resolution / Sharpness<select id="setting-sharpness" data-preference="sharpness">${['auto', 'css', 'native'].map((mode) => `<option value="${mode}" ${value.sharpness === mode ? 'selected' : ''}>${mode === 'auto' ? 'Retina balanced' : mode === 'css' ? 'CSS 1x ? reduced sharpness' : 'Retina high (up to 3x)'}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-preference="renderDebug" ${value.renderDebug ? 'checked' : ''}>Render diagnostics (local only)</label>
      <label class="settings-check"><input type="checkbox" data-preference="showAllStationLabels" ${value.showAllStationLabels ? 'checked' : ''}>${vi ? 'Hiá»‡n Ä‘áº§y Ä‘á»§ nhÃ£n thiáº¿t bá»‹' : 'Show all station labels'}</label>
      <label class="settings-check"><input type="checkbox" data-preference="reducedMotion" ${value.reducedMotion ? 'checked' : ''}>${vi ? 'Giảm chuyển động' : 'Reduce motion'}</label>
      <label class="settings-check"><input type="checkbox" data-preference="guidance" ${value.guidance ? 'checked' : ''}>${vi ? 'Gợi ý bước tiếp theo' : 'Next-step guidance'}</label>
      <label for="setting-tapInteraction">${vi ? 'Khi chạm trạm' : 'Station taps'}<select id="setting-tapInteraction" data-preference="tapInteraction"><option value="arrival" ${value.tapInteraction === 'arrival' ? 'selected' : ''}>${vi ? 'Đi tới và thao tác một lần' : 'Walk and act once'}</option><option value="confirm" ${value.tapInteraction === 'confirm' ? 'selected' : ''}>${vi ? 'Đi tới, chạm lại để thao tác' : 'Walk, then tap again'}</option></select></label>
      <label class="settings-quality" for="setting-touchControls">${vi ? 'Điều khiển cảm ứng' : 'Touch controls'}<select id="setting-touchControls" data-preference="touchControls"><option value="tap" ${value.touchControls === 'tap' ? 'selected' : ''}>${vi ? 'Chạm để di chuyển' : 'Tap to move'}</option><option value="joystick" ${value.touchControls === 'joystick' ? 'selected' : ''}>${vi ? 'Joystick + nút tương tác' : 'Joystick + interact button'}</option></select></label>
      <p class="settings-storage" role="status" hidden>${vi ? 'Đã áp dụng, nhưng trình duyệt không cho lưu cài đặt.' : 'Applied, but your browser could not save these settings.'}</p>`;
    this.dialog.showModal();
  }
}
