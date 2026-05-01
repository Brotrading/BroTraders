/**
 * Bro Trading site-wide password gate.
 * Inject on any page by adding:
 *   <script src="/assets/site-lock.js"></script>
 *
 * Forms /giveaway/all and /giveaway/pro stay public (people need to submit
 * to the giveaway). Wheel page has its own separate lock.
 */
(function () {
  const PASSWORD = 'Texas007';
  const UNLOCK_KEY = 'bro-site-unlock';

  // Already unlocked in this browser?
  if (localStorage.getItem(UNLOCK_KEY) === '1') return;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .__bro-lock {
      position: fixed; inset: 0;
      background: radial-gradient(ellipse at top, #0a1c3a 0%, #071426 35%, #020617 100%);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    }
    .__bro-lock-card {
      background: rgba(10, 28, 58, 0.85);
      border: 1px solid rgba(255, 207, 64, 0.3);
      border-radius: 24px;
      padding: 48px 40px;
      text-align: center;
      max-width: 400px; width: 100%;
      box-shadow: 0 0 80px rgba(255, 207, 64, 0.15);
      backdrop-filter: blur(10px);
      color: #e9ecff;
    }
    .__bro-lock-icon {
      width: 64px; height: 64px;
      background: linear-gradient(135deg, #ffcf40, #e0a020);
      border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      color: #1a1305; font-size: 28px;
      margin-bottom: 20px;
      box-shadow: 0 0 40px rgba(255, 207, 64, 0.5);
    }
    .__bro-lock-title {
      font-size: 22px; font-weight: 800;
      margin-bottom: 8px;
    }
    .__bro-lock-sub {
      color: #7a83a8; font-size: 13px;
      margin-bottom: 24px;
    }
    .__bro-lock-input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(2, 6, 23, 0.8);
      border: 1px solid rgba(44, 158, 255, 0.3);
      border-radius: 12px;
      color: #e9ecff; font-size: 16px;
      font-family: inherit;
      text-align: center; letter-spacing: 2px;
      box-sizing: border-box;
    }
    .__bro-lock-input:focus {
      outline: none;
      border-color: #ffcf40;
      box-shadow: 0 0 0 3px rgba(255, 207, 64, 0.15);
    }
    .__bro-lock-input::placeholder { color: #7a83a8; letter-spacing: 1px; }
    .__bro-lock-btn {
      width: 100%;
      padding: 14px 20px;
      background: linear-gradient(135deg, #ffcf40, #e0a020);
      color: #1a1305; border: none; border-radius: 12px;
      font-size: 15px; font-weight: 800;
      margin-top: 12px; cursor: pointer;
      font-family: inherit;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .__bro-lock-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(255, 207, 64, 0.4);
    }
    .__bro-lock-err {
      color: #ff4d6d; font-size: 13px;
      margin-top: 12px; min-height: 18px;
    }
    body.__bro-locked { overflow: hidden !important; }
  `;
  document.head.appendChild(style);

  // Build modal
  const lock = document.createElement('div');
  lock.className = '__bro-lock';
  lock.innerHTML = `
    <div class="__bro-lock-card">
      <div class="__bro-lock-icon">🔒</div>
      <div class="__bro-lock-title">Bro Trading — Private Preview</div>
      <div class="__bro-lock-sub">Enter access code to continue</div>
      <input type="password" class="__bro-lock-input" placeholder="Access code" autofocus />
      <button class="__bro-lock-btn">Unlock</button>
      <div class="__bro-lock-err"></div>
    </div>
  `;

  function attach() {
    document.body.appendChild(lock);
    document.body.classList.add('__bro-locked');
    const input = lock.querySelector('.__bro-lock-input');
    const btn = lock.querySelector('.__bro-lock-btn');
    const err = lock.querySelector('.__bro-lock-err');
    setTimeout(() => input.focus(), 50);

    function tryUnlock() {
      if (input.value.trim() === PASSWORD) {
        localStorage.setItem(UNLOCK_KEY, '1');
        lock.remove();
        document.body.classList.remove('__bro-locked');
      } else {
        err.textContent = 'Incorrect code — try again';
        input.value = '';
        input.focus();
      }
    }
    btn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  }

  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);
})();
