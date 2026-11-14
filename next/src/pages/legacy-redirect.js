import { redirectHome, sitePath } from '../lib/router.js';

const target = document.body.dataset.redirect || '';
const link = document.getElementById('fallback-link');
if (link) link.href = sitePath(target);

if (target === '') {
  redirectHome(true);
} else {
  window.location.replace(sitePath(target));
}
