// Vercel Serverless Function: api/generate.js (v4 - 修正版)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const fashnApiKey = process.env.FASHN_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  
  if (!fashnApiKey || !geminiApiKey) {
    return res.status(500).json({ error: "API Keys are missing in Environment Variables." });
  }

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
        'half-Caucasian, half-Japanese': 'Eurasian mixed-race child' 
      };
      const raceDescription = raceMap[race] || race;

      // 2. モデル生成用のプロンプト（デフォルト補完）
      let outfitBase = hasTop ? "thin white tight inner t-shirt" : "trendy white short-sleeve t-shirt";
      outfitBase += " and " + (hasBottom ? "thin white leggings" : "classic blue denim pants");
      const hatPrompt = hasHat ? "wearing thin white inner skull cap" : "no hat, neat hairstyle";

      const modelPrompt = `A high-end professional catalog studio photo of a ${raceDescription} ${gender} child, 5 years old, height 110cm. Standing confidently facing forward, full body visible. Wearing: ${outfitBase}. Head: ${hatPrompt}. Background: Minimalist clean light gray studio background. Professional lighting, 8k resolution, realistic fabric textures. F.O.KIDS style.`;

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

      // 4. Fashn.ai (tryon-max) 設定
      // 【最重要】'garment_image' キーを完全に排除し 'product_image' を使用
      const fashnInputs = { 
        model_image: modelImageBase64,
        product_image: topImage || bottomImage || hatImage || modelImageBase64 
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
      if (!fashnRes.ok) throw new Error(fashnData.message || "Fashn.ai API Error");

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
