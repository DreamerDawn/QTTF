import { mountShell, setPageTitle } from '../components/layout.js';
import { loadingState, setError } from '../components/status.js';
import { el } from '../lib/dom.js';
import { sitePath } from '../lib/router.js';
import {
  homeSlides,
  latestSnapshot,
  loadHomeData,
  seedsFromRankings,
  site,
} from '../lib/data.js';

function card({ title, accent, body, actions, label }) {
  return el('article', { class: `card feature-card feature-card--${accent}`, 'aria-label': label || title }, [
    el('div', { class: 'feature-card__body' }, [
      el('h2', { class: 'card__title', text: title }),
      el('div', { class: 'card__body mt-2' }, body),
    ]),
    el('div', { class: 'card__footer' }, actions),
  ]);
}

function renderHome(data, container) {
  const { events, leagues, rankings } = data;
  const slides = homeSlides();
  const latest = latestSnapshot(rankings);
  const seeds = seedsFromRankings(rankings, site.home.seedCount || 8);
  const qttcEvent = events.events.find((event) => event.id === 'qttc-2025');
  const zgcupEvent = events.events.find((event) => event.id === 'zgcup-2024');
  const qsl = leagues.leagues.find((league) => league.shortName === 'QSL');

  const carousel = el('section', {
    class: 'hero-carousel',
    'aria-roledescription': 'carousel',
    'aria-label': '首页轮播',
  });
  const track = el('div', { class: 'carousel__track' });
  slides.forEach((slide, index) => {
    const article = el('article', {
      class: `carousel__slide hero--${slide.theme || 'navy'}${index === 0 ? ' is-active' : ''}`,
      'aria-hidden': index === 0 ? 'false' : 'true',
      'aria-label': `${index + 1} / ${slides.length}`,
    });
    article.append(
      el('span', { class: 'carousel__eyebrow', text: 'QTTF 赛事与排名' }),
      el('h2', { class: 'carousel__title', text: slide.title }),
      el('p', { class: 'carousel__desc', text: slide.description }),
      el('div', { class: 'carousel__actions' }, [
        el('a', { class: 'btn', href: sitePath(slide.path), text: '了解更多' }),
      ]),
    );
    track.append(article);
  });

  const prev = el('button', {
    class: 'btn btn--icon',
    type: 'button',
    'aria-label': '上一张',
    text: '‹',
  });
  const next = el('button', {
    class: 'btn btn--icon',
    type: 'button',
    'aria-label': '下一张',
    text: '›',
  });
  const dots = el('div', { class: 'carousel__dots' });
  const dotButtons = slides.map((slide, index) =>
    el('button', {
      class: 'carousel__dot',
      type: 'button',
      'aria-label': `显示第 ${index + 1} 张：${slide.title}`,
      'aria-current': index === 0 ? 'true' : 'false',
    }),
  );
  dotButtons.forEach((dot) => dots.append(dot));
  const controls = el('div', { class: 'carousel__controls' }, [prev, next, dots]);
  carousel.append(track, controls);

  let current = 0;
  let timer = null;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const show = (index) => {
    current = (index + slides.length) % slides.length;
    Array.from(track.children).forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    dotButtons.forEach((dot, dotIndex) => {
      dot.setAttribute('aria-current', dotIndex === current ? 'true' : 'false');
    });
  };
  const start = () => {
    if (media.matches) return;
    stop();
    timer = window.setInterval(() => show(current + 1), 8000);
  };
  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };
  prev.addEventListener('click', () => {
    show(current - 1);
    start();
  });
  next.addEventListener('click', () => {
    show(current + 1);
    start();
  });
  dotButtons.forEach((dot, index) =>
    dot.addEventListener('click', () => {
      show(index);
      start();
    }),
  );
  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', start);
  start();

  const eventItems = [qttcEvent, zgcupEvent].filter(Boolean).map((event) => {
    const group = events.groups.find((item) => item.id === event.group);
    return el('div', { class: 'event-mini' }, [
      el('a', {
        class: 'event-mini__title',
        href: sitePath(event.route),
        text: event.meta.name,
      }),
      el('p', {
        class: 'event-mini__desc',
        text: event.status === 'coming-soon' ? '档案整理中，稍后开放完整赛果。' : group?.description,
      }),
    ]);
  });

  const featureWho = card({
    title: '我们是谁',
    accent: 'blue',
    label: '我们是谁',
    body: el('p', { text: site.about.intro }),
    actions: el('a', { class: 'btn', href: sitePath('about/'), text: '了解协会' }),
  });

  const featureEvents = card({
    title: '赛事分类',
    accent: 'cyan',
    label: '赛事分类',
    body: el('div', { class: 'event-mini-list' }, eventItems),
    actions: el('a', { class: 'btn', href: sitePath('events/'), text: '查看全部赛事' }),
  });

  const seedList = el('div', { class: 'seed-list' });
  if (seeds.length) {
    seeds.forEach((seed) => {
      seedList.append(
        el('div', { class: 'seed-row' }, [
          el('span', { class: 'seed-row__rank', text: String(seed.rank) }),
          el('span', { class: 'seed-row__points', text: String(seed.points ?? '—') }),
          el('span', { class: 'seed-row__name', text: seed.name }),
        ]),
      );
    });
  } else {
    seedList.append(el('p', { class: 'muted', text: '暂无排名数据。' }));
  }

  const featureSeeds = card({
    title: '种子选手',
    accent: 'green',
    label: '种子选手',
    body: el('div', {}, [
      el('p', { class: 'muted', text: latest ? `来自 ${latest.label} 全性别组排名前 ${seeds.length} 名。` : '排名数据待更新。' }),
      seedList,
    ]),
    actions: el('a', { class: 'btn', href: sitePath('rankings/'), text: '查看完整排名' }),
  });

  const featureContact = card({
    title: '联系我们',
    accent: 'amber',
    label: '联系我们',
    body: el('div', {}, [
      el('p', { text: site.contact.note }),
      el('div', { class: 'contact-lines' }, [
        el('div', {}, [
          el('span', { text: '邮箱：' }),
          el('a', { href: `mailto:${site.contact.email}`, text: site.contact.email }),
        ]),
        el('div', {}, [
          el('span', { text: 'B站：' }),
          el('a', {
            href: site.contact.bilibili,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: site.contact.bilibiliLabel,
          }),
        ]),
      ]),
    ]),
    actions: el('a', { class: 'btn', href: sitePath('contact/'), text: '联系方式' }),
  });

  const features = el('section', { class: 'home-features', 'aria-label': 'QTTF 导览' }, [
    featureWho,
    featureEvents,
    featureSeeds,
    featureContact,
  ]);

  const intro = el('section', { class: 'section', 'aria-label': '当前赛季' }, [
    el('div', { class: 'section__header' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Season 2025–26' }),
        el('h2', { class: 'section__title', text: '赛季进行中' }),
      ]),
      el('p', {
        class: 'section__hint',
        text: qsl ? `${qsl.round} · 更新于 ${qsl.lastUpdated}` : '联赛数据待更新',
      }),
    ]),
    el('div', { class: 'grid grid--two' }, [
      el('a', { class: 'card card--interactive', href: sitePath('events/league/qsl/') }, [
        el('p', { class: 'eyebrow', text: 'QSL · 顶级联赛' }),
        el('h3', { class: 'card__title mt-2', text: '丘超联赛积分榜' }),
        el('p', { class: 'card__body mt-2', text: '查看最新排名、区域标注与最近战绩。' }),
      ]),
      el('a', { class: 'card card--interactive', href: sitePath('events/league/qcl/') }, [
        el('p', { class: 'eyebrow', text: 'QCL · 次级联赛' }),
        el('h3', { class: 'card__title mt-2', text: '丘冠联赛积分榜' }),
        el('p', { class: 'card__body mt-2', text: '升级附加赛区与升降级形势一目了然。' }),
      ]),
    ]),
  ]);

  setPageTitle('首页');
  container.replaceChildren(
    el('h1', { class: 'visually-hidden', text: `${site.site.name} · ${site.site.fullName}` }),
    carousel,
    features,
    intro,
  );
}

async function main() {
  const { container } = mountShell({ activePath: '' });
  container.replaceChildren(loadingState('正在加载首页…'));
  try {
    const data = await loadHomeData();
    renderHome(data, container);
  } catch (error) {
    setError(container, error);
  }
}

main();
