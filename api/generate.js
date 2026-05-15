// Vercel Serverless Function: api/generate.js (v6)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const fashnKey = process.env.FASHN_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  
  if (!fashnKey || !geminiKey) {
    return res.status(500).json({ error: "API Keys are missing." });
  }

  const { action } = req.body;

  try {
    if (action === 'start') {
      const { hatImage, topImage, bottomImage, gender, race } = req.body;

      // 1. モデル生成用プロンプト
      const raceMap = { 
        'Japanese': 'fully Japanese', 
        'Caucasian': 'fully Caucasian', 
        'half-Caucasian, half-Japanese': 'Eurasian mixed-race child' 
      };
      const raceDescription = raceMap[race] || 'Japanese';

      let baseOutfit = (!!topImage) ? "thin white tight inner t-shirt" : "trendy white short-sleeve t-shirt";
      baseOutfit += " and " + ((!!bottomImage) ? "thin white leggings" : "classic blue denim pants");
      const baseHat = (!!hatImage) ? "wearing thin white inner skull cap" : "no hat, neat hairstyle";

      const modelPrompt = `A professional catalog studio photo of a ${raceDescription} ${gender} child, 5 years old, height 110cm. Standing confidently, full body visible. Wearing: ${baseOutfit}. Head: ${baseHat}. Background: Minimalist light gray. F.O.KIDS style.`;

      // 2. Imagen 4.0 でモデル画像を生成
      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          instances: [{ prompt: modelPrompt }], 
          parameters: { sampleCount: 1, aspectRatio: "1:1" } 
        })
      });
      const imagenData = await imagenRes.json();
      if (!imagenData.predictions || !imagenData.predictions[0]) {
        throw new Error("Imagen generation failed.");
      }
      const modelBase64 = `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}`;

      // 3. Fashn.ai (tryon-max) 用の入力データを「究極にクリーンに」構築
      // 変数名そのものがキーにならないよう、完全に分離して構築します
      const cleanInputs = {};
      cleanInputs["model_image"] = modelBase64;
      
      // 必須の product_image。画像が一つもない場合は生成したモデル画像を代替として送る
      const targetImage = topImage || bottomImage || hatImage || modelBase64;
      cleanInputs["product_image"] = targetImage;

      // 各カテゴリ。キー名に "garment_image" を含まないよう注意
      if (!!topImage) cleanInputs["top_garment_image"] = topImage;
      if (!!bottomImage) cleanInputs["bottom_garment_image"] = bottomImage;
      if (!!hatImage) cleanInputs["hat_image"] = hatImage;

      // 4. Fashn.ai リクエスト送信
      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${fashnKey}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: cleanInputs,
          category: (!!topImage) ? "tops" : ((!!bottomImage) ? "bottoms" : "accessories"),
          guidance_scale: 2.5,
          timesteps: 50
        })
      });

      const fashnData = await fashnRes.json();
      if (!fashnRes.ok) {
        throw new Error(`Fashn API Response Error: ${fashnData.message || JSON.stringify(fashnData)}`);
      }

      return res.status(200).json({ jobId: fashnData.id });
    }

    if (action === 'status') {
      const { jobId } = req.body;
      const resStatus = await fetch(`https://api.fashn.ai/v1/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${fashnKey}` }
      });
      const data = await resStatus.json();
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error("Critical API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
