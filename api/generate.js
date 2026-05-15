// Vercel Serverless Function: api/generate.js (v10 - Professional Edition)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  const fashnKey = process.env.FASHN_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const { action } = req.body;

  try {
    // 1. Imagen 4.0 でベースモデルを生成（自然体なポーズと表情を指定）
    if (action === 'create_model') {
      const { pose, expression, hasHat, hasTop, hasBottom } = req.body;
      
      // ポーズごとのキーワード設定：自然な「崩し」を意識
      const poseMap = {
        'natural_lean': 'leaning naturally on one leg with a relaxed posture, one hand slightly tucked in pocket, candid snapshot style',
        'walking_snapshot': 'walking towards the camera with a natural mid-stride pace, dynamic motion, arms swinging naturally',
        'energetic_jump': 'jumping high in the air with pure joy, playful and energetic limbs, high-speed shutter snapshot',
        'looking_away': 'looking away from the camera at something interesting off-camera, very natural profile and soft stance'
      };

      // 表情ごとのキーワード設定：硬さを取り除く
      const expMap = {
        'beaming_smile': 'big infectious beaming smile, eyes crinkling with genuine joy, mouth open laughing, very real expression',
        'mischievous': 'mischievous playful grin, sparkling eyes full of personality, slightly cheeky but cute expression',
        'calm_relaxed': 'soft relaxed neutral expression, natural mouth slightly parted, peaceful and authentic child look'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      // ベースモデルの服装は合成を邪魔しないよう極限まで薄くタイトに
      let outfit = hasTop ? "an ultra-thin skin-tight white sleeveless undershirt" : "a basic slim-fit white cotton t-shirt";
      outfit += " and " + (hasBottom ? "ultra-thin white compression leggings" : "standard blue denim shorts");
      const head = hasHat ? "neatly flat-styled hair to fit under a hat" : "natural soft textured hair with minor messy strands for realism";

      const prompt = `A professional CANDID high-end fashion catalog studio photo of a 5-year-old Japanese boy, 110cm tall. 
        POSE: ${posePrompt}. 
        EXPRESSION: ${expPrompt}. 
        DETAILS: High-end commercial lighting with natural soft shadows, sharp focus on eyes, 8k resolution, authentic skin texture. 
        WEARING: ${outfit}. Head: ${head}. 
        BACKGROUND: Seamless minimalist light gray studio background. F.O.KIDS brand atmosphere.`;

      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } })
      });
      const imagenData = await imagenRes.json();
      return res.status(200).json({ modelImage: `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}` });
    }

    // 2. Fashn.ai (tryon-max) で1アイテムずつ合成
    if (action === 'start') {
      const { modelImage, productPreview, category } = req.body;
      
      // 合成時の馴染ませ指示
      const contextPrompt = category === "accessories" 
        ? "Ensure the hat/cap fits the 3D contour of the head naturally with appropriate shadows."
        : category === "tops"
        ? "Drape the garment naturally over the shoulders and chest, ensuring logos follow the fabric folds."
        : "Ensure the pants fit the legs and waist naturally, creating realistic creases at the knees.";

      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: { "model_image": modelImage, "product_image": productPreview },
          category: category,
          guidance_scale: 3.5,
          timesteps: 50,
          long_description: contextPrompt
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
