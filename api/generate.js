// api/generate.js (v21 - Hat Scale & Placement Fix)
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
        'natural_lean': 'leaning naturally on one leg, body and feet facing forward, knees facing front, relaxed posture, natural relaxed fingers with distinct nails, subtle off-camera gaze (not staring directly at the lens)',
        'walking_snapshot': 'natural walking motion, body facing forward, natural step, knees bending correctly forward, natural hand movement, subtle off-camera gaze (not staring directly at the lens)',
        'energetic_jump': 'dynamic mid-air jump with pure excitement, body facing camera, correct joint alignment, natural relaxed fingers, subtle off-camera gaze (not staring directly at the lens). IMPORTANT: Add a realistic soft drop shadow on the floor directly below the boy to indicate height in the air.',
        'looking_away': 'standing with body and legs facing forward, knees clearly facing front, ONLY the head is turned to the side looking away, strictly NO eye contact, head turned profile view'
      };

      const expMap = {
        'beaming_smile': 'beaming candid smile, eyes crinkling, mouth open laughing, very genuine',
        'mischievous': 'mischievous playful grin, sparkling eyes, energetic personality',
        'calm_relaxed': 'soft relaxed neutral expression, natural mouth, peaceful look, staring slightly into the distance'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      let outfit = hasTop ? "ultra-thin skin-tight white sleeveless base layer" : "minimalistic slim white tee";
      outfit += " and " + (hasBottom ? "thin skin-tight white leggings" : "simple shorts");

      // 修正：帽子のスケール感を意識させるImagenプロンプト
      const prompt = `A professional CANDID fashion catalog photo of a 5-year-old Japanese boy, 110cm tall. 
        ANATOMY: Perfect anatomical proportions, correct head-to-body ratio for a 5-year-old (no oversized head), knees and feet must face the correct natural direction, natural relaxed fingers with distinct nails. ensure accessories like hats are scaled to the same 110cm body proportions.
        POSE: ${posePrompt}. 
        EXPRESSION: ${expPrompt}. 
        WEARING: ${outfit}. 
        FOOTWEAR: Wearing classic black canvas slip-on sneakers with thick white soles. (Strictly NO white rubber toe caps, purely black canvas top).
        STYLE: Soft studio lighting with strong directional shadows to emphasize form and fabric texture, minimalist light gray background. F.O.KIDS brand mood.`;

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
        const fitInstruction = "The shirt MUST be correctly scaled to perfectly fit the 110cm child's body. The fabric must drape naturally, creating highly realistic WRINKLES, folds, and deep 3D shadows across the chest and torso. Avoid a flat, pasted-on appearance. The lighting on the shirt must match the studio lighting on the child. Ensure the hem is worn loose and absolutely UNTUCKED.";
        
        if (pose === 'energetic_jump') {
          instruction = `The hem should end at the waist, and the sleeves at the wrist. Both should be slightly LIFTING UP and flowing naturally as if caught in the motion of a jump. ${fitInstruction}`;
        } else {
          instruction = `The hem should end at the waist, and the sleeves at the wrist. ${fitInstruction}`;
        }
      } else if (category === "bottoms") {
        instruction = "The pants should have highly realistic natural fabric folds and wrinkles. Ensure the front of the pants aligns correctly with the front-facing knees. Scale correctly to the child's legs.";
      } else if (category === "accessories") {
        // 修正：帽子のスケールと配置を強制するFashn.aiプロンプト
        instruction = "Scale and place the hat naturally on the child's head, ensuring it doesn't appear too large, too small, or incorrectly angled. It should sit snug on the head. match the studio lighting.";
      } else {
        instruction = "Realistic placement and scaling, matching the 110cm child's body. match the studio lighting.";
      }

      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: { "model_image": modelImage, "product_image": productPreview },
          category: category,
          guidance_scale: 2.8,
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
