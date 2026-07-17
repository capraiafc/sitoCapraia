const carousel = document.querySelector('[data-player-carousel]');
const previous = document.querySelector('[data-player-prev]');
const next = document.querySelector('[data-player-next]');

if (carousel && previous && next) {
  const track = carousel.querySelector('[data-public-players]');
  let index = 0;
  let direction = 1;
  let timer = null;
  const visibleCards = () => {
    if (window.innerWidth <= 480) return 1;
    if (window.innerWidth <= 720) return 2;
    if (window.innerWidth <= 1024) return 3;
    return 4;
  };
  const maxIndex = () => Math.max(0, track.children.length - visibleCards());
  const render = () => {
    index = Math.min(index, maxIndex());
    track.style.transform = `translateX(-${index * (100 / visibleCards())}%)`;
    previous.disabled = index === 0;
    next.disabled = index === maxIndex();
  };
  const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
  const move = (step) => {
    if (!maxIndex()) return;
    index = Math.max(0, Math.min(maxIndex(), index + step));
    direction = step > 0 ? 1 : -1;
    render();
  };
  const advance = () => {
    if (!maxIndex()) return;
    if (index === maxIndex()) direction = -1;
    if (index === 0) direction = 1;
    index += direction;
    render();
  };
  const start = () => {
    stop();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && maxIndex()) timer = window.setInterval(advance, 4000);
  };
  previous.addEventListener('click', () => { move(-1); start(); });
  next.addEventListener('click', () => { move(1); start(); });
  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', start);
  window.addEventListener('resize', () => { render(); start(); });
  window.CapraiaPlayerCarousel = { refresh() { index = 0; direction = 1; render(); start(); } };
  window.CapraiaPlayerCarousel.refresh();
}
