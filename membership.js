const membershipConfig = window.CAPRAIA_MEMBERSHIP_CONFIG || { season: '2026/27', renewalFields: [], newMemberFields: [] };
const membershipForm = document.querySelector('[data-membership-form]');

if (membershipForm) {
  const typeButtons = [...document.querySelectorAll('[data-membership-type]')];
  const fieldsRoot = membershipForm.querySelector('[data-membership-fields]');
  const preview = document.querySelector('[data-membership-preview]');
  const cardFieldsRoot = preview.querySelector('[data-membership-card-fields]');
  const front = document.querySelector('[data-membership-front]');
  const commonEmailField = membershipForm.querySelector('[data-membership-email-field]');
  const commonEmailInput = commonEmailField.querySelector('input');
  const feedback = membershipForm.querySelector('[data-membership-feedback]');
  const submit = membershipForm.querySelector('button[type="submit"]');
  const requestTypeInput = membershipForm.querySelector('[name="request_type"]');
  let requestType = 'renewal';
  let submissionId = crypto.randomUUID();

  const setFeedback = (message = '', status = '') => {
    feedback.textContent = message;
    feedback.dataset.state = status;
    feedback.hidden = !message;
  };

  const currentFields = () => requestType === 'renewal'
    ? membershipConfig.renewalFields
    : membershipConfig.newMemberFields;

  const renderFields = () => {
    fieldsRoot.replaceChildren();
    cardFieldsRoot.replaceChildren();
    const isRenewal = requestType === 'renewal';
    currentFields().forEach((field) => {
      if (field.type === 'radio') {
        const group = document.createElement('fieldset');
        group.className = 'membership-radio';
        const legend = document.createElement('legend');
        legend.textContent = field.label;
        group.append(legend);
        field.options.forEach((option, index) => {
          const optionLabel = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'radio'; input.name = field.name; input.value = option.value;
          input.required = field.required !== false && index === 0;
          optionLabel.append(input, document.createTextNode(option.label));
          group.append(optionLabel);
        });
        fieldsRoot.append(group);
        return;
      }
      const label = document.createElement('label');
      label.className = isRenewal ? `membership-card__field membership-card__field--${field.name}` : `membership-field membership-field--${field.name}`;
      if (isRenewal) {
        const accessibleLabel = document.createElement('span');
        accessibleLabel.className = 'sr-only';
        accessibleLabel.textContent = field.label;
        label.append(accessibleLabel);
      } else {
        label.append(document.createTextNode(field.label));
      }
      if (!isRenewal && field.description) {
        const description = document.createElement('small');
        description.textContent = field.description;
        label.append(description);
      }
      const input = document.createElement('input');
      input.name = field.name;
      input.required = field.required !== false;
      input.type = field.type || 'text';
      input.autocomplete = field.autocomplete || 'off';
      if (field.inputMode) input.inputMode = field.inputMode;
      if (field.pattern) input.pattern = field.pattern;
      if (field.placeholder) input.placeholder = field.placeholder;
      input.maxLength = field.maxLength || 120;
      label.append(input);
      (isRenewal ? cardFieldsRoot : fieldsRoot).append(label);
    });
  };

  const valueFor = (name) => membershipForm.elements.namedItem(name)?.value.trim() || '';

  const setRequestType = (type) => {
    requestType = type;
    requestTypeInput.value = type;
    typeButtons.forEach((button) => {
      const active = button.dataset.membershipType === type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    preview.hidden = type !== 'renewal';
    front.hidden = type !== 'renewal';
    membershipForm.classList.toggle('is-new-member', type === 'new_member');
    commonEmailField.hidden = type === 'new_member';
    commonEmailInput.disabled = type === 'new_member';
    renderFields();
    setFeedback();
  };

  typeButtons.forEach((button) => button.addEventListener('click', () => setRequestType(button.dataset.membershipType)));

  membershipForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!membershipForm.reportValidity()) return;
    if (membershipForm.elements.namedItem('website').value) return;

    const values = Object.fromEntries(currentFields().map((field) => [field.name, valueFor(field.name)]));
    const payload = {
      requestType,
      email: valueFor('email'),
      privacyAccepted: membershipForm.elements.namedItem('privacy').checked,
      fields: values,
      fieldLabels: Object.fromEntries(currentFields().map((field) => [field.name, field.label])),
      submissionId,
      cardSummary: requestType === 'renewal'
        ? { name: values.full_name, memberNumber: values.member_number, memberSince: values.member_since, season: membershipConfig.season }
        : null,
    };

    submit.disabled = true;
    membershipForm.setAttribute('aria-busy', 'true');
    setFeedback('Invio della richiesta in corso…', 'loading');
    try {
      const response = await fetch(`${window.CAPRAIA_SUPABASE_URL}/functions/v1/send-membership-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: window.CAPRAIA_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.CAPRAIA_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Non è stato possibile inviare la richiesta. Riprova tra poco.');
      membershipForm.reset();
      submissionId = crypto.randomUUID();
      setFeedback('Richiesta inviata con successo. La segreteria ti contatterà via email.', 'success');
    } catch (error) {
      setFeedback(error.message || 'Invio non riuscito. Controlla i dati e riprova.', 'error');
    } finally {
      submit.disabled = false;
      membershipForm.removeAttribute('aria-busy');
    }
  });

  setRequestType('renewal');
}
