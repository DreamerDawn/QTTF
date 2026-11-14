import { sitePath } from '../lib/router.js';
import { el } from '../lib/dom.js';

export function createFooter(site) {
  const footer = el('footer', { class: 'site-footer' });
  const container = el('div', { class: 'container site-footer__inner' });
  const brand = el('div', { class: 'site-footer__brand' }, [
    el('img', {
      src: sitePath(site.site.logo),
      alt: '',
      width: '28',
      height: '28',
      style: 'border-radius:6px',
    }),
    el('span', { text: `${site.site.name} · ${site.site.fullName}` }),
  ]);

  const socials = el('div', { class: 'site-footer__socials', 'aria-label': '联系方式' });
  socials.append(
    el('a', {
      class: 'site-footer__social',
      href: `mailto:${site.contact.email}`,
      text: `✉ ${site.contact.email}`,
    }),
    el('a', {
      class: 'site-footer__social',
      href: site.contact.bilibili,
      target: '_blank',
      rel: 'noopener noreferrer',
      text: `B站 ${site.contact.bilibiliLabel}`,
    }),
  );

  const note = el('div', { class: 'site-footer__note' }, [
    el('div', { text: site.site.footer }),
    el('div', { class: 'mt-2', text: '静态部署于 GitHub Pages' }),
  ]);

  container.append(brand, socials, note);
  footer.append(container);
  return footer;
}
