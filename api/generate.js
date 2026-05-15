// api/generate.js (v16 - Physics, Shadows & Detail Refinement)
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
        'natural_lean': 'leaning naturally on one leg, body and feet facing forward, knees facing front, relaxed posture, natural relaxed fingers',
        'walking_snapshot': 'natural walking motion, body facing forward, natural step, knees bending correctly forward, natural hand movement',
        // 修正：指先の補正と、ジャンプ時の影の指示を追加
        'energetic_jump': 'dynamic mid-air jump with pure excitement, body facing camera, correct joint alignment, natural relaxed fingers. IMPORTANT: Add a realistic soft drop shadow on the floor directly below the boy to indicate height in the air.',
        'looking_away': 'standing with body and legs facing forward, knees clearly facing front, ONLY the head is turned to the side looking away, strictly NO eye contact, relaxed hands'
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

      // 修正：靴のつま先のディテール指定（ラバーキャップ排除）
      const prompt = `A professional CANDID fashion catalog photo of a 5-year-old Japanese boy, 110cm tall. 
        ANATOMY: Perfect anatomical proportions, correct head-to-body ratio, hands with five distinct fingers, knees and feet facing forward.
        POSE: ${posePrompt}. 
        EXPRESSION: ${expPrompt}. 
        WEARING: ${outfit}. 
        FOOTWEAR: Wearing classic black canvas slip-on sneakers with thick white soles. (Strictly NO white rubber toe caps, purely black canvas top).
        STYLE: Soft studio lighting, realistic skin textures, minimalist light gray background. F.O.KIDS brand mood.`;

      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } })
      });
      const imagenData = await imagenRes.json();
      return res.status(200).json({ modelImage: `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}` });
    }

    if (action === 'start') {
      const { modelImage, productPreview, category, pose } = req.body;
      
      let instruction = "";
      if (category === "tops") {
        // 修正：ジャンプ時は裾を浮かせる指示を追加
        if (pose === 'energetic_jump') {
          instruction = "The shirt MUST be worn loose and UNTUCKED. The hem should be slightly LIFTING UP and flowing naturally as if caught in the motion of a jump.";
        } else {
          instruction = "The shirt MUST be worn loose and UNTUCKED, hanging over the waistband naturally.";
        }
      } else if (category === "bottoms") {
        instruction = "The pants should have natural fabric folds. Ensure the front of the pants aligns correctly with the front-facing knees.";
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
