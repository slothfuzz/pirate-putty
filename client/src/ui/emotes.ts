const EMOTE_MAP: Record<string, string> = {
  arr: 'Arrr!',
  yoho: 'Yo ho ho!',
  plank: 'Walk the plank!',
  aye: 'Aye aye!',
  kraken: 'Release the kraken!',
};

export type EmoteKey = 'arr' | 'yoho' | 'plank' | 'aye' | 'kraken';

export function createEmoteBar(
  container: HTMLElement,
  onEmote: (key: EmoteKey) => void,
): { destroy: () => void } {
  const el = document.createElement('div');
  el.id = 'emote-bar';
  el.innerHTML = Object.entries(EMOTE_MAP)
    .map(([key, label]) => `<button class="emote-btn" data-key="${key}">${label}</button>`)
    .join('');

  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.emote-btn') as HTMLElement | null;
    if (!btn) return;
    const key = btn.dataset.key as EmoteKey;
    if (key) onEmote(key);
  });

  container.appendChild(el);

  return {
    destroy: () => el.remove(),
  };
}

export function getEmoteText(key: string): string {
  return EMOTE_MAP[key] ?? key;
}
