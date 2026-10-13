/* One shared animation loop for every head on the page. Each subscriber
   gets the seconds since the last frame; the loop sleeps while the tab is
   hidden or nobody is listening. */

type Tick = (dt: number) => void;

/** Where the pointer last was on the page, NaN while it is away. */
export const pointer = { x: NaN, y: NaN };

const subscribers = new Set<Tick>();
let frame = 0;
let last = 0;
let listening = false;

function loop(now: number) {
  frame = 0;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  subscribers.forEach((fn) => fn(dt));
  if (subscribers.size) frame = requestAnimationFrame(loop);
}

function start() {
  if (frame || typeof document === 'undefined' || document.hidden) return;
  last = 0;
  frame = requestAnimationFrame(loop);
}

function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  const away = () => {
    pointer.x = NaN;
    pointer.y = NaN;
  };
  document.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true });
  document.addEventListener('pointerleave', away);
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (subscribers.size) start();
  });
}

export function subscribe(fn: Tick): () => void {
  listen();
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) stop();
  };
}
