// Importa esplicitamente l'autenticazione: gli altri moduli non devono
// provare a leggere window.CapraiaAuth prima che sia stata inizializzata.
import './auth.js?v=admin-permissions-20260729';

const byId = (id) => document.getElementById(id);
let authCheckVersion = 0;
const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
const debugPanel = byId('admin-debug-panel');
const debugOutput = document.querySelector('[data-admin-debug-output]');
const debugEntries = [];

function debugStep(label, details = {}) {
  const entry = {
    time: new Date().toISOString(),
    label,
    details,
  };
  debugEntries.push(entry);
  console.info(`[ADMIN DEBUG] ${label}`, details);
  if (debugEnabled && debugPanel && debugOutput) {
    debugPanel.hidden = false;
    debugOutput.textContent = debugEntries
      .map((item, index) => `${index + 1}. ${item.label}\n${JSON.stringify(item.details, null, 2)}`)
      .join('\n\n');
  }
}

function accessSnapshot(access) {
  return {
    email: access?.user?.email || null,
    userIdPresent: Boolean(access?.user?.id),
    isOperator: access?.isOperator === true,
    isSuperUser: access?.isSuperUser === true,
    reason: access?.reason || null,
    permissions: access?.permissions || null,
  };
}

function uiSnapshot() {
  const app = byId('admin-app');
  const shell = byId('admin-auth-shell');
  const denied = byId('admin-auth-denied');
  const signedOut = byId('admin-auth-signed-out');
  return {
    app: { hidden: app?.hidden, display: app ? getComputedStyle(app).display : null },
    authShell: { hidden: shell?.hidden, display: shell ? getComputedStyle(shell).display : null },
    denied: { hidden: denied?.hidden, display: denied ? getComputedStyle(denied).display : null },
    signedOut: { hidden: signedOut?.hidden, display: signedOut ? getComputedStyle(signedOut).display : null },
  };
}

window.CapraiaAdminDebug = {
  getEntries: () => structuredClone(debugEntries),
  getUiState: uiSnapshot,
};

if (debugEnabled) {
  debugPanel.hidden = false;
  document.querySelector('[data-admin-debug-copy]')?.addEventListener('click', async () => {
    const value = debugOutput?.textContent || '';
    await navigator.clipboard.writeText(value);
  });
}

debugStep('Script admin caricato', {
  url: `${window.location.origin}${window.location.pathname}${window.location.search}`,
  authConfigured: window.CapraiaAuth?.configured === true,
  initialUi: uiSnapshot(),
});

const sectionIds = {
  dashboard: 'dashboard', operators: 'operatori', matches: 'gare', players: 'rosa', news: 'news', sponsors: 'sponsor', bacheca: 'bacheca-admin', merch: 'merch',
};

function applyAreaPermissions(access) {
  const permissions = access.permissions || {};
  const permissionKeys = {
    matches: 'can_matches',
    players: 'can_players',
    news: 'can_news',
    sponsors: 'can_sponsors',
    bacheca: 'can_bacheca',
    merch: 'can_merch',
  };
  const allowed = (area) => access.isSuperUser || Boolean(permissionKeys[area] && permissions[permissionKeys[area]]);
  Object.entries(sectionIds).forEach(([area, id]) => {
    const visible = allowed(area);
    const link = document.querySelector(`.admin-sidebar [data-admin-area="${area}"]`);
    const section = byId(id);
    if (link) link.hidden = !visible;
    if (section) section.hidden = !visible;
  });
  document.querySelectorAll('.admin-sidebar [data-admin-area]').forEach((link) => link.classList.remove('active'));
  const firstLink = document.querySelector('.admin-sidebar [data-admin-area]:not([hidden])');
  if (firstLink) firstLink.classList.add('active');
}

async function initialiseAdmin(version) {
  const loading = byId('admin-auth-loading');
  const signedOut = byId('admin-auth-signed-out');
  const denied = byId('admin-auth-denied');
  const authShell = byId('admin-auth-shell');
  const app = byId('admin-app');
  const deniedDetail = document.querySelector('[data-admin-denied-detail]');

  debugStep('Verifica accesso avviata', { version });
  let access = await window.CapraiaAuth.requireOperator();
  debugStep('Risultato prima verifica', { version, currentVersion: authCheckVersion, access: accessSnapshot(access) });
  if (version !== authCheckVersion) return;

  // Dopo un ritorno da Google il browser può completare il ripristino della
  // sessione un istante dopo il primo controllo. Prima di negare l'accesso,
  // verifichiamo quindi una seconda volta senza usare la risposta in cache.
  if (!access.isOperator) {
    debugStep('Prima verifica non autorizzata: avvio controllo senza cache', { version });
    access = await window.CapraiaAuth.getCurrentAccess({ refresh: true });
    debugStep('Risultato controllo senza cache', { version, currentVersion: authCheckVersion, access: accessSnapshot(access) });
  }
  if (version !== authCheckVersion) {
    debugStep('Risultato ignorato perché superato da una verifica più recente', { version, currentVersion: authCheckVersion });
    return;
  }

  loading.hidden = true;
  if (access.isOperator) {
    debugStep('Accesso autorizzato: mostro area admin', { version, access: accessSnapshot(access) });
    app.hidden = false;
    app.removeAttribute('aria-busy');
    authShell.hidden = true;
    authShell.style.display = 'none';
    signedOut.hidden = true;
    denied.hidden = true;
    if (deniedDetail) deniedDetail.hidden = true;
    byId('admin-user-email').textContent = access.user.email;
    applyAreaPermissions(access);
    debugStep('Stato interfaccia dopo autorizzazione', { version, ui: uiSnapshot() });
    try {
      const { error: loginRecordError } = await window.CapraiaAuth.supabase.rpc('record_admin_login');
      if (loginRecordError) {
        console.warn('Registrazione accesso non riuscita.', loginRecordError);
        debugStep('Registrazione statistica del login non riuscita, accesso mantenuto', {
          version,
          message: loginRecordError.message || String(loginRecordError),
        });
      } else {
        debugStep('Registrazione statistica del login completata', { version });
      }
    } catch (loginRecordError) {
      console.warn('Registrazione accesso non riuscita.', loginRecordError);
      debugStep('Errore non bloccante durante la registrazione del login', {
        version,
        message: loginRecordError?.message || String(loginRecordError),
      });
    }
    if (version !== authCheckVersion) {
      debugStep('Completamento accesso ignorato perché è iniziata una verifica più recente', { version, currentVersion: authCheckVersion });
      return;
    }
    const notice = byId('admin-login-notice');
    notice.hidden = false;
    window.setTimeout(() => { notice.hidden = true; }, 4000);
    document.dispatchEvent(new CustomEvent('capraia:operator-ready', { detail: access }));
    return;
  }
  app.hidden = true;
  authShell.hidden = false;
  authShell.style.removeProperty('display');
  if (deniedDetail && access.user?.email) {
    deniedDetail.hidden = false;
    deniedDetail.textContent = `Account rilevato: ${access.user.email} · Stato verifica: ${access.reason || 'non autorizzato'}.`;
  }
  const showSignedOut = access.reason === 'signed-out' || access.reason === 'not-configured';
  signedOut.hidden = !showSignedOut;
  denied.hidden = showSignedOut;
  debugStep('Accesso non autorizzato: mostro schermata di blocco', {
    version,
    access: accessSnapshot(access),
    ui: uiSnapshot(),
  });
}

document.querySelectorAll('[data-admin-signout]').forEach((button) => {
  button.addEventListener('click', async () => {
    await window.CapraiaAuth.signOut();
    window.location.assign('index.html');
  });
});

function startAdminInitialisation() {
  const version = ++authCheckVersion;
  debugStep('Richiesta nuova inizializzazione', { version });
  initialiseAdmin(version).catch((error) => {
    if (version !== authCheckVersion) return;
    console.error('Inizializzazione area operatori non riuscita.', error);
    byId('admin-app').hidden = true;
    byId('admin-auth-shell').hidden = false;
    byId('admin-auth-shell').style.removeProperty('display');
    byId('admin-auth-loading').hidden = true;
    byId('admin-auth-denied').hidden = false;
    debugStep('Errore durante inizializzazione', {
      version,
      message: error?.message || String(error),
      stack: error?.stack || null,
      ui: uiSnapshot(),
    });
  });
}

startAdminInitialisation();

// Rende l'accesso affidabile anche quando Supabase ripristina una sessione
// già salvata dopo il primo rendering della pagina.
window.CapraiaAuth?.supabase?.auth.onAuthStateChange((event) => {
  debugStep('Evento autenticazione Supabase', { event });
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    startAdminInitialisation();
  }
});
