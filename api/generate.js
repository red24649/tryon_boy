// api/generate.js (v12 - High-Precision Synthesis)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  const fashnKey = process.env.FASHN_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const { action } = req.body;

  try {
    if (action === 'create_model') {
      const { pose, expression, hasHat, hasTop, hasBottom } = req.body;
      
      const poseMap = {
        'natural_lean': 'leaning naturally on one leg, casual relaxed posture, arms at sides, facing front',
        'walking_snapshot': 'natural mid-stride walking towards the camera, captured as a candid snapshot, facing front',
        'energetic_jump': 'dynamic mid-air jump with pure excitement, facing camera, limbs extended',
        'looking_away': 'standing naturally but looking away from camera, spontaneous posture, facing camera direction'
      };

      const expMap = {
        'beaming_smile': 'big infectious beaming smile, eyes crinkling with joy, laughing, authentic child look',
        'mischievous': 'mischievous playful grin, sparkling eyes, energetic personality',
        'calm_relaxed': 'soft relaxed expression, natural mouth, peaceful and authentic look'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      // 合成を邪魔しない極薄インナー
      let outfit = hasTop ? "ultra-thin skin-tight white sleeveless undershirt" : "basic slim white tee";
      outfit += " and " + (hasBottom ? "thin skin-tight white compression leggings" : "simple shorts");

      const prompt = `A professional CANDID fashion photo of a 5-year-old Japanese boy, 110cm tall. 
        POSE: ${posePrompt}. EXPRESSION: ${expPrompt}. 
        WEARING: ${outfit}. 
        DETAILS: Facing camera directly, clear frontal orientation, high-end catalog lighting, minimalist light gray studio. F.O.KIDS style.`;

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
      
      // 合成指示の微調整：特にトップスの裾を自然にする
      let instruction = "";
      if (category === "tops") {
        instruction = "The t-shirt should be worn loose over the waistband of the pants, not tucked in, creating natural drapes and shadows at the hem.";
      } else if (category === "bottoms") {
        instruction = "The pants should fit the childs legs perfectly with realistic fabric folds at the knees and ankles.";
      } else {
        instruction = "The hat should follow the 3D contour of the head naturally.";
      }

      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: { "model_image": modelImage, "product_image": productPreview },
          category: category,
          guidance_scale: 3.5,
          timesteps: 50,
          long_description: instruction
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
