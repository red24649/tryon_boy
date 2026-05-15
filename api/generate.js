// api/generate.js (v9 - 高精度調整版)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  const fashnKey = process.env.FASHN_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const { action } = req.body;

  try {
    if (action === 'create_model') {
      const { gender, race, hasHat, hasTop, hasBottom } = req.body;
      const raceMap = { 'Japanese': 'fully Japanese', 'Caucasian': 'fully Caucasian', 'half-Caucasian, half-Japanese': 'Eurasian mixed-race' };
      
      // 合成しやすくするため、土台となる服を極限までタイトに、髪型をボリュームなしに指定
      let outfit = hasTop ? "ultra-thin skin-tight white sleeveless inner" : "basic white slim t-shirt";
      outfit += " and " + (hasBottom ? "skin-tight white thin leggings" : "classic blue denim pants");
      const hat = hasHat ? "shaved head style or very tight hair" : "natural neat hairstyle";

      const prompt = `A professional high-end catalog studio photo of a ${raceMap[race] || 'Japanese'} ${gender} child, 5 years old, 110cm tall. Standing straight, arms straight down at sides, facing camera. Wearing: ${outfit}. Head: ${hat}. Background: Seamless minimalist light gray. High resolution, sharp outlines, professional lighting. F.O.KIDS style.`;

      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } })
      });
      const imagenData = await imagenRes.json();
      return res.status(200).json({ modelImage: `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}` });
    }

    if (action === 'start') {
      const { modelImage, productPreview, category } = req.body;
      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: { "model_image": modelImage, "product_image": productPreview },
          category: category,
          // パラメータを強化して馴染ませる
          guidance_scale: 3.5,
          timesteps: 50,
          long_description: category === "accessories" ? "Ensure the hat fits naturally on the head contour." : "Ensure the garment fits the 110cm child model body naturally."
        })
      });
      const fashnData = await fashnRes.json();
      return res.status(200).json({ jobId: fashnData.id });
    }

    if (action === 'status') {
      const { jobId } = req.body;
      const resStatus = await fetch(`https://api.fashn.ai/v1/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${fashnKey}` }
      });
      return res.status(200).json(await resStatus.json());
    }
  } catch (error) { res.status(500).json({ error: error.message }); }
}
