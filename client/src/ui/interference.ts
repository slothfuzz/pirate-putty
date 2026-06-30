import { ZONE_COOLDOWN_MS } from '../../../shared/physics';
import type { ZoneEffect } from '../../../shared/types';

// Legend colours straight from the brief.
const EFFECTS: { key: ZoneEffect; label: string; color: string }[] = [
  { key: 'reflect', label: 'Reflect', color: '#ff0000' },
  { key: 'hold', label: 'Hold', color: '#662d91' },
  { key: 'slow', label: 'Slow', color: '#d2408f' },
  { key: 'reset', label: 'Reset', color: '#ffff54' },
];

export function createInterferenceBar(
  container: HTMLElement,
  onInterfere: (effect: ZoneEffect) => void,
): { destroy: () => void } {
  const el = document.createElement('div');
  el.id = 'interference-bar';

  const buttons = new Map<ZoneEffect, HTMLButtonElement>();
  const labels = new Map<ZoneEffect, HTMLElement>();
  const intervals = new Map<ZoneEffect, ReturnType<typeof setInterval>>();

  for (const e of EFFECTS) {
    const btn = document.createElement('button');
    btn.className = 'interfere-btn';
    btn.dataset.key = e.key;
    btn.style.setProperty('--zone-color', e.color);

    const dot = document.createElement('span');
    dot.className = 'interfere-dot';

    const label = document.createElement('span');
    label.className = 'interfere-label';
    label.textContent = e.label;

    btn.append(dot, label);
    btn.addEventListener('click', () => trigger(e.key, e.label));

    el.appendChild(btn);
    buttons.set(e.key, btn);
    labels.set(e.key, label);
  }

  function trigger(key: ZoneEffect, label: string): void {
    const btn = buttons.get(key);
    if (!btn || btn.disabled) return;
    onInterfere(key);
    startCooldown(key, label);
  }

  function startCooldown(key: ZoneEffect, label: string): void {
    const btn = buttons.get(key);
    const labelEl = labels.get(key);
    if (!btn || !labelEl) return;

    btn.disabled = true;
    const endsAt = Date.now() + ZONE_COOLDOWN_MS;

    const update = (): void => {
      const remaining = endsAt - Date.now();
      if (remaining <= 0) {
        const id = intervals.get(key);
        if (id) clearInterval(id);
        intervals.delete(key);
        btn.disabled = false;
        labelEl.textContent = label;
        return;
      }
      labelEl.textContent = `${Math.ceil(remaining / 1000)}s`;
    };

    update();
    const existing = intervals.get(key);
    if (existing) clearInterval(existing);
    intervals.set(key, setInterval(update, 200));
  }

  container.appendChild(el);

  return {
    destroy: (): void => {
      for (const id of intervals.values()) clearInterval(id);
      el.remove();
    },
  };
}
