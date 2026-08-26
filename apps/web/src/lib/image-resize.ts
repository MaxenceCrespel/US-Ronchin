/** Downscales an image client-side before upload — the server only ever needs a 256×256
 * avatar, but phone photos routinely arrive at 5-15MB. Uploading that whole file first
 * (especially over mobile data) is what makes an avatar upload feel like it hangs forever;
 * shrinking it in the browser first turns the upload into a near-instant few hundred KB. */
export async function resizeImageFile(
  file: File,
  maxDimension = 1024,
  quality = 0.85,
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) return file

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
}
