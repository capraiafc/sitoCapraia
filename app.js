const $ = (selector) => document.querySelector(selector);

const newsDialog = $('#news-dialog');
if (newsDialog) {
  newsDialog.querySelector('[data-close-news]').addEventListener('click', () => newsDialog.close());
  newsDialog.addEventListener('click', (event) => { if (event.target === newsDialog) newsDialog.close(); });
}

const clubDialog = $('#club-dialog');
if (clubDialog) {
  document.querySelectorAll('[data-open-club]').forEach((button) => button.addEventListener('click', () => { if (!clubDialog.open) clubDialog.showModal(); }));
  clubDialog.querySelector('[data-close-club]').addEventListener('click', () => { if (clubDialog.open) clubDialog.close(); });
  clubDialog.addEventListener('click', (event) => { if (event.target === clubDialog) clubDialog.close(); });
}

const toast = (message) => {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 3500);
};

const menuButton = $('.menu-toggle');
const nav = $('#main-nav');
menuButton.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  nav.classList.toggle('open');
});
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menuButton.setAttribute('aria-expanded', 'false');
  nav.classList.remove('open');
}));

document.querySelectorAll('[data-toast]').forEach((element) => element.addEventListener('click', (event) => {
  if (element.tagName === 'A') event.preventDefault();
  toast(element.dataset.toast);
}));

const legacyFanForm = $('#fan-form');
if (legacyFanForm) {
  legacyFanForm.addEventListener('submit', (event) => {
    event.preventDefault();
    toast('Grazie! La tua richiesta è stata inviata alla segreteria.');
    event.currentTarget.reset();
  });
}

const message = $('#comment-form textarea');
message.addEventListener('input', () => $('#char-count').textContent = `${message.value.length} / 280`);
$('#comment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const text = message.value.trim();
  const displayName = form.elements.display_name.value.trim();
  if (!text || !displayName) return;
  button.disabled = true;
  try {
    const client = window.CapraiaAuth?.supabase;
    if (!client) throw new Error('La bacheca non è disponibile in questo momento.');
    const { error } = await client.from('bacheca_messages').insert({ display_name: displayName, message: text });
    if (error) throw error;
    toast('Messaggio ricevuto: sarà pubblicato dopo la moderazione.');
    form.reset();
    $('#char-count').textContent = '0 / 280';
  } catch (error) {
    toast(error.message || 'Non è stato possibile inviare il messaggio. Riprova più tardi.');
  } finally {
    button.disabled = false;
  }
});

$('#newsletter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  toast('Iscrizione ricevuta. Ti aspettiamo a bordo campo!');
  event.currentTarget.reset();
});
