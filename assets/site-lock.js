/**
 * Bro Trading "Coming Soon" gate.
 * Inject on any page by adding:
 *   <script src="/assets/site-lock.js"></script>
 *
 * Visitors see a branded "Launching this month" landing.
 * Insiders click "Have an access code?" → enter Texas007 → unlocked for browser.
 *
 * Forms /giveaway/all and /giveaway/pro stay public.
 * Wheel page has its own separate lock.
 */
(function () {
  const PASSWORD = 'Texas007';
  const UNLOCK_KEY = 'bro-site-unlock';

  if (localStorage.getItem(UNLOCK_KEY) === '1') return;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    .__bro-cs {
      position: fixed; inset: 0;
      background:
        radial-gradient(circle at 15% 20%, rgba(44, 158, 255, 0.18) 0%, transparent 35%),
        radial-gradient(circle at 85% 80%, rgba(255, 207, 64, 0.14) 0%, transparent 40%),
        radial-gradient(ellipse at top, #0a1c3a 0%, #071426 35%, #020617 100%);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      overflow-y: auto;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e9ecff;
    }
    .__bro-cs::before {
      content: '';
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(44, 158, 255, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(44, 158, 255, 0.05) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
      pointer-events: none;
    }
    .__bro-cs-inner {
      position: relative;
      max-width: 640px;
      width: 100%;
      text-align: center;
      padding: 48px 24px;
    }
    .__bro-cs-logo {
      width: 112px; height: 112px;
      border-radius: 28px;
      object-fit: cover;
      margin: 0 auto 28px;
      display: block;
      box-shadow: 0 0 60px rgba(44, 158, 255, 0.25), 0 0 120px rgba(255, 207, 64, 0.15);
    }
    .__bro-cs-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255, 207, 64, 0.15);
      border: 1px solid rgba(255, 207, 64, 0.4);
      color: #ffcf40;
      font-size: 11px; font-weight: 700;
      padding: 7px 14px; border-radius: 999px;
      margin-bottom: 20px;
      text-transform: uppercase; letter-spacing: 1.5px;
    }
    .__bro-cs-badge .__pulse {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ffcf40;
      animation: __broPulse 1.6s ease-in-out infinite;
    }
    @keyframes __broPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 207, 64, 0.7); opacity: 1; }
      50%      { box-shadow: 0 0 0 10px rgba(255, 207, 64, 0); opacity: 0.7; }
    }
    .__bro-cs-h1 {
      font-size: clamp(36px, 7vw, 64px);
      font-weight: 900;
      line-height: 1.05;
      margin: 0 0 16px;
      background: linear-gradient(135deg, #fff 0%, #2c9eff 50%, #ffcf40 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      letter-spacing: -1px;
    }
    .__bro-cs-tagline {
      font-size: clamp(16px, 2.4vw, 19px);
      color: #b8c4e0;
      margin: 0 0 32px;
      line-height: 1.5;
      max-width: 480px;
      margin-left: auto; margin-right: auto;
    }
    .__bro-cs-tagline strong { color: #ffcf40; font-weight: 700; }
    .__bro-cs-features {
      display: flex; flex-wrap: wrap;
      justify-content: center; gap: 12px;
      margin-bottom: 36px;
    }
    .__bro-cs-feat {
      background: rgba(44, 158, 255, 0.08);
      border: 1px solid rgba(44, 158, 255, 0.25);
      color: #b8d8ff;
      padding: 8px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 500;
    }
    .__bro-cs-cta-row {
      display: flex; flex-wrap: wrap; gap: 12px;
      justify-content: center;
      margin-bottom: 32px;
    }
    .__bro-cs-cta {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 14px 24px;
      border-radius: 12px;
      font-weight: 700; font-size: 15px;
      text-decoration: none;
      transition: transform 0.15s, box-shadow 0.15s;
      font-family: inherit;
    }
    .__bro-cs-cta-primary {
      background: linear-gradient(135deg, #5865F2, #4752c4);
      color: #fff;
      box-shadow: 0 8px 24px rgba(88, 101, 242, 0.4);
    }
    .__bro-cs-cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(88, 101, 242, 0.5);
    }
    .__bro-cs-cta-secondary {
      background: rgba(255, 0, 0, 0.12);
      border: 1px solid rgba(255, 0, 0, 0.4);
      color: #ff5c5c;
    }
    .__bro-cs-cta-secondary:hover {
      background: rgba(255, 0, 0, 0.2);
      transform: translateY(-2px);
    }
    .__bro-cs-access {
      display: inline-block;
      background: none; border: none;
      color: #7a83a8; font-size: 13px;
      cursor: pointer; padding: 8px 14px;
      font-family: inherit;
      transition: color 0.15s;
      text-decoration: underline;
      text-decoration-color: rgba(122, 131, 168, 0.3);
      text-underline-offset: 4px;
    }
    .__bro-cs-access:hover { color: #ffcf40; }
    .__bro-cs-pwbox {
      display: none;
      max-width: 320px;
      margin: 16px auto 0;
    }
    .__bro-cs-pwbox.show { display: block; }
    .__bro-cs-input {
      width: 100%;
      padding: 13px 16px;
      background: rgba(2, 6, 23, 0.8);
      border: 1px solid rgba(44, 158, 255, 0.3);
      border-radius: 10px;
      color: #e9ecff; font-size: 15px;
      font-family: inherit;
      text-align: center; letter-spacing: 2px;
      box-sizing: border-box;
    }
    .__bro-cs-input:focus {
      outline: none;
      border-color: #ffcf40;
      box-shadow: 0 0 0 3px rgba(255, 207, 64, 0.15);
    }
    .__bro-cs-input::placeholder { color: #7a83a8; letter-spacing: 1px; }
    .__bro-cs-pwbtn {
      width: 100%;
      padding: 12px 18px;
      background: linear-gradient(135deg, #ffcf40, #e0a020);
      color: #1a1305; border: none; border-radius: 10px;
      font-size: 14px; font-weight: 800;
      margin-top: 8px; cursor: pointer;
      font-family: inherit;
    }
    .__bro-cs-err {
      color: #ff4d6d; font-size: 12px;
      margin-top: 8px; min-height: 16px;
    }
    body.__bro-locked { overflow: hidden !important; }
    @media (max-width: 480px) {
      .__bro-cs-inner { padding: 32px 16px; }
      .__bro-cs-logo { width: 88px; height: 88px; }
    }
  `;
  document.head.appendChild(style);

  // Build markup
  const lock = document.createElement('div');
  lock.className = '__bro-cs';
  lock.innerHTML = `
    <div class="__bro-cs-inner">
      <img class="__bro-cs-logo" src="/bro-trading-logo.jpeg" alt="Bro Trading" onerror="this.style.display='none'" />
      <div class="__bro-cs-badge"><span class="__pulse"></span> Launching This Month</div>
      <h1 class="__bro-cs-h1">PropFirmBro</h1>
      <p class="__bro-cs-tagline">
        The futures prop firm comparison platform built <strong>by traders, for traders</strong>.
        One place to find the best deals, lowest cost-to-funding and trusted firms — backed by the Bro Trading community.
      </p>
      <div class="__bro-cs-features">
        <span class="__bro-cs-feat">⚡ 11+ firms compared</span>
        <span class="__bro-cs-feat">🎯 Exclusive discount codes</span>
        <span class="__bro-cs-feat">🌍 Country availability filter</span>
        <span class="__bro-cs-feat">💰 True-cost analysis</span>
      </div>
      <div class="__bro-cs-cta-row">
        <a class="__bro-cs-cta __bro-cs-cta-primary" href="https://discord.gg/brotrading" target="_blank" rel="noopener">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          Join the Discord
        </a>
        <a class="__bro-cs-cta __bro-cs-cta-secondary" href="https://m.youtube.com/@Brotradingz" target="_blank" rel="noopener">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          Watch on YouTube
        </a>
      </div>
      <button class="__bro-cs-access" id="__broAccessBtn">Have an access code?</button>
      <div class="__bro-cs-pwbox" id="__broPwBox">
        <input type="password" class="__bro-cs-input" id="__broPwInput" placeholder="Access code" />
        <button class="__bro-cs-pwbtn" id="__broPwBtn">Unlock</button>
        <div class="__bro-cs-err" id="__broPwErr"></div>
      </div>
    </div>
  `;

  function attach() {
    document.body.appendChild(lock);
    document.body.classList.add('__bro-locked');

    const accessBtn = document.getElementById('__broAccessBtn');
    const pwBox = document.getElementById('__broPwBox');
    const input = document.getElementById('__broPwInput');
    const btn = document.getElementById('__broPwBtn');
    const err = document.getElementById('__broPwErr');

    accessBtn.addEventListener('click', () => {
      pwBox.classList.add('show');
      accessBtn.style.display = 'none';
      setTimeout(() => input.focus(), 50);
    });

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
