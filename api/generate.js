// Vercel Serverless Function: api/generate.js
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const fashnApiKey = process.env.FASHN_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  const { action } = req.body;

  try {
    if (action === 'start') {
      const { hatImage, topImage, bottomImage, gender, race } = req.body;

      const hasHat = !!hatImage;
      const hasTop = !!topImage;
      const hasBottom = !!bottomImage;

      // 1. 人種プロンプトの変換
      const raceMap = {
        'Japanese': 'fully Japanese',
        'Caucasian': 'fully Caucasian',
        'half-Caucasian, half-Japanese': 'Eurasian mixed-race child (Caucasian and Japanese)'
      };
      const raceDescription = raceMap[race] || race;

      // 2. モデルの初期状態プロンプト構築
      let outfitBase = "";
      outfitBase += hasTop ? "a thin white tight-fitting inner t-shirt" : "a trendy white short-sleeve t-shirt";
      outfitBase += " and ";
      outfitBase += hasBottom ? "thin white leggings" : "classic blue denim pants with a natural washed texture";
      
      const hatPrompt = hasHat ? "wearing a thin white inner skull cap" : "no hat, neat and cool hairstyle";

      const modelPrompt = `A high-end professional fashion catalog photograph of a ${raceDescription} ${gender} child, 5 years old, height 110cm. The child has an energetic expression and a natural smile. Posture: Standing confidently facing forward, full body visible. Wearing: ${outfitBase}. Head: ${hatPrompt}. Background: Minimalist clean light gray studio. High resolution, commercial lighting, realistic fabric textures. F.O.KIDS style.`;

      // 3. Imagen 4.0 リクエスト
      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: modelPrompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" }
        })
      });
      const imagenData = await imagenRes.json();
      if (!imagenData.predictions || !imagenData.predictions[0]) {
        throw new Error("Imagen generation failed: " + JSON.stringify(imagenData));
      }
      const modelImageBase64 = `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}`;

      // 4. Fashn.ai (tryon-max) 合成設定
      // 【修正箇所】tryon-maxモデルでは 'product_image' が必須、'garment_image' は禁止
      const fashnInputs = { 
        model_image: modelImageBase64,
        product_image: topImage || bottomImage || hatImage // いずれか存在するものを代表画像として設定
      };

      if (hasTop) fashnInputs.top_garment_image = topImage;
      if (hasBottom) fashnInputs.bottom_garment_image = bottomImage;
      if (hasHat) fashnInputs.hat_image = hatImage;

      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: fashnInputs,
          category: hasTop ? "tops" : (hasBottom ? "bottoms" : "accessories"),
          guidance_scale: 2.5,
          timesteps: 50
        })
      });

      const fashnData = await fashnRes.json();
      if (!fashnRes.ok) throw new Error(fashnData.message || "Fashn.ai error");

      return res.status(200).json({ jobId: fashnData.id });
    }

    if (action === 'status') {
      const { jobId } = req.body;
      const resStatus = await fetch(`https://api.fashn.ai/v1/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${fashnApiKey}` }
      });
      const data = await resStatus.json();
      return res.status(200).json(data);
    }

  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
