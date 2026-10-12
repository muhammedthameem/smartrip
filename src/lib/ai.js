import { supabase } from "./repository";
export async function askAI(demo, body) {
  if (demo || !supabase)
    throw new Error(
      "Connect Supabase and deploy the smarttrip-ai function with an OpenAI key to use AI. Calculated insights work now.",
    );
  const { data, error } = await supabase.functions.invoke("smarttrip-ai", {
    body,
  });
  if (error) {
    let message =
      "AI connection failed. Check the function deployment and server secrets.";
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export function fileData(file) {
  if (
    !file ||
    !["image/jpeg", "image/png", "application/pdf"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG or PDF up to 5 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Cannot read this file."));
    reader.readAsDataURL(file);
  });
}
