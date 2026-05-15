// Vercel Serverless Function: api/generate.js (v7)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const fashnKey = process.env.FASHN_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  
  if (!fashnKey || !geminiKey) return res.status(500).json({ error: "API Keys missing" });

  const { action } = req.body;

  try {
    if (action === 'start') {
      const { hatImage, topImage, bottomImage, gender, race } = req.body;

      // 1. モデル生成用プロンプト (4-6歳/110cm)
      const raceMap = { 'Japanese': 'fully Japanese', 'Caucasian': 'fully Caucasian', 'half-Caucasian, half-Japanese': 'Eurasian mixed-race' };
      const raceDescription = raceMap[race] || 'Japanese';

      // ユーザーが選んでいないアイテムはプロンプトで補完する
      let outfit = (!!topImage) ? "thin white tight inner shirt" : "trendy white short-sleeve t-shirt";
      outfit += " and " + ((!!bottomImage) ? "thin white leggings" : "classic blue denim pants");
      const hat = (!!hatImage) ? "wearing thin white skull cap" : "no hat, neat hairstyle";

      const modelPrompt = `A professional catalog studio photo of a ${raceDescription} ${gender} child, 5 years old, 110cm tall. Standing confidently, full body visible. Wearing: ${outfit}. Head: ${hat}. Background: Minimalist light gray. F.O.KIDS style.`;

      // 2. Imagen 4.0 でベースモデル生成
      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: modelPrompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } })
      });
      const imagenData = await imagenRes.json();
      const modelBase64 = `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}`;

      // 3. Fashn.ai (tryon-max) 設定
      // エラー回避のため、許可されていないキー (top_garment_image等) を完全に削除
      const cleanInputs = {
        "model_image": modelBase64,
        // 最優先でトップス、次にボトムス、次に帽子を product_image として1点のみ採用
        "product_image": topImage || bottomImage || hatImage || modelBase64
      };

      // 4. Fashn.ai リクエスト送信
      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: cleanInputs,
          // カテゴリも選択したアイテムに合わせて1つだけ指定
          category: (!!topImage) ? "tops" : ((!!bottomImage) ? "bottoms" : "accessories")
        })
      });

      const fashnData = await fashnRes.json();
      if (!fashnRes.ok) throw new Error(`Fashn API Error: ${fashnData.message}`);

      return res.status(200).json({ jobId: fashnData.id });
    }

    if (action === 'status') {
      const { jobId } = req.body;
      const resStatus = await fetch(`https://api.fashn.ai/v1/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${fashnKey}` }
      });
      return res.status(200).json(await resStatus.json());
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
