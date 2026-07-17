// Importa esplicitamente l'autenticazione: gli altri moduli non devono
// provare a leggere window.CapraiaAuth prima che sia stata inizializzata.
import './auth.js';

const byId = (id) => document.getElementById(id);

async function initialiseAdmin() {
  const loading = byId('admin-auth-loading');
  const signedOut = byId('admin-auth-signed-out');
  const denied = byId('admin-auth-denied');
  const authShell = byId('admin-auth-shell');
  const app = byId('admin-app');
  const access = await window.CapraiaAuth.requireOperator();
  loading.hidden = true;
  if (access.isOperator) {
    app.hidden = false;
    app.removeAttribute('aria-busy');
    authShell.hidden = true;
    byId('admin-user-email').textContent = access.user.email;
    const notice = byId('admin-login-notice');
    notice.hidden = false;
    window.setTimeout(() => { notice.hidden = true; }, 4000);
    document.dispatchEvent(new CustomEvent('capraia:operator-ready', { detail: access }));
    return;
  }
  app.hidden = true;
  authShell.hidden = false;
  if (access.reason === 'signed-out' || access.reason === 'not-configured') signedOut.hidden = false;
  else denied.hidden = false;
}

document.querySelectorAll('[data-admin-signout]').forEach((button) => {
  button.addEventListener('click', async () => {
    await window.CapraiaAuth.signOut();
    window.location.assign('index.html');
  });
});

initialiseAdmin().catch((error) => {
  console.error('Inizializzazione area operatori non riuscita.', error);
  byId('admin-app').hidden = true;
  byId('admin-auth-shell').hidden = false;
  byId('admin-auth-loading').hidden = true;
  byId('admin-auth-denied').hidden = false;
});
