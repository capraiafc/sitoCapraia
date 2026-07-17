/*
 * ARCHIVIO MODIFICABILE DEL CAPRAIA
 *
 * Questo file contiene solo i dettagli che non sempre sono presenti nel
 * calendario: orario, impianto, arbitro, marcatori, assist, cartellini e
 * stemmi delle squadre. Per aggiornare il sito basta modificare qui i valori
 * tra virgolette e salvare, poi ricaricare index.html nel browser.
 *
 * Chiave della partita: "stagione:giornata". Per playoff/coppe puoi usare un
 * identificatore testuale, ad esempio "2025-26:finale-playoff".
 */
window.CAPRAIA_TEAM_LOGOS = {
  Capraia: {
    src: 'assets/images/capraia-logo.png',
    source: 'Archivio Capraia Football Club'
  },
  // Per aggiungere uno stemma: scarica il file in assets/logos/ e incolla qui il percorso.
  // Esempio: Mezzana: { src: 'assets/logos/mezzana.png', source: 'URL della scheda o canale ufficiale' }
};

window.CAPRAIA_MATCH_DETAILS = {
  '2024-25:14': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'A. Pellegrini' },
      { type: 'Gol Capraia', player: 'S. Fornai' },
      { type: 'Gol Capraia', player: 'L. Boni' }
    ]
  },
  '2024-25:23': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'N. Ciulli' },
      { type: 'Gol Capraia', player: 'A. Pellegrini' }
    ]
  },
  '2024-25:29': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'L. Boni' },
      { type: 'Gol Capraia', player: 'L. Boni' },
      { type: 'Gol Capraia', player: 'A. Pellegrini' },
      { type: 'Gol Capraia', player: 'T. Fornai' }
    ]
  },
  '2025-26:5': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'A. Cioni' }
    ]
  },
  '2025-26:8': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'N. Ciulli' },
      { type: 'Gol Capraia', player: 'A. Cioni' },
      { type: 'Gol Capraia', player: 'A. Pellegrini' },
      { type: 'Gol Capraia', player: 'Grosso' },
      { type: 'Autorete a favore del Capraia', player: 'Non indicato' }
    ]
  },
  '2025-26:13': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'Pagliai' },
      { type: 'Gol Capraia', player: 'M. Allegri' },
      { type: 'Gol Capraia', player: 'G. Rosi' }
    ]
  },
  '2025-26:15': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'Cassandro' }
    ]
  },
  '2025-26:16': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'A. Pellegrini' }
    ]
  },
  '2025-26:17': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'G. Rosi' }
    ]
  },
  '2025-26:19': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'S. Fornai' },
      { type: 'Gol Capraia', player: 'A. Pellegrini' },
      { type: 'Gol Capraia', player: 'N. Ciulli' },
      { type: 'Gol Capraia', player: 'Cassandro' }
    ]
  },
  '2025-26:24': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'A. Pellegrini' },
      { type: 'Gol Capraia', player: 'A. Pellegrini' },
      { type: 'Gol Capraia', player: 'Pagliai' },
      { type: 'Gol Capraia', player: 'Cassandro' }
    ]
  },
  '2025-26:27': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'A. Cioni' },
      { type: 'Gol Capraia', player: 'A. Cioni' }
    ]
  },
  '2025-26:28': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'A. Pellegrini' }
    ]
  },
  '2025-26:29': {
    source: 'https://www.instagram.com/capraiafc/',
    events: [
      { type: 'Gol Capraia', player: 'L. Boni' },
      { type: 'Gol Capraia', player: 'L. Boni' },
      { type: 'Gol Capraia', player: 'A. Cioni' }
    ]
  },
  '2025-26:30': {
    source: 'https://www.tuttocampo.it/2025-26/Toscana/SecondaCategoria/GironeF/Partita/30.1/mezzana-capraia',
    kickoff: 'Domenica 3 maggio 2026 · ore 16:00',
    venue: 'Mezzana Campo Parrocchiale, Prato Mezzana',
    referee: 'G. Panariello',
    halftime: '0 — 0',
    events: [
      { minute: "29' st", type: 'Gol Capraia', player: 'N. Ciulli', assist: 'A. Cioni' },
      { minute: "45' st", type: 'Gol Capraia', player: 'A. Cioni', assist: 'M. Allegri' }
    ]
  }
};
