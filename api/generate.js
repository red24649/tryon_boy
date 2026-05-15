// api/generate.js (v8)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  const fashnKey = process.env.FASHN_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const { action } = req.body;

  try {
    // ステップ1: Imagen 4.0 でベースモデルのみを作成
    if (action === 'create_model') {
      const { gender, race, hasHat, hasTop, hasBottom } = req.body;
      const raceMap = { 'Japanese': 'fully Japanese', 'Caucasian': 'fully Caucasian', 'half-Caucasian, half-Japanese': 'Eurasian mixed-race' };
      
      let outfit = hasTop ? "thin white tight inner shirt" : "trendy white short-sleeve t-shirt";
      outfit += " and " + (hasBottom ? "thin white leggings" : "classic blue denim pants");
      const hat = hasHat ? "wearing thin white skull cap" : "no hat, neat hairstyle";

      const prompt = `A professional catalog photo of a ${raceMap[race] || 'Japanese'} ${gender} child, 5 years old, 110cm tall. Standing confidently facing forward. Wearing: ${outfit}. Head: ${hat}. Background: Minimalist light gray. F.O.KIDS style.`;

      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } })
      });
      const imagenData = await imagenRes.json();
      return res.status(200).json({ modelImage: `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}` });
    }

    // ステップ2: 渡された画像に対して1点だけ試着を実行 (tryon-max)
    if (action === 'start') {
      const { modelImage, productPreview, category } = req.body;
      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: { "model_image": modelImage, "product_image": productPreview },
          category: category
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
