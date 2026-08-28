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
      const { pose, expression, race, hasHat, hasTop, hasBottom, hasShoe, outfitStyle, age, height, gender, hairStyle } = req.body;
      // 性別（未指定時は従来通り男児）
      const genderWord = gender === 'girl' ? 'girl' : 'boy';
      // 年齢・身長（未指定時は従来通り5歳・110cm）
      const modelAge = age || '5';
      const modelHeight = height || '110';
      // 幼児は体型のプロポーションが大人びた5-7歳とは異なるため、年齢に応じて体型のヒントを補足
      const bodyProportionHint = modelAge === '3'
        ? "with the naturally rounder, softer toddler body proportions typical of a 3-year-old (shorter limbs relative to torso, slightly rounder face and belly), NOT the leaner proportions of an older child"
        : "";

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
        'Japanese-black-hair': 'fully Japanese',
        'Japanese': 'fully Japanese',
        'Caucasian': 'fully Caucasian',
        'half-Caucasian, half-Japanese': 'Eurasian mixed-race child of one Japanese parent and one Caucasian (Western) parent, with fair light skin tone (noticeably lighter than typical Japanese skin tone), softer facial features blending Japanese and Caucasian traits, and soft brown or light brown hair'
      };
      const raceDescription = raceMap[race] || raceMap['Japanese-black-hair'];
      // 「日本人（黒髪）」選択時は髪色を黒に固定する
      const forceBlackHair = race === 'Japanese-black-hair';

      // 服装ベース（Fashn.aiで後から着せ替えるアイテムは白い下地にする）
      // outfitStyle: "wafuku"（着物・袴）の場合は、洋服とは全く違う裁ち方に合わせたベースにする
      // （広い振袖状の袖、足首までのプリーツの入った袴シルエット）ことで、
      // Fashn.aiが着せ替える際に洋服の体型に引っ張られて縮んでしまうのを防ぐ
      let outfitBase = "";
      if (outfitStyle === 'wafuku') {
        outfitBase += hasTop
          ? "a plain white traditional Japanese kimono-style top (haori/kimono silhouette) with wide, loose, flowing sleeves (furisode-style) that hang down past the wrist, straight kimono collar crossing at the front"
          : "a trendy white short-sleeve t-shirt";
        outfitBase += " and ";
        outfitBase += hasBottom
          ? "plain white wide-leg pleated hakama-style trousers with box pleats, reaching all the way down to the ankles, NOT shorts length, NOT knee length, with a moderate-height wide waistband (roughly a hand's width tall, NOT an oversized panel) sitting at or just slightly above the natural waistline, with the pleats beginning immediately below the waistband"
          : "classic blue denim pants with a natural washed texture";
      } else {
        // トップス：Fashn.aiで上書きする場合はゆったりめの白Tにして、着せ替え後のサイズ感を大きく見せる
        outfitBase += hasTop ? "a slightly oversized plain white crewneck t-shirt" : "a trendy white short-sleeve t-shirt";
        outfitBase += " and ";
        // ボトムス：ロールアップ防止のためフルレングスを明示
        outfitBase += hasBottom ? "plain white full-length straight-leg pants reaching the ankles, NOT rolled up, NOT cuffed" : "classic blue denim pants with a natural washed texture";
      }
      // 生地の質感：不自然な平坦さを避け、自然なしわ・折り目を明示
      const fabricTexturePrompt = "The fabric of the clothing is soft, lightweight, and flowing, draping naturally and moving with the body's contours. It has natural texture with soft, realistic folds, creases, and gentle wrinkles that give it authentic 3D volume. NOT flat, NOT perfectly smooth, NOT ironed-flat, NOT stiff, NOT rigid, NOT board-like or cardboard-like, NOT starched-looking.";
      // 髪型：性別・ヘアスタイル選択で分岐（和装かどうかは問わず、選択したヘアスタイルをそのまま適用）
      // 「日本人（黒髪）」選択時は髪色を明示的に黒に固定（未指定だと茶髪寄りになりがちなため）
      const hairColorPrompt = forceBlackHair ? "natural jet-black hair color (NOT brown, NOT dyed)" : "natural texture";

      let hairStyleBase;
      if (hairStyle === 'natural') {
        // ナチュラル：あまり作り込まない、自然な髪型
        hairStyleBase = genderWord === 'girl'
          ? `natural shoulder-length hair, straight or with a very slight wave, simple and soft with minimal styling, with ${hairColorPrompt}`
          : `neat, natural short-to-medium hair with soft natural texture, simple everyday cut with minimal styling, NOT overly messy, with ${hairColorPrompt}`;
      } else {
        // カジュアル（デフォルト）
        hairStyleBase = genderWord === 'girl'
          ? `cute and playful two-side-up or low twin-tail hairstyle with the hair loosely gathered on both sides, soft loose curls or gentle waves at the ends, wispy face-framing bangs, adorned with small, subtle, tasteful hair accessories such as a tiny floral clip or a soft ribbon (NOT flashy, NOT oversized), with ${hairColorPrompt}, natural and stylish`
          : `medium-length tousled messy hair with ${hairColorPrompt}, slightly longer on top with a casual street-style look, NOT side-parted`;
      }

      const hatPrompt = hasHat
        ? `bareheaded, no hat, ${hairStyleBase}`
        : `no hat, ${hairStyleBase}`;
      // 足元：靴を着せ替える場合は素足の下地にする（サンダル等の靴下無しタイプにも対応できるよう、靴下は履かせない）
      const footwearPrompt = hasShoe
        ? "barefoot with clean bare feet and ankles fully visible, no socks, as a base for shoe overlay"
        : "barefoot on clean floor";

      // 背景：撮影機材（ソフトボックス・アンブレラ等）が映り込まないよう明示的に指定
      const modelPrompt = `A high-end professional fashion catalog photograph of a ${raceDescription} ${genderWord} child, ${modelAge} years old, height ${modelHeight}cm${bodyProportionHint ? ', ' + bodyProportionHint : ''}. The child has a ${expressionDescription}. Posture: ${poseDescription}. Wearing: ${outfitBase}. ${fabricTexturePrompt} Hair and head: ${hatPrompt}. Feet: ${footwearPrompt}. Background: Completely seamless solid light gray backdrop filling the entire frame, absolutely NO visible studio equipment, NO lighting rigs, NO softboxes, NO umbrellas, NO shadows of equipment. High resolution, bright and evenly lit high-key studio lighting typical of e-commerce product photography, well-exposed with minimal harsh shadows, soft fill light bringing out gentle fabric texture without darkening the overall image, realistic skin and fabric textures.`;

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
      const { modelImage, productPreview, category, previewMode, outfitStyle } = req.body;

      if (!modelImage || !productPreview) {
        return res.status(400).json({ error: 'modelImage と productPreview が必要です' });
      }

      console.log(`Starting Fashn.ai job for category: ${category}, previewMode: ${!!previewMode}, outfitStyle: ${outfitStyle}`);

      // 全カテゴリ共通：シンプルで汎用的なプロンプト
      // 長い詳細指示はFashn.aiのモデルを混乱させる傾向があるため、
      // 「元画像のすべてのディテールをそのまま忠実に再現せよ」の一点に絞る
      const universalPrompt = "Reproduce every visual detail from the reference garment image with pixel-level accuracy: all colors, color boundaries, contrasting edges, trims, stripes, prints, logos, textures, stitching, and hardware. The fabric should look soft, lightweight, and naturally draped with realistic wrinkles, NOT stiff or flat.";

      // 和装・洋服ともにシルエット保持の最低限の指示のみ追加
      const silhouetteHint = outfitStyle === 'wafuku'
        ? (category === 'tops'
            ? " Preserve the wide, loose kimono sleeve proportions exactly as in the reference image."
            : category === 'bottoms'
            ? " Preserve the full-length wide-leg hakama proportions reaching the ankles, do NOT shorten."
            : "")
        : "";

      const stylingPrompt = universalPrompt + silhouetteHint;

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
    // ステップ4: get_credits ? Fashn.aiの残クレジット残高を取得
    // ============================================================
    else if (action === 'get_credits') {
      const creditsRes = await fetch('https://api.fashn.ai/v1/credits', {
        headers: { 'Authorization': `Bearer ${fashnApiKey}` }
      });
      if (!creditsRes.ok) {
        throw new Error(`クレジット残高の取得に失敗しました (${creditsRes.status})`);
      }
      const creditsData = await creditsRes.json();
      return res.status(200).json(creditsData);
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
