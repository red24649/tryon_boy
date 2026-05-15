// api/generate.js (v15 - Anatomy & Default Footwear)
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
        'natural_lean': 'leaning naturally on one leg, body and feet facing forward, knees facing front, relaxed posture',
        'walking_snapshot': 'natural walking motion, body facing forward, natural step, knees bending correctly forward',
        'energetic_jump': 'dynamic jump, body facing camera, correct joint alignment',
        'looking_away': 'standing with body and legs facing forward, knees clearly facing front, ONLY the head is turned to the side looking away, strictly NO eye contact'
      };

      const expMap = {
        'beaming_smile': 'beaming candid smile, eyes crinkling, mouth open laughing',
        'mischievous': 'mischievous grin, sparkling eyes',
        'calm_relaxed': 'soft relaxed expression, natural mouth, peaceful look'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      let outfit = hasTop ? "ultra-thin skin-tight white sleeveless base layer" : "minimalistic slim white tee";
      outfit += " and " + (hasBottom ? "thin skin-tight white leggings" : "simple shorts");

      // 新規追加：FOOTWEARプロンプトで黒のスリッポンを明示的に履かせる
      const prompt = `A professional CANDID fashion catalog photo of a 5-year-old Japanese boy, 110cm tall. 
        ANATOMY: Perfect anatomical proportions, correct head-to-body ratio for a 5-year-old (no oversized head), knees and feet must face the correct natural direction.
        POSE: ${posePrompt}. 
        EXPRESSION: ${expPrompt}. 
        WEARING: ${outfit}. 
        FOOTWEAR: Wearing classic black canvas slip-on sneakers with thick white soles.
        STYLE: Soft studio lighting, realistic skin, minimalist light gray background. F.O.KIDS brand mood.`;

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
      
      let instruction = "";
      if (category === "tops") {
        instruction = "The shirt MUST be worn loose and UNTUCKED, hanging over the waistband naturally.";
      } else if (category === "bottoms") {
        instruction = "The pants should have natural fabric folds. IMPORTANT: Ensure the front of the pants aligns correctly with the front-facing knees. No reversed legs.";
      } else {
        instruction = "Realistic hat placement on the head, scaled correctly.";
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
