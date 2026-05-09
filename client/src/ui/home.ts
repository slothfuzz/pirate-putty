import { AVATARS } from '../../../shared/avatars';

export interface HomeResult {
  action: 'create' | 'join';
  playerName: string;
  avatarId: number;
  lobbyCode: string;
}

export function createHomeScreen(
  container: HTMLElement,
  onSubmit: (result: HomeResult) => void,
): { destroy: () => void } {
  let selectedAvatar = 0;

  const el = document.createElement('div');
  el.id = 'home-screen';
  el.innerHTML = `
    <div class="home-inner">
      <h1 class="home-title">Pirate Putt</h1>
      <p class="home-subtitle">"Putt with intention, not attachment."</p>

      <div class="home-section">
        <label class="home-label" for="player-name">Yer name, sailor</label>
        <input type="text" id="player-name" class="home-input" maxlength="20" placeholder="Captain Anonymous" autocomplete="off" />
      </div>

      <div class="home-section">
        <label class="home-label">Choose yer crew member</label>
        <div class="avatar-grid" id="avatar-grid"></div>
      </div>

      <div class="home-actions">
        <button class="btn btn-primary" id="create-btn">Hoist new colors</button>
        <div class="home-divider">or join a crew</div>
        <div class="join-row">
          <input type="text" id="lobby-code" class="home-input code-input" maxlength="6" placeholder="KRKN42" autocomplete="off" />
          <button class="btn btn-secondary" id="join-btn">Board</button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(el);

  const grid = el.querySelector('#avatar-grid') as HTMLElement;
  AVATARS.forEach((avatar) => {
    const btn = document.createElement('button');
    btn.className = `avatar-btn${avatar.id === selectedAvatar ? ' selected' : ''}`;
    btn.dataset.id = String(avatar.id);
    btn.innerHTML = `
      <span class="avatar-dot" style="background:${avatar.color}"></span>
      <span class="avatar-name">${avatar.name}</span>
    `;
    btn.addEventListener('click', () => {
      selectedAvatar = avatar.id;
      grid.querySelectorAll('.avatar-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    grid.appendChild(btn);
  });

  const nameInput = el.querySelector('#player-name') as HTMLInputElement;
  const codeInput = el.querySelector('#lobby-code') as HTMLInputElement;

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const getName = () => nameInput.value.trim() || 'Pirate';

  el.querySelector('#create-btn')!.addEventListener('click', () => {
    onSubmit({ action: 'create', playerName: getName(), avatarId: selectedAvatar, lobbyCode: '' });
  });

  el.querySelector('#join-btn')!.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 4) return;
    onSubmit({ action: 'join', playerName: getName(), avatarId: selectedAvatar, lobbyCode: code });
  });

  return {
    destroy: () => {
      el.remove();
    },
  };
}
