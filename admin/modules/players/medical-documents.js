const BUCKET = 'capraia-medical-visits';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const client = () => {
  const supabase = window.CapraiaAuth?.supabase;
  if (!supabase) throw new Error('Client Supabase non disponibile.');
  return supabase;
};

const safeFilename = (value) => String(value || 'visita-medica')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'visita-medica';

export function validateMedicalDocument(file) {
  if (!file) return;
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Carica un file PDF, JPG o PNG.');
  if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error('Il documento non può superare 10 MB.');
}

export async function uploadMedicalDocument(file, playerId) {
  validateMedicalDocument(file);
  if (!playerId) throw new Error('Giocatore non disponibile per il caricamento.');
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${playerId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return {
    path,
    name: safeFilename(file.name),
    mimeType: file.type,
    size: file.size,
  };
}

export async function removeMedicalDocument(path) {
  if (!path) return;
  const { error } = await client().storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function downloadMedicalDocument(path, filename) {
  if (!path) throw new Error('Documento della visita non presente.');
  const { data, error } = await client().storage.from(BUCKET).download(path);
  if (error) throw error;
  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = safeFilename(filename);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
