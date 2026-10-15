let isTransitioning = false;

export function calculateTransitionOrigin(trigger, viewport = null) {
  const width = viewport?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const height = viewport?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 768);

  let x = width / 2;
  let y = height / 2;

  if (trigger) {
    if (typeof trigger.clientX === 'number' && (trigger.clientX !== 0 || trigger.clientY !== 0)) {
      x = trigger.clientX;
      y = trigger.clientY;
    } else {
      const el = trigger.currentTarget || trigger.target || (typeof trigger.getBoundingClientRect === 'function' ? trigger : null);
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
    }
  }

  const maxDx = Math.max(x, width - x);
  const maxDy = Math.max(y, height - y);
  const endRadius = Math.ceil(Math.hypot(maxDx, maxDy));

  return { x, y, endRadius };
}

export async function animateThemeTransition(updateFn, trigger) {
  if (
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function' ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  ) {
    await updateFn();
    return;
  }

  const { x, y, endRadius } = calculateTransitionOrigin(trigger);

  const transition = document.startViewTransition(async () => {
    await updateFn();
  });

  try {
    await transition.ready;
    const animation = document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 450,
        easing: 'ease-out',
        pseudoElement: '::view-transition-new(root)',
      }
    );
    await animation.finished;
  } catch {
    // Graceful fallback if animation is interrupted or pseudo-element animate is not supported
  }

  return await transition.finished.catch(() => {});
}

export async function switchThemeWithTransition(store, nextTheme, trigger, onDomChange = null) {
  if (!store || store.state?.theme === nextTheme) return;
  if (isTransitioning) return;
  isTransitioning = true;

  const previousTheme = store.state?.theme;

  try {
    await animateThemeTransition(() => {
      if (store.state) {
        store.state.theme = nextTheme;
      }
      if (typeof document !== 'undefined' && document.body) {
        document.body.className = nextTheme === 'light' ? 'light-theme' : '';
      }
      if (typeof onDomChange === 'function') {
        onDomChange(nextTheme);
      }
    }, trigger);

    if (typeof store.setTheme === 'function') {
      await store.setTheme(nextTheme);
    }
  } catch (err) {
    if (store.state) {
      store.state.theme = previousTheme;
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.className = previousTheme === 'light' ? 'light-theme' : '';
    }
    if (typeof onDomChange === 'function') {
      onDomChange(previousTheme);
    }
    throw err;
  } finally {
    isTransitioning = false;
  }
}
