/*
 * Configurazione del modulo tessera. Le domande del nuovo tesserato sono
 * centralizzate in `newMemberFields` per poterle aggiornare facilmente.
 * Ogni campo compare sia nel form sia nel riepilogo inviato alla segreteria.
 */
window.CAPRAIA_MEMBERSHIP_CONFIG = {
  season: '2026/27',
  renewalFields: [
    { name: 'full_name', label: 'Nome e cognome', autocomplete: 'name', required: true },
    { name: 'member_number', label: 'Numero tessera', inputMode: 'numeric', pattern: '[0-9]{1,8}', maxLength: 8, required: true },
    { name: 'member_since', label: 'Socio dal', inputMode: 'numeric', pattern: '[0-9]{4}', maxLength: 4, placeholder: '2023', required: true },
  ],
  newMemberFields: [
    { name: 'first_name', label: 'Nome', autocomplete: 'given-name', required: true },
    { name: 'last_name', label: 'Cognome', autocomplete: 'family-name', required: true },
    { name: 'birth_date', label: 'Data di nascita', type: 'date', autocomplete: 'bday', required: true },
    { name: 'birth_place', label: 'Luogo di nascita', description: 'Città e Provincia', required: true },
    { name: 'nationality', label: 'Nazionalità', autocomplete: 'country-name', required: true },
    { name: 'tax_code', label: 'Codice fiscale', autocomplete: 'off', pattern: '[A-Za-z0-9]{16}', maxLength: 16, required: true },
    { name: 'gender', label: 'Sesso', type: 'radio', options: [{ value: 'Maschio', label: 'Maschio' }, { value: 'Femmina', label: 'Femmina' }], required: true },
    { name: 'residence', label: 'Residenza', description: 'Indirizzo, Città, Provincia, CAP', autocomplete: 'street-address', required: true },
    { name: 'phone', label: 'Telefono', type: 'tel', autocomplete: 'tel', inputMode: 'tel', required: true },
    { name: 'identity_document', label: 'Documento di identità', description: 'Tipo documento e numero', required: true },
    { name: 'identity_document_expiry', label: 'Data scadenza documento', type: 'date', required: true },
  ],
};
