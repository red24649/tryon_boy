// api/generate.js (v11 - DEBUG MODE: Pose Verification)
export const maxDuration = 60;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const { action } = req.body;

  try {
    // ステップ1: Imagen 4.0 でベースモデルを生成
    if (action === 'create_model') {
      const { pose, expression } = req.body;
      
      // カタログ画像を参考に、より具体的なポーズ・表情キーワードを設定
      const poseMap = {
        'natural_lean': 'leaning naturally on one leg with a relaxed posture, hands in pockets or at sides, slight tilt of the head, candid and casual',
        'walking_snapshot': 'natural mid-stride walking, captured mid-step, dynamic arm movement, casual snapshot style',
        'energetic_jump': 'dynamic mid-air jump with joy, limbs extended energetically, captured with high-speed shutter',
        'looking_away': 'looking away from the camera, natural profile, spontaneous posture, as if caught in a moment of play'
      };

      const expMap = {
        'beaming_smile': 'wide beaming candid smile, eyes crinkling with joy, laughing expression, very authentic and happy',
        'mischievous': 'mischievous playful grin, sparkling eyes full of personality, cheeky and energetic look',
        'calm_relaxed': 'soft relaxed neutral expression, natural mouth slightly parted, peaceful and authentic child look'
      };

      const posePrompt = poseMap[pose] || poseMap['natural_lean'];
      const expPrompt = expMap[expression] || expMap['beaming_smile'];

      // デバッグモード用の服装（白のタイトな上下。形状が一番よくわかる）
      const prompt = `A professional CANDID fashion catalog photo of a 5-year-old Japanese boy, 110cm tall. 
        POSE: ${posePrompt}. 
        EXPRESSION: ${expPrompt}. 
        WEARING: skin-tight minimalist white cotton t-shirt and slim white leggings. 
        DETAILS: Sharp focus, professional soft studio lighting, high resolution skin texture. 
        BACKGROUND: Seamless minimalist light gray studio. F.O.KIDS brand atmosphere.`;

      const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          instances: [{ prompt: prompt }], 
          parameters: { sampleCount: 1, aspectRatio: "1:1" } 
        })
      });
      
      const imagenData = await imagenRes.json();
      if (!imagenRes.ok) throw new Error(imagenData.error?.message || "Imagen API Error");

      const modelImage = `data:image/jpeg;base64,${imagenData.predictions[0].bytesBase64Encoded}`;
      return res.status(200).json({ modelImage });
    }

    // 【デバッグ用バイパス】着せ込み処理を行わず、生成されたモデル画像をそのまま返す
    if (action === 'start') {
      // 実際にはAPIを叩かず、フロントにそのまま「完了」の合図を送るためのjobId（ダミー）を返す
      return res.status(200).json({ jobId: "debug_mode_active", debugImage: req.body.modelImage });
    }

    if (action === 'status') {
      // ダミーのjobIdを受け取ったら、即座に「completed」として元の画像（素体）を返す
      const { debugImage } = req.body;
      return res.status(200).json({ 
        status: 'completed', 
        output: [debugImage] 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
