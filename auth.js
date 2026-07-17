import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const config = {
  url: window.CAPRAIA_SUPABASE_URL,
  anonKey: window.CAPRAIA_SUPABASE_ANON_KEY,
};

const configured = Boolean(
  config.url
  && config.anonKey
  && !config.url.includes('YOUR_PROJECT_REF')
  && !config.anonKey.includes('YOUR_SUPABASE'),
);

const unavailable = {
  user: null,
  isOperator: false,
  reason: 'not-configured',
};

const fail = (message) => {
  const target = document.querySelector('[data-auth-message]');
  if (target) {
    target.hidden = false;
    target.textContent = message;
  }
};

let supabase = null;
let accessPromise = null;

if (configured) {
  supabase = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getCurrentAccess({ refresh = false } = {}) {
  if (!supabase) return unavailable;
  if (!refresh && accessPromise) return accessPromise;

  accessPromise = (async () => {
    const session = await getSession();
    if (!session?.user) return { user: null, isOperator: false, reason: 'signed-out' };

    const { data, error } = await supabase.rpc('is_current_operator');
    if (error) {
      console.error('Impossibile verificare il ruolo operatore.', error);
      return { user: session.user, isOperator: false, reason: 'verification-error' };
    }

    return {
      user: session.user,
      isOperator: data === true,
      reason: data === true ? null : 'not-authorized',
    };
  })();

  return accessPromise;
}

async function requireOperator() {
  const access = await getCurrentAccess();
  if (access.reason === 'not-configured') {
    fail('Area operatori non ancora configurata.');
  } else if (access.reason === 'signed-out') {
    fail('Accedi con il tuo account Google per continuare.');
  } else if (!access.isOperator) {
    fail('Accesso negato: il tuo account Google non è autorizzato come operatore.');
  }
  return access;
}

async function signInWithGoogle() {
  if (!supabase) {
    fail('Google Authentication non è ancora configurata.');
    return { error: new Error('Supabase non configurato') };
  }

  const redirectTo = new URL('admin.html', window.location.href).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) {
    console.error('Avvio Google login non riuscito.', error);
    fail('Non è stato possibile avviare l’accesso con Google. Riprova.');
  }
  return { error };
}

async function signOut() {
  if (!supabase) return { error: null };
  const response = await supabase.auth.signOut();
  accessPromise = null;
  return response;
}

// Contratto condiviso per i moduli dell'area admin.
window.CapraiaAuth = {
  supabase,
  configured,
  getSession,
  getCurrentAccess,
  requireOperator,
  signInWithGoogle,
  signOut,
};

document.querySelectorAll('[data-operator-login]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    signInWithGoogle();
  });
});

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    accessPromise = null;
  });
}
