import { AVATARS } from '../../../shared/avatars';
import type { LobbyState } from '../net/state';

export function createLobbyScreen(
  container: HTMLElement,
  onSetSail: () => void,
): { update: (state: LobbyState) => void; addEvent: (text: string) => void; destroy: () => void } {
  const el = document.createElement('div');
  el.id = 'lobby-screen';
  el.innerHTML = `
    <div class="lobby-inner">
      <h1 class="lobby-title">Crew assemblin'</h1>
      <div class="lobby-code-box">
        <span class="lobby-code-label">Share this code</span>
        <span class="lobby-code" id="lobby-code-display">----</span>
      </div>
      <div class="lobby-players" id="lobby-players"></div>
      <div class="lobby-events" id="lobby-events"></div>
      <button class="btn btn-primary lobby-sail-btn" id="sail-btn" style="display:none">Set sail</button>
      <p class="lobby-wait" id="lobby-wait">Awaitin' more crew...</p>
    </div>
  `;

  container.appendChild(el);

  const codeDisplay = el.querySelector('#lobby-code-display') as HTMLElement;
  const playersList = el.querySelector('#lobby-players') as HTMLElement;
  const eventsDiv = el.querySelector('#lobby-events') as HTMLElement;
  const sailBtn = el.querySelector('#sail-btn') as HTMLButtonElement;
  const waitMsg = el.querySelector('#lobby-wait') as HTMLElement;

  sailBtn.addEventListener('click', onSetSail);

  let prevPlayerIds: string[] = [];

  function update(state: LobbyState): void {
    codeDisplay.textContent = state.code || '----';

    playersList.innerHTML = '';
    for (const p of state.players) {
      const avatar = AVATARS.find((a) => a.id === p.avatarId);
      const color = avatar?.color ?? '#888';
      const row = document.createElement('div');
      row.className = 'lobby-player';
      const hostBadge = p.id === state.hostId ? ' <span class="host-badge">captain</span>' : '';
      row.innerHTML = `
        <span class="avatar-dot" style="background:${color}"></span>
        <span class="player-name">${escapeHtml(p.name)}${hostBadge}</span>
      `;
      playersList.appendChild(row);
    }

    const isHost = state.myId === state.hostId;
    sailBtn.style.display = isHost ? 'block' : 'none';
    waitMsg.style.display = isHost ? 'none' : 'block';
    waitMsg.textContent = isHost ? '' : "Awaitin' the captain's orders...";

    const newIds = state.players.map((p) => p.id);
    for (const p of state.players) {
      if (!prevPlayerIds.includes(p.id)) {
        addEvent(`${p.name} climbed aboard.`);
      }
    }
    for (const oldId of prevPlayerIds) {
      if (!newIds.includes(oldId)) {
        addEvent('A crew member went overboard.');
      }
    }
    prevPlayerIds = newIds;
  }

  function addEvent(text: string): void {
    const line = document.createElement('div');
    line.className = 'lobby-event';
    line.textContent = text;
    eventsDiv.appendChild(line);
    eventsDiv.scrollTop = eventsDiv.scrollHeight;

    if (eventsDiv.children.length > 20) {
      eventsDiv.firstChild?.remove();
    }
  }

  return { update, addEvent, destroy: () => el.remove() };
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
