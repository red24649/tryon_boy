// Vercel Serverless Function: api/generate.js
export const maxDuration = 120;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const fashnApiKey = process.env.FASHN_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!fashnApiKey || !geminiApiKey) {
    return res.status(500).json({ error: '必要なAPIキー（FASHN_API_KEY または GEMINI_API_KEY）が設定されていません。' });
  }

  const { action } = req.body;

  try {
    // ============================================================
    // ステップ1: create_model ? Geminiで子供モデルの画像を生成
    // ============================================================
    if (action === 'create_model') {
      const { pose, expression, race, hasHat, hasTop, hasBottom, hasShoe } = req.body;

      // ポーズのマッピング
      const poseMap = {
        'natural_lean': 'Standing casually facing mostly forward with a natural relaxed posture, weight shifted slightly onto one leg (either side) causing a subtle relaxed tilt in the hips and shoulders, NOT perfectly symmetrical, NOT stiffly straight, one knee slightly bent, arms relaxed at sides, full body visible, candid unposed feel like a natural snapshot',
        'walking_snapshot': 'Walking forward naturally, one foot slightly ahead, arms swinging gently, candid snapshot feel',
        'energetic_jump': 'Jumping energetically in the air with arms raised, happy and dynamic pose, full body visible',
        'looking_away': 'Standing at a slight angle, head turned to the side looking away from camera, cool and stylish pose'
      };
      const poseDescription = poseMap[pose] || poseMap['natural_lean'];

      // 表情のマッピング
      const expressionMap = {
        'calm_relaxed': 'calm and relaxed expression',
        'mischievous': 'mischievous playful grin',
        'beaming_smile': 'big beaming joyful smile'
      };
      const expressionDescription = expressionMap[expression] || expressionMap['calm_relaxed'];

      // 人種のマッピング
      const raceMap = {
        'Japanese': 'fully Japanese',
        'Caucasian': 'fully Caucasian',
        'half-Caucasian, half-Japanese': 'Eurasian mixed-race child of one Japanese parent and one Caucasian (Western) parent, with fair light skin tone (noticeably lighter than typical Japanese skin tone), softer facial features blending Japanese and Caucasian traits, and soft brown or light brown hair'
      };
      const raceDescription = raceMap[race] || raceMap['Japanese'];

      // 服装ベース（Fashn.aiで後から着せ替えるアイテムは白い下地にする）
      let outfitBase = "";
      // トップス：Fashn.aiで上書きする場合はゆったりめの白Tにして、着せ替え後のサイズ感を大きく見せる
      outfitBase += hasTop ? "a slightly oversized plain white crewneck t-shirt" : "a trendy white short-sleeve t-shirt";
      outfitBase += " and ";
      // ボトムス：ロールアップ防止のためフルレングスを明示
      outfitBase += hasBottom ? "plain white full-length straight-leg pants reaching the ankles, NOT rolled up, NOT cuffed" : "classic blue denim pants with a natural washed texture";
      // 生地の質感：不自然な平坦さを避け、自然なしわ・折り目を明示
      const fabricTexturePrompt = "The fabric of the clothing has natural texture with soft, realistic folds, creases, and gentle wrinkles that give it authentic 3D volume, NOT flat, NOT perfectly smooth, NOT ironed-flat.";
      // 髪型：横分けを避け、少し長め・無造作でストリート感のあるスタイルを明示
      const hatPrompt = hasHat
        ? "bareheaded, no hat, medium-length tousled messy hair with natural texture, slightly longer on top with a casual street-style look, NOT side-parted"
        : "no hat, medium-length tousled messy hair with natural texture, slightly longer on top with a casual street-style look, NOT side-parted";
      // 足元：靴を着せ替える場合は素足の下地にする（サンダル等の靴下無しタイプにも対応できるよう、靴下は履かせない）
      const footwearPrompt = hasShoe
        ? "barefoot with clean bare feet and ankles fully visible, no socks, as a base for shoe overlay"
        : "barefoot on clean floor";

      // 背景：撮影機材（ソフトボックス・アンブレラ等）が映り込まないよう明示的に指定
      const modelPrompt = `A high-end professional fashion catalog photograph of a ${raceDescription} boy child, 5 years old, height 110cm. The child has a ${expressionDescription}. Posture: ${poseDescription}. Wearing: ${outfitBase}. ${fabricTexturePrompt} Hair and head: ${hatPrompt}. Feet: ${footwearPrompt}. Background: Completely seamless solid light gray backdrop filling the entire frame, absolutely NO visible studio equipment, NO lighting rigs, NO softboxes, NO umbrellas, NO shadows of equipment. High resolution, bright and evenly lit high-key studio lighting typical of e-commerce product photography, well-exposed with minimal harsh shadows, soft fill light bringing out gentle fabric texture without darkening the overall image, realistic skin and fabric textures.`;

      console.log("Starting Gemini image generation for create_model...");
      const startTime = Date.now();

      // Gemini画像生成（gemini-3.1-flash-image ? tryon_babyで動作確認済み）
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${geminiApiKey}`;
      
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: modelPrompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: "3:4" }
          }
        })
      });

      console.log(`Gemini responded in ${Date.now() - startTime}ms, status: ${geminiRes.status}`);

      if (!geminiRes.ok) {
        const errorText = await geminiRes.text();
        throw new Error(`Gemini APIエラー (${geminiRes.status}): ${errorText.substring(0, 300)}`);
      }

      const geminiData = await geminiRes.json();
      const imagePart = geminiData?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!imagePart) {
        const reason = geminiData?.candidates?.[0]?.finishReason || 'unknown';
        throw new Error(`Gemini画像生成失敗 (finishReason: ${reason}): ${JSON.stringify(geminiData).substring(0, 300)}`);
      }

      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const modelImage = `data:${mimeType};base64,${imagePart.inlineData.data}`;
      console.log(`create_model completed in ${Date.now() - startTime}ms`);

      return res.status(200).json({ modelImage });
    }

    // ============================================================
    // ステップ2: start ? モデル画像＋服画像をFashn.aiに送信
    // ============================================================
    else if (action === 'start') {
      const { modelImage, productPreview, category, previewMode } = req.body;

      if (!modelImage || !productPreview) {
        return res.status(400).json({ error: 'modelImage と productPreview が必要です' });
      }

      console.log(`Starting Fashn.ai job for category: ${category}, previewMode: ${!!previewMode}`);

      // カテゴリに応じた自然な着用感（しわ・フィット感）を促すプロンプト
      const stylingPromptMap = {
        tops: "natural fabric drape with realistic wrinkles and folds around the shoulders, chest, and sleeves, not flat or ironed-looking",
        bottoms: "natural fabric drape with realistic wrinkles and folds around the hips, knees, and hem, not flat or ironed-looking",
        shoes: "natural fit hugging the shape of the feet",
        accessories: "natural fit and drape"
      };
      const stylingPrompt = stylingPromptMap[category] || stylingPromptMap.tops;

      // プレビューモード：低解像度・高速・低クレジットで確認用の合成を行う
      // 本生成モード：高解像度・高精度で最終出力を行う
      const resolution = previewMode ? "1k" : "4k";
      const generationMode = previewMode ? "fast" : "quality";

      const fashnRes = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${fashnApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: {
            model_image: modelImage,
            product_image: productPreview,
            prompt: stylingPrompt
          },
          category: category || "tops",
          resolution: resolution,
          generation_mode: generationMode,
          // セキュリティ強化：公開CDN URLではなくBase64で直接返却させ、
          // サーバー側の画像保持期間を3日間→最大60分に短縮し、リクエスト履歴にも画像を残さない
          return_base64: true
        })
      });

      const fashnData = await fashnRes.json();
      if (!fashnRes.ok) {
        throw new Error(`Fashn.ai エラー: ${fashnData.message || JSON.stringify(fashnData).substring(0, 300)}`);
      }

      console.log(`Fashn.ai job started: ${fashnData.id}`);
      return res.status(200).json({ jobId: fashnData.id });
    }

    // ============================================================
    // ステップ3: status ? Fashn.aiのジョブ状態を確認
    // ============================================================
    else if (action === 'status') {
      const { jobId } = req.body;
      const statusRes = await fetch(`https://api.fashn.ai/v1/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${fashnApiKey}` }
      });
      const data = await statusRes.json();
      return res.status(200).json(data);
    }

    // ============================================================
    // 未知のアクション → 即座にエラーを返す（ハング防止）
    // ============================================================
    else {
      return res.status(400).json({ error: `不明なアクション: ${action}` });
    }

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
