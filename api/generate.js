// Vercel Serverless Function: api/generate.js
export const maxDuration = 300;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const fashnApiKey = process.env.FASHN_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  const { action } = req.body;

  try {
    if (action === 'start') {
      const { hatImage, topImage, bottomImage, gender, race } = req.body;

      // 各アイテムの有無
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

      // 2. モデルの初期状態（ベース）を構築
      // 画像がないアイテムはプロンプトで「着用済み」として生成させる
      let outfitBase = "";
      outfitBase += hasTop ? "a thin white inner t-shirt" : "a trendy white short-sleeve t-shirt";
      outfitBase += " and ";
      outfitBase += hasBottom ? "white slim leggings" : "classic blue denim pants with a natural washed texture";
      
      const hatPrompt = hasHat ? "bareheaded (as a base for hat overlay)" : "no hat, neat and cool hairstyle";

      // 3. Imagen 4.0 プロンプト: カタログ品質の110cmキッズを生成
      const modelPrompt = `A high-end professional fashion catalog photograph of a ${raceDescription} ${gender} child, 5 years old, height 110cm. The child has an energetic expression and a natural smile. Posture: Standing confidently facing forward, arms relaxed, full body visible. Wearing: ${outfitBase}. Head: ${hatPrompt}. Background: Minimalist clean light gray studio. High resolution, commercial lighting, realistic skin and fabric textures. F.O.KIDS style.`;

      // 4. Gemini画像生成モデル (Nano Banana系) リクエスト
      // Imagen4系(imagen-4.0-generate-001)は2026年8月17日付けでシャットダウン済みのため、
      // gemini-3.1-flash-image + generateContent エンドポイントに切り替え
      // Gemini APIにタイムアウト制御を追加（120秒）
      const abortController = new AbortController();
      const fetchTimeout = setTimeout(() => abortController.abort(), 120000);

      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: modelPrompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: "1:1" },
            // 思考(thinking)をLOWに設定して画像生成を高速化
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      });
      clearTimeout(fetchTimeout);
      const imagenData = await imagenRes.json();
      const modelImagePart = imagenData?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!modelImagePart) {
        throw new Error("Gemini image generation failed: " + JSON.stringify(imagenData));
      }
      const modelMimeType = modelImagePart.inlineData.mimeType || 'image/png';
      const modelImageBase64 = `data:${modelMimeType};base64,${modelImagePart.inlineData.data}`;

      // 5. Fashn.ai (tryon-max) でアイテムを合成
      const fashnInputs = { model_image: modelImageBase64 };
      if (hasTop) fashnInputs.top_garment_image = topImage;
      if (hasBottom) fashnInputs.bottom_garment_image = bottomImage;
      if (hasHat) fashnInputs.hat_image = hatImage;
      
      // tryon-maxモデルは garment_image (必須) にどれか一つを指定
      fashnInputs.garment_image = topImage || bottomImage || hatImage || modelImageBase64;

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
