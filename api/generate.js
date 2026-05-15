// api/generate.js (v13 - Natural Style & Un-tucked Hem Optimization)
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
        'natural_lean': 'leaning naturally on one leg, body slightly angled away, relaxed casual pose',
        'walking_snapshot': 'natural walking motion, captured candidly, looking away from camera',
        'energetic_jump': 'dynamic jump, playful, spontaneous moment',
        'looking_away': 'looking away from the camera, head turned to the side, profile or three-quarter view, strictly NO eye contact, candid snapshot'
      };

      const expMap = {
        'beaming_smile': 'beaming candid smile, eyes crinkling, mouth open laughing',
        'mischievous': 'mischievous grin, sparkling eyes',
        'calm_relaxed': 'soft relaxed expression, natural mouth, peaceful look, staring into the distance'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      // 素体プロンプト：ボトムスへの食い込みを防ぐために「薄いタイトなインナー」を指定
      let outfit = hasTop ? "ultra-thin skin-tight white sleeveless base layer" : "minimalistic slim white tee";
      outfit += " and " + (hasBottom ? "thin skin-tight white leggings" : "simple shorts");

      const prompt = `A professional CANDID fashion catalog photo of a 5-year-old Japanese boy, 110cm tall. 
        POSE: ${posePrompt}. 
        EXPRESSION: ${expPrompt}. 
        IMPORTANT: The boy is NOT looking at the camera. Authentic child behavior.
        WEARING: ${outfit}. 
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
      
      // 着せ込み時の物理整合性を高める指示
      let instruction = "";
      if (category === "tops") {
        instruction = "The shirt MUST be worn loose and UNTUCKED, hanging over the waistband of the pants naturally with soft folds and drapes.";
      } else if (category === "bottoms") {
        instruction = "The pants should have natural fabric folds at the knees. Ensure the orientation is correct (facing front/side as the model).";
      } else {
        instruction = "Realistic hat placement on the head.";
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
