import { getSupabaseClient } from "../config/supabaseClient.js";
import { validateImageFile } from "./validation.js";

const BUCKET = "empreendimento-imagens";
const SIGNED_URL_TTL_SECONDS = 300;

export async function createImageSignedUrls(paths) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
    throw new TypeError("Os caminhos das imagens são inválidos.");
  }
  if (paths.length === 0) return [];

  const { data, error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  if (data.some((item) => item.error || !item.signedUrl)) {
    throw new Error("Não foi possível gerar os links temporários das imagens.");
  }

  return data.map(({ path, signedUrl }) => ({ path, signedUrl }));
}

export async function uploadPropertyImage(propertyId, file) {
  const extension = validateImageFile(file);
  const path = `${propertyId}/${crypto.randomUUID()}.${extension}`;
  const client = getSupabaseClient();
  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data: existing, error: existingError } = await client
    .from("empreendimento_imagens")
    .select("id,ordem")
    .eq("empreendimento_id", propertyId)
    .order("ordem", { ascending: false })
    .limit(1);

  if (existingError) {
    const { error: cleanupError } = await client.storage.from(BUCKET).remove([path]);
    if (cleanupError) {
      throw new AggregateError(
        [existingError, cleanupError],
        "Falha ao carregar os metadados; o arquivo também não pôde ser removido.",
      );
    }
    throw existingError;
  }

  const order = (existing[0]?.ordem ?? -1) + 1;
  const { data: image, error: insertError } = await client
    .from("empreendimento_imagens")
    .insert({
      empreendimento_id: propertyId,
      storage_path: path,
      ordem: order,
      is_cover: existing.length === 0,
    })
    .select("id,empreendimento_id,storage_path,ordem,is_cover,created_at")
    .single();

  if (insertError) {
    const { error: cleanupError } = await client.storage.from(BUCKET).remove([path]);
    if (cleanupError) {
      throw new AggregateError(
        [insertError, cleanupError],
        "Falha ao salvar a imagem; o arquivo também não pôde ser removido.",
      );
    }
    throw insertError;
  }

  return image;
}

export async function deletePropertyImage(image) {
  if (!image?.id || !image?.storage_path) {
    throw new TypeError("Os dados da imagem são inválidos.");
  }

  const client = getSupabaseClient();
  const bucket = client.storage.from(BUCKET);
  const { data: backup, error: downloadError } = await bucket.download(image.storage_path);
  if (downloadError) throw downloadError;

  const { error: storageError } = await bucket.remove([image.storage_path]);
  if (storageError) throw storageError;

  const { error: metadataError } = await client
    .from("empreendimento_imagens")
    .delete()
    .eq("id", image.id);

  if (metadataError) {
    const { error: restoreError } = await bucket.upload(image.storage_path, backup, {
      contentType: backup.type,
      upsert: true,
    });
    if (restoreError) {
      throw new AggregateError(
        [metadataError, restoreError],
        "A imagem foi removida do Storage, e não foi possível atualizar os metadados nem restaurar o arquivo.",
      );
    }
    throw new Error(
      `A remoção foi cancelada e o arquivo foi restaurado. ${metadataError.message}`,
    );
  }
}

export async function setPropertyCover(imageId) {
  const { error } = await getSupabaseClient().rpc("set_empreendimento_cover", {
    p_image_id: imageId,
  });
  if (error) throw error;
}

export async function reorderPropertyImages(propertyId, imageIds) {
  const { error } = await getSupabaseClient().rpc("reorder_empreendimento_images", {
    p_empreendimento_id: propertyId,
    p_image_ids: imageIds,
  });
  if (error) throw error;
}

export async function deletePropertyWithImages(propertyId) {
  const client = getSupabaseClient();
  const { data: images, error: listError } = await client
    .from("empreendimento_imagens")
    .select("storage_path")
    .eq("empreendimento_id", propertyId);
  if (listError) throw listError;

  for (let offset = 0; offset < images.length; offset += 100) {
    const paths = images.slice(offset, offset + 100).map((image) => image.storage_path);
    if (paths.length === 0) continue;

    const { error: storageError } = await client.storage.from(BUCKET).remove(paths);
    if (storageError) {
      throw new Error(
        `Não foi possível remover todas as imagens. O empreendimento foi mantido. ${storageError.message}`,
      );
    }
  }

  const { error: propertyError } = await client
    .from("empreendimentos")
    .delete()
    .eq("id", propertyId);
  if (propertyError) {
    throw new Error(
      `As imagens foram removidas, mas o empreendimento não foi excluído. ${propertyError.message}`,
    );
  }
}
