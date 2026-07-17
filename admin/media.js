const BUCKET = 'capraia-media';
const MAX_IMAGE_SIZE = 6 * 1024 * 1024;

const client = () => {
  const supabase = window.CapraiaAuth?.supabase;
  if (!supabase) throw new Error('Client Supabase non disponibile.');
  return supabase;
};

export function addImageUploadFields(form, { urlField, pathField = 'image_path' }) {
  if (form.elements.image_file) return;
  const urlInput = form.elements[urlField];
  if (!urlInput) return;
  const path = document.createElement('input'); path.type = 'hidden'; path.name = pathField;
  const upload = document.createElement('label'); upload.textContent = 'Carica immagine';
  const file = document.createElement('input'); file.name = 'image_file'; file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp,image/gif'; upload.append(file);
  const remove = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.name = 'remove_image'; checkbox.type = 'checkbox'; remove.append(checkbox, ' Rimuovi immagine');
  (urlInput.closest('label') || urlInput).after(path, upload, remove);
}

export async function uploadImage(file, folder) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Seleziona un file immagine valido.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('L’immagine non può superare 6 MB.');
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = client().storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function removeImage(path) {
  if (!path) return;
  const { error } = await client().storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function resolveImageChange({ form, folder, urlField, pathField = 'image_path' }) {
  const oldPath = form.elements[pathField]?.value || null;
  const file = form.elements.image_file?.files?.[0];
  const remove = form.elements.remove_image?.checked;
  if (remove) return { url: null, path: null, removePath: oldPath };
  if (file) {
    const uploaded = await uploadImage(file, folder);
    return { url: uploaded.url, path: uploaded.path, removePath: oldPath };
  }
  return { url: form.elements[urlField].value.trim() || null, path: oldPath, removePath: null };
}
