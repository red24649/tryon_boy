// api/generate.js
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
        'natural_lean': 'leaning naturally on one leg, body and feet facing forward, knees facing front, relaxed posture, natural relaxed fingers with distinct nails',
        'walking_snapshot': 'natural walking motion, body facing forward, natural step, knees bending correctly forward, natural hand movement',
        'energetic_jump': 'dynamic mid-air jump with pure excitement, body facing camera, correct joint alignment, natural relaxed fingers. IMPORTANT: Add a realistic soft drop shadow on the floor directly below the boy to indicate height in the air.',
        'looking_away': 'standing with body and legs facing forward, knees clearly facing front, ONLY the head is turned to the side looking away, strictly NO eye contact, head turned profile view'
      };

      const expMap = {
        'beaming_smile': 'beaming candid smile, eyes crinkling, mouth open laughing, very genuine',
        'mischievous': 'mischievous playful grin, sparkling eyes, energetic personality',
        'calm_relaxed': 'soft relaxed neutral expression, natural mouth, peaceful look, staring into the distance'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      let outfit = hasTop ? "ultra-thin skin-tight white sleeveless base layer" : "minimalistic slim white tee";
      outfit += " and " + (hasBottom ? "thin skin-tight white leggings" : "simple shorts");

      const prompt = `A professional CANDID fashion catalog photo of a 5-year-old Japanese boy, 110cm tall. 
        ANATOMY: Perfect anatomical proportions, correct head-to-body ratio for a 5-year-old (no oversized head), knees and feet must face the correct natural direction, natural relaxed fingers with distinct nails. The clothing must be correctly scaled to fit this 110cm body, not appearing oversized.
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
        const fitInstruction = "The shirt MUST be correctly scaled to perfectly fit the 110cm child's body. The fabric must drape naturally, creating natural folds, drapes, and 3D shadows on the child's body. Ensure the hem is worn loose and absolutely UNTUCKED.";
        
        if (pose === 'energetic_jump') {
          instruction = `The hem should end at the waist, and the sleeves at the wrist. Both should be slightly LIFTING UP and flowing naturally as if caught in the motion of a jump. ${fitInstruction}`;
        } else {
          instruction = `The hem should end at the waist, and the sleeves at the wrist. ${fitInstruction}`;
        }
      } else if (category === "bottoms") {
        instruction = "The pants should have natural fabric folds. Ensure the front of the pants aligns correctly with the front-facing knees. Scale correctly to the child's legs.";
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
