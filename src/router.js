class Router {
  constructor() {
    this.routes = {};
    this.current = null;
    window.addEventListener('hashchange', () => this.resolve());
  }
  on(path, handler) { this.routes[path] = handler; return this; }
  resolve() {
    const hash = window.location.hash.slice(1) || '/';
    const route = this.routes[hash];
    if (route) { this.current = hash; route(); }
    else this.navigate('/');
  }
  navigate(path) { window.location.hash = path; }
}
export const router = new Router();
