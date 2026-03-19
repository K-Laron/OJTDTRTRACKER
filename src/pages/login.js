import { store } from '../store.js';
import { toast, ICONS } from '../utils.js';

let isLoginMode = true;
let isPasswordVisible = false;

export function render() {
  return `
    <div class="auth-page">
      <div class="auth-bg-animation"></div>
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo">${ICONS.clock}</div>
          <h2>${isLoginMode ? 'Welcome Back' : 'Create Account'}</h2>
          <p>${isLoginMode ? 'Sign in to your records' : 'Join your classmates today'}</p>
        </div>

        <form id="auth-form">
          <div class="auth-input-group">
            <label>Username</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon">${ICONS.user}</span>
              <input type="text" id="auth-user" placeholder="Enter your username" required autocomplete="username" />
            </div>
          </div>
          
          <div class="auth-input-group">
            <label>Password</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon">${ICONS.lock}</span>
              <input type="${isPasswordVisible ? 'text' : 'password'}" id="auth-pass" placeholder="••••••••" required autocomplete="${isLoginMode ? 'current-password' : 'new-password'}" />
              <button type="button" class="auth-password-toggle" id="toggle-pass" title="Toggle password visibility">
                ${isPasswordVisible ? ICONS.eyeOff : ICONS.eye}
              </button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary auth-btn-primary" id="auth-submit">
            ${isLoginMode ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        
        <div class="auth-footer">
          <p>
            ${isLoginMode ? "Don't have an account?" : "Already have an account?"}
            <span class="auth-mode-switch" id="switch-mode">
              ${isLoginMode ? 'Register' : 'Sign In'}
            </span>
          </p>
        </div>
      </div>
    </div>
  `;
}

export function mount() {
  const form = document.getElementById('auth-form');
  const switchBtn = document.getElementById('switch-mode');
  const togglePassBtn = document.getElementById('toggle-pass');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const submitBtn = document.getElementById('auth-submit');

    if (!user || !pass) {
      toast('Please enter both username and password.', 'error');
      return;
    }

    // Add loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="pulse-dot" style="margin: 0 auto;"></span>';

    try {
      if (isLoginMode) {
        await store.login(user, pass);
        toast('Welcome back!', 'success');
      } else {
        await store.register(user, pass);
        toast('Account created successfully!', 'success');
      }
    } catch (err) {
      toast(err.message || 'Authentication failed', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  switchBtn?.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    // We re-render the whole page via main.js hashchange or just re-render directly
    // For simplicity, we trigger a re-render of the specific app content
    document.dispatchEvent(new CustomEvent('render-auth'));
  });

  togglePassBtn?.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    document.dispatchEvent(new CustomEvent('render-auth'));
  });
}
