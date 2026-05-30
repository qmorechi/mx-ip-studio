// ╔══════════════════════════════════════════════════════════════╗
// ║  skill-flows.js — Skill Runner 的階段腳本 + 角色對應（北極星）  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// 這份是「引導式產出」的素材：把 5 個 SKILL.md 的階段流程（為 Claude Code
// 設計的 slash-command 顧問腳本）轉成結構化、可在網頁逐階段填寫的引導欄位。
// 成員不是面對空白表單腦補，而是每個階段被顧問問對的問題、給 placeholder 提示，
// 有節奏地產出對齊 deliverable 的內容。
//
// 資料模型：
//   SKILL_FLOWS[skillId] = {
//     label, summary, outputs[],            // 這個 skill 是什麼、最終交付什麼
//     stages: [ { cmd, title, intro, optional?, note?, repeatable?, fields:[…] } ]
//   }
//   field = { key, label, type:'text'|'textarea'|'select', hint?, options?, required? }
//
//   ROLE_SKILL = { <roleId 1-22>: <skillId> }   // 22 角色 → 主 skill
//   SKILL_LIST = [skillId…]                       // 顯示順序
//
// 角色→skill 對應依 roles-data.js 的 5 主頻道收斂：
//   品牌核心(1)            → brand-core
//   角色聖經(2-9)          → character-consistency-v2
//   故事企劃+分鏡+提案(10-22) → storyboard-workflow（這個 skill 本身就含
//                            故事企劃/社群/商業/分鏡全部指令，解掉「故事企劃 10-17 對哪 skill」）
//   multi-party-discussion 是跨角色的共識工具（同角色多人 → role_approvals），任何人可選用。
//   ip-full-workflow 是 admin/backend 的全流程導覽（orchestrator），串起前三個。
//
// 純瀏覽器 + node 皆可載入（node 用於本地結構驗證）。

(function (global) {
  'use strict';

  // ── 共用小工具：把多行清單欄位的提示寫成 placeholder ──
  const SKILL_FLOWS = {

    // ════════════════════════ 1) BRAND CORE ════════════════════════
    'brand-core': {
      label: '品牌核心 Brand Core',
      summary: '把零散的 IP 策略、世界觀、角色設定，收斂成下游所有 skill 可重用的上游真相。不生圖、不寫分鏡，只建品牌操作基底。',
      outputs: ['brand_bible.md', 'character_roster.json', 'content_rules.md', 'story_territories.md', 'brand_core_manifest.json'],
      stages: [
        {
          cmd: '/brand-start', title: '起手 — 專案盤點',
          intro: '先確認 IP / 品牌名稱，盤點現有素材。建立 brand-core 的起點。',
          fields: [
            { key: 'ip_name', label: 'IP / 品牌名稱', type: 'text', required: true, hint: '例：SIPAI 生意興龍' },
            { key: 'sources', label: '來源文件 / 資料夾', type: 'textarea', hint: '列出策略文件、客戶簡報、截圖、PDF、deck 等可用素材；摘要成可執行規則，不要整段複製。' },
            { key: 'existing_chars', label: '既有角色', type: 'textarea', hint: '已存在的角色名單與一句話定位。' },
            { key: 'goal', label: '目前目標', type: 'textarea', hint: '這次要產出什麼？想解決什麼問題？' },
          ],
        },
        {
          cmd: '/brand-truth', title: '品牌真相 — brand_bible.md',
          intro: '定義品牌是什麼、不是什麼。這是所有下游創作的最上游約束。',
          fields: [
            { key: 'brand_truth', label: '品牌真相', type: 'textarea', required: true, hint: '這個 IP 最核心、不可妥協的那句真話。' },
            { key: 'audience_emotion', label: '受眾情緒', type: 'textarea', hint: '希望觀眾看完的情緒反應。' },
            { key: 'core_value', label: '核心價值', type: 'text' },
            { key: 'anti_value', label: '反價值（絕不做）', type: 'text', hint: '品牌絕不傳遞的東西。' },
            { key: 'position_one_liner', label: '一句話品牌定位', type: 'text', required: true },
            { key: 'ip_style_type', label: '視覺風格類型 ip_style_type', type: 'select', required: true,
              options: ['stylized_3d_toy', 'stylized_2d_anime', 'semi_realistic', 'realistic_human', 'live_action_reference'],
              hint: '決定下游 /look-dev /prompts /kling 載哪個 style preset。SIPAI=stylized_3d_toy；雙辮少女=realistic_human。' },
            { key: 'appeal_strategy', label: '吸引力策略 appeal_strategy（僅真人/寫實人型 IP 必填）', type: 'textarea',
              hint: '僅真人/寫實人型角色（如雙辮少女）需要。含 positioning / not_positioning / audience_reaction_target / audience_reaction_avoid / visual_priority(4) / visual_avoid(3+)。擬人動物、玩具公仔（SIPAI）、抽象生物等非人風格 IP 免填。' },
          ],
        },
        {
          cmd: '/world-rules', title: '世界規則 — brand_bible.md + content_rules.md',
          intro: '定義世界怎麼運作、衝突與幽默的邊界。',
          fields: [
            { key: 'world_rules', label: '世界規則', type: 'textarea', required: true, hint: '這個世界的運作邏輯、設定底線。' },
            { key: 'conflict_level', label: '可接受的衝突程度', type: 'text' },
            { key: 'humor_mode', label: '幽默模式', type: 'text', hint: '這個 IP 怎麼好笑？' },
            { key: 'forbidden_modes', label: '禁止模式', type: 'textarea', hint: '絕不出現的調性 / 內容類型。' },
            { key: 'emotional_boundary', label: '情緒邊界', type: 'text' },
          ],
        },
        {
          cmd: '/character-roster', title: '角色名冊 — character_roster.json',
          intro: '每個角色用「品牌功能」定義，不只是外觀。每個角色一段，建議用同樣欄位格式。',
          fields: [
            { key: 'roster', label: '角色清單（每角色含以下欄位）', type: 'textarea', required: true,
              hint: '每個角色填：character_name / role_in_brand / core_personality / emotional_function / story_function / must_keep_traits / must_avoid_traits / signature_props。一角色一段。' },
          ],
        },
        {
          cmd: '/story-territories', title: '故事領域 — story_territories.md',
          intro: '界定哪些故事屬於這個品牌、哪些離題。',
          fields: [
            { key: 'core_territories', label: '核心故事領域', type: 'textarea', required: true },
            { key: 'secondary_territories', label: '次要故事領域', type: 'textarea' },
            { key: 'off_brand_types', label: '離題（off-brand）故事類型', type: 'textarea', hint: '這個 IP 絕不該講的故事。' },
            { key: 'reusable_short_video', label: '可重用短影音題材', type: 'textarea' },
          ],
        },
        {
          cmd: '/content-rules', title: '內容規則 — content_rules.md',
          intro: '定義品牌聲音與語言護欄。',
          fields: [
            { key: 'brand_voice', label: '品牌聲音', type: 'textarea', required: true },
            { key: 'language_guardrails', label: '語言護欄', type: 'textarea', hint: '可用 / 不可用的字眼、語氣。' },
            { key: 'dialogue_tempo', label: '對白節奏', type: 'text' },
            { key: 'caption_tone', label: '貼文文案語氣', type: 'text' },
            { key: 'commercial_fit', label: '商業合作規則', type: 'textarea' },
            { key: 'product_mismatch', label: '產品不適配警示', type: 'textarea' },
          ],
        },
        {
          cmd: '/brand-export', title: '匯出 — brand_core_manifest.json',
          intro: '收尾：確認 5 個必備檔都齊備，manifest 必含頂層 ip_style_type 供下游自動載 preset。',
          fields: [
            { key: 'manifest_notes', label: 'manifest 重點 / 缺口', type: 'textarea', hint: '確認 brand_bible / character_roster / content_rules / story_territories 都備齊；列出仍待補的項目。' },
            { key: 'downstream_handoff', label: '給下游的交接重點', type: 'textarea', hint: '提醒 character-consistency / storyboard 要特別注意的品牌約束。' },
          ],
        },
      ],
    },

    // ═══════════════ 2) CHARACTER CONSISTENCY V2 ═══════════════
    // 只收錄可用文字定義的「角色聖經」步驟；純生圖步驟（step1/3/5a/5b/6a/6b）
    // 需搭配生圖工具，不在引導填寫 MVP 內，改由 engine_config + 後續面板處理。
    'character-consistency-v2': {
      label: '角色一致性 Character v2',
      summary: '建立可被分鏡 / campaign / 影片重用的角色資產包：身份卡、錨點特徵、比例、表演、表情動作、造型、延展規則。目標不是出 prompt，而是一份能複製、審核、重用的角色聖經。',
      outputs: ['character_identity_card.json', 'anchor_traits.json', 'proportion_checklist.json', 'performance_rules.json', 'expression_action_rules.json', 'styling_rules.json', 'extension_rules.json', 'character_asset_manifest.json'],
      stages: [
        {
          cmd: '/step0', title: '身份卡 — character_identity_card',
          intro: '先確認 IP 與角色名。若有 brand_core_manifest.json，先讀它再定角色。角色身份優先於場景豐富度。',
          fields: [
            { key: 'character_name', label: '角色名稱', type: 'text', required: true },
            { key: 'role_summary', label: '角色定位摘要', type: 'textarea', required: true },
            { key: 'core_personality', label: '核心個性', type: 'textarea' },
            { key: 'emotional_tone', label: '情緒底色', type: 'text' },
            { key: 'world_role', label: '在世界觀中的角色', type: 'text' },
            { key: 'must_keep', label: '必須保留特徵 must-keep', type: 'textarea', required: true },
            { key: 'must_avoid', label: '必須避免特徵 must-avoid', type: 'textarea', required: true },
            { key: 'signature_props', label: '招牌道具', type: 'text' },
          ],
        },
        {
          cmd: '/step2', title: '錨點特徵 — anchor_traits',
          intro: '以選定的基準圖鎖定錨點（外觀的不可變核心）。這是下游一致性的地基。',
          note: '需先有一張選定的基準角色圖；此階段把該圖的關鍵特徵文字化鎖定。',
          fields: [
            { key: 'anchor_traits', label: '錨點特徵清單', type: 'textarea', required: true, hint: '臉型、五官比例、體型、招牌色、材質語言等「換場景也不能變」的核心特徵。' },
            { key: 'base_image_ref', label: '基準圖來源 / 連結', type: 'text', hint: '選定的 Step1 結果圖路徑或連結。' },
          ],
        },
        {
          cmd: '/step4', title: '細節規則 — detail_rules',
          intro: '鎖定識別記號、服裝規則、道具細節、（必要時）髮妝造型規則、不可移除規則。',
          fields: [
            { key: 'distinctive_marks', label: '識別記號', type: 'textarea', hint: '胎記、疤、特殊紋路等。' },
            { key: 'outfit_rules', label: '服裝規則', type: 'textarea' },
            { key: 'prop_details', label: '道具細節', type: 'textarea' },
            { key: 'keep_rules', label: '不可移除 / 保留規則', type: 'textarea', required: true },
          ],
        },
        {
          cmd: '/step5c', title: '招牌道具 — signature_props',
          intro: '記錄固定道具、比例、材質、互動規則。',
          fields: [
            { key: 'props', label: '招牌道具規格', type: 'textarea', required: true, hint: '每個道具：名稱 / 比例 / 材質 / 角色如何拿取與互動。' },
          ],
        },
        {
          cmd: '/step5d', title: '比例檢查表 — proportion_checklist',
          intro: '建立硬性審核規則：頭、臉、頸、軀幹、四肢、尾、帽、服裝輪廓、常見漂移失敗。',
          fields: [
            { key: 'proportions', label: '比例規則', type: 'textarea', required: true, hint: '逐部位寫硬規則（頭身比、臉部、頸、軀幹、手腳、尾、帽、輪廓）。' },
            { key: 'common_drift', label: '常見漂移失敗', type: 'textarea', hint: '最常生壞的比例問題，列成 reviewer 檢查點。' },
          ],
        },
        {
          cmd: '/step5e', title: '表演規則 — performance_rules',
          intro: '定義姿態、表演、動作規則，供下游 storyboard / Kling 重用。',
          fields: [
            { key: 'default_posture', label: '預設姿態與重心', type: 'textarea', required: true },
            { key: 'action_rules', label: '站/坐/走/伸手/拿物/看/反應/休息規則', type: 'textarea' },
            { key: 'object_handling', label: '拿物風格', type: 'textarea', hint: '怎麼拿食物、工具、道具、產品、手機、包、杯。' },
            { key: 'emotion_map', label: '情緒表達落點', type: 'textarea', hint: '情緒出現在眼/嘴/頭角度/肩/手/尾/髮/衣/道具。' },
            { key: 'gesture_tempo', label: '手勢幅度與動作節奏', type: 'text' },
            { key: 'forbidden_drift', label: '禁止表演漂移', type: 'textarea', hint: '太敏捷/太吵/太性感/太成熟/太幼稚/太滑稽/太人類/太模特兒等。' },
            { key: 'kling_safety', label: 'Kling 動作安全', type: 'textarea', hint: '高風險動作、close-up fallback、首/尾禎需求、肢體/伸展限制。' },
          ],
        },
        {
          cmd: '/step5f', title: '造型規則 — styling_rules（真人/寫實/時尚向角色）',
          intro: '用於真人、實拍、半寫實、時尚向、造型敏感角色。',
          optional: true,
          fields: [
            { key: 'hair_rules', label: '髮型規則', type: 'textarea', hint: '輪廓、長度、分線、瀏海、顏色、質地、份量與允許變化。' },
            { key: 'makeup_rules', label: '妝感規則', type: 'textarea', hint: '濃淡、膚質、眉眼唇重點、修容與允許變化。' },
            { key: 'wardrobe_rules', label: '服裝規則', type: 'textarea', hint: '輪廓、版型、布料、層次、色盤、招牌單品、配件、場合變體。' },
            { key: 'styling_hierarchy', label: '造型主次', type: 'textarea', hint: '哪些是身份關鍵、哪些可彈性。' },
            { key: 'styling_forbidden', label: '禁止造型漂移', type: 'textarea' },
          ],
        },
        {
          cmd: '/step5g', title: '情緒表情 + 招牌動作 — expression_action_rules',
          intro: '定義可重用的情緒、表情、招牌動作標準（角色聖經的情緒表情模組）。',
          fields: [
            { key: 'emotion_set', label: '情緒集', type: 'textarea', required: true, hint: 'default/happy/surprised/worried/focused/proud/embarrassed/… 或角色專屬情緒。' },
            { key: 'expression_standard', label: '各情緒表情標準', type: 'textarea', hint: '每個情緒：眼/眉/嘴/頰/頭角度/肩/手/體傾/尾/髮/衣/道具行為。' },
            { key: 'intensity_levels', label: '強度分級（subtle/medium/strong）與允許範圍', type: 'text' },
            { key: 'signature_actions', label: '招牌姿勢 / 招牌動作', type: 'textarea', hint: '可重複的動作型態：小心伸手、小揮手、慢咀嚼、輕點頭、摸帽、抱物等。' },
            { key: 'forbidden_expr', label: '禁止表情 / 動作', type: 'textarea', hint: '即使 prompt 要求也絕不生成的。' },
            { key: 'emotional_residue', label: '情緒殘留（事件後殘留狀態）', type: 'textarea', hint: '格式：[觸發事件]→[殘留身體狀態]+[殘留視線/表情]，避免擺拍感。' },
            { key: 'micro_action_chain', label: '微動作鏈 / Motion Cascade', type: 'textarea', hint: '無意識小動作清單 + 主動作觸發的連鎖反應，供 Kling/Seedance 用。' },
          ],
        },
        {
          cmd: '/step5i', title: '聲音方向 — voice_acting_guidelines',
          intro: '為角色定義聲音識別與微表情時序，讓 TTS / Kling / Veo prompt 維持角色感。',
          optional: true,
          fields: [
            { key: 'voice_formula', label: '聲音公式', type: 'textarea', required: true, hint: '年齡 + 嗓音質地 + 語速 + 情緒底色 + 說話習慣，寫成可直接餵 TTS 的 prompt（如 ElevenLabs Voice 描述）。' },
            { key: 'punctuation_rhythm', label: '標點節奏範例', type: 'textarea', hint: '示範錯版（太亢奮/太平）與對版：…… 表疲憊停頓、！！！ 表爆發、（吸氣）表緊張、—— 表打斷。' },
            { key: 'micro_expression_timing', label: '微表情時序', type: 'textarea', hint: '把一個招牌情緒時刻拆成 0–5 秒增量，每段：身體部位 + 動作方向/幅度 + 情緒標籤。只寫物理動作，不寫「開心地」這種形容詞。' },
            { key: 'forbidden_voice_drift', label: '禁止聲音漂移', type: 'textarea' },
          ],
        },
        {
          cmd: '/step5h', title: '延展規則 — extension_rules',
          intro: '用於會出現在代言、IG/FB、周邊、KV、封面、貼圖、包裝、campaign 的角色。',
          optional: true,
          fields: [
            { key: 'always_visible', label: '商業/社群情境必留特徵', type: 'textarea', required: true },
            { key: 'may_simplify', label: '小尺寸可簡化特徵', type: 'textarea', hint: '貼圖、icon、縮圖、封面裁切時可簡化的。' },
            { key: 'product_integration', label: '產品整合規則', type: 'textarea', hint: '產品能多靠近角色、能否拿/用/推薦、不可暗示什麼。' },
            { key: 'forbidden_ext_drift', label: '禁止延展漂移', type: 'textarea', hint: '別變成通用吉祥物、模特兒、業務、贊助商財產。' },
          ],
        },
        {
          cmd: '/handoff', title: '交接 — character_asset_manifest',
          intro: '更新 manifest，總結下游 skill 該用什麼。',
          fields: [
            { key: 'handoff_summary', label: '交接摘要 / 缺口', type: 'textarea', hint: '哪些角色資產已備齊、哪些待補；提醒 storyboard 載哪些檔。' },
          ],
        },
      ],
    },

    // ═══════════════ 3) STORYBOARD WORKFLOW ═══════════════
    // 含故事企劃(10-17)+分鏡(18-22)+社群/商業(13,15,16)全部。生圖/生影需搭工具，
    // 引導填寫產出的是「製作規劃 deliverable」（Board/shot/prompt/kling 規格文字）。
    'storyboard-workflow': {
      label: '分鏡 / 製作 Storyboard',
      summary: 'AI 短影音與社群內容的製作規劃：品牌脈絡→爆款故事→劇本審核→視覺定調→三板→分鏡→節奏→資產→GPT/Kling prompt→社群/商業。完整 deliverable ＝ Board A+B+C + 互動 HTML。',
      outputs: ['brand_context', 'brief', 'script_review', 'look_dev', 'boards(A/B/C)', 'shots', 'timing', 'asset_map', 'gpt_prompts', 'kling_prompts', 'storyboard.html'],
      stages: [
        {
          cmd: '/start-project', title: '專案起手',
          intro: '先給專案名稱，再開始規劃。若有 character_asset_manifest.json，先載入當角色一致性來源。',
          fields: [
            { key: 'project_name', label: '專案名稱', type: 'text', required: true },
            { key: 'ip_ref', label: '所屬 IP / 角色', type: 'text', hint: 'SIPAI / 矽派 / 阿抱 等。' },
            { key: 'has_char_manifest', label: '是否已有角色資產 manifest？', type: 'select', options: ['有', '沒有', '不確定'] },
          ],
        },
        {
          cmd: '/brand-context', title: '品牌脈絡 — Brand Strategy Director',
          intro: '已知 IP 專案先跑：把品牌真相、世界規則、角色不可變特徵、離題風險帶進來。',
          fields: [
            { key: 'brand_truth', label: '品牌真相 / 世界規則', type: 'textarea', required: true },
            { key: 'character_role', label: '角色定位與不可變特徵', type: 'textarea' },
            { key: 'narrative_territory', label: '故事領域', type: 'text' },
            { key: 'tone_guardrails', label: '語氣護欄', type: 'text' },
            { key: 'off_brand_risks', label: '離題風險', type: 'textarea' },
            { key: 'brand_fit', label: '對目前點子的品牌適配建議', type: 'textarea' },
          ],
        },
        {
          cmd: '/brief', title: '創意方向 — Viral Story Expert',
          intro: '爆款故事建構：logline、hook、矛盾、升級、payoff、loop。社群短片要加 Social Growth 檢查。',
          fields: [
            { key: 'logline', label: '一句話 logline', type: 'text', required: true },
            { key: 'hook', label: '前 2 秒 hook', type: 'textarea', required: true },
            { key: 'desire_obstacle', label: '角色渴望 + 障礙/矛盾', type: 'textarea' },
            { key: 'escalation_payoff', label: '升級路徑 + payoff 邏輯', type: 'textarea' },
            { key: 'loop_replay_share', label: 'loop trigger / replay detail / share frame', type: 'textarea' },
            { key: 'platform_spec', label: '平台 / 比例 / 時長', type: 'text', hint: '例：IG Reels / 9:16 / 15s' },
            { key: 'visual_style', label: '視覺風格方向', type: 'text' },
            { key: 'social_growth', label: 'Social Growth 檢查（社群短片）', type: 'textarea', hint: 'scroll-stop hook / 留存 / 分享觸發 / 收藏理由 / 留言誘因 / 系列潛力。' },
            { key: 'shot_estimate', label: '預估鏡頭數', type: 'text', hint: '15s 約 5-6 顆、30s 約 6-8 顆。' },
          ],
        },
        {
          cmd: '/script-review', title: '劇本審核 — Script Quality Reviewer',
          intro: '進分鏡前審劇本（除非明確跳過）。壞消息先講。',
          fields: [
            { key: 'pass_revise', label: 'pass / revise 建議', type: 'select', required: true, options: ['pass 可進分鏡', 'revise 需修改', 'hold 暫緩'] },
            { key: 'quality_score', label: '品質分數 + 品牌適配分', type: 'text' },
            { key: 'biggest_problem', label: '最大問題', type: 'textarea', required: true },
            { key: 'required_changes', label: '必要修改', type: 'textarea' },
            { key: 'preserved_strengths', label: '保留的優點', type: 'textarea' },
          ],
        },
        {
          cmd: '/look-dev', title: '視覺風格系統 — Look Development Director',
          intro: '不要預設黏土風。先定義風格，prompt 再繼承。讀 brand_core_manifest 的 ip_style_type 載 preset。',
          fields: [
            { key: 'style_mode', label: '視覺風格模式', type: 'textarea', required: true, hint: '3D / 寫實背景+風格化角色 / 繪本 / 玩具攝影 / 定格 / 混合媒材…' },
            { key: 'char_render', label: '角色渲染風格', type: 'text' },
            { key: 'bg_render', label: '背景渲染風格', type: 'text' },
            { key: 'material_color', label: '材質/質地 + 色彩/對比規則', type: 'textarea' },
            { key: 'lighting_realism', label: '燈光寫實程度 + 鏡頭關係', type: 'text' },
            { key: 'style_drift', label: '風格漂移風險與 negative controls', type: 'textarea' },
          ],
        },
        {
          cmd: '/boards', title: '三大規劃板 — Board A / B / C',
          intro: '三板都是必交付物。承接 /look-dev 的風格。',
          fields: [
            { key: 'board_a', label: 'Board A — 角色/世界/道具', type: 'textarea', required: true, hint: '身份、視角、色盤、服裝規則、必備道具、不可變規則、爆款公式卡。' },
            { key: 'board_b', label: 'Board B — 場景轉換/空間策略', type: 'textarea', hint: '環境旅程、空間邏輯、成功/失敗路徑、動作策略圖。' },
            { key: 'board_c', label: 'Board C — 分鏡/節奏/Kling 資產板', type: 'textarea', hint: '9:16 分鏡格、時長、機位、情緒節拍、timing mini-bar、視覺焦點、資產需求、prompt 狀態。' },
          ],
        },
        {
          cmd: '/shots', title: '受控鏡頭表 — Shot List',
          intro: '別因為一個動作有多個內部節拍就加鏡頭——那些放 /timing。',
          fields: [
            { key: 'shot_list', label: '鏡頭表', type: 'textarea', required: true, hint: '每顆：編號+名稱 / 時長 / function(hook|setup|payoff|release|transition|integrated) / 視覺描述 / 機位移動 / 情緒 / 視覺焦點 / 連戲道具 / 資產型態(first|first_end|integrated)。' },
          ],
        },
        {
          cmd: '/timing', title: '內部動作節奏 — Timing',
          intro: '把每顆非 integrated 鏡頭拆成 timecode 節拍。節拍留在鏡頭內，不另生圖。',
          fields: [
            { key: 'timing_beats', label: '逐鏡 timing 節拍', type: 'textarea', required: true, hint: '例：Shot04 0.0-1.2 第一次伸手差5cm；1.2-2.2 差1cm…；Asset remains: first+end only。' },
            { key: 'performance_intent', label: '重點鏡頭表演意圖', type: 'textarea' },
          ],
        },
        {
          cmd: '/asset-map', title: 'Kling 資產控制 — Asset Map',
          intro: '預設一鏡＝一首禎。只有主 payoff / 明確轉變 / 結束態需精確時才用首+尾禎。',
          fields: [
            { key: 'asset_table', label: '資產對照表', type: 'textarea', required: true, hint: 'Shot | GPT asset | Kling input | Needs end frame | Reason。integrated 鏡頭不產資產。' },
          ],
        },
        {
          cmd: '/prompts', title: 'GPT 影像 prompt',
          intro: '每個影像資產一組 prompt（非每個節拍）。繼承 /look-dev。有角色資產時每個 prompt 要加角色鎖定段。',
          note: '此階段產出的是 prompt 文字；實際生圖請搭配 GPT Image / Midjourney / Nano Banana 等工具。',
          fields: [
            { key: 'gpt_prompts', label: 'GPT prompts（分層）', type: 'textarea', required: true, hint: '用分層段落：LOOK DEVELOPMENT / DIRECTOR / CHARACTER / CAMERA / LIGHTING / ART DIRECTION / SCENE / CONTINUITY。' },
            { key: 'critic_note', label: '（建議）/critic prompts 自審', type: 'textarea', hint: '送生圖前指定角色挑至少 3 個失敗點 + 會在哪爆 + 最低修正門檻。' },
          ],
        },
        {
          cmd: '/kling', title: 'Kling 動態 prompt',
          intro: '每個非 integrated 鏡頭一組。含 Action/Camera/Performance/Acting constraints/Timing/Micro-movements/Continuity/Avoid。有聲音指南時加 Voice/Sound 欄。',
          note: '此階段產出 prompt 文字；實際生影請用 Kling I2V（首禎鎖定）或 Seedance 2。',
          fields: [
            { key: 'kling_prompts', label: 'Kling prompts', type: 'textarea', required: true, hint: '逐鏡：用首禎當錨點，有尾禎則自然過渡。含動作/機位/表演/約束/節奏/微動作/連戲/避免項；說話鏡頭加台詞觸發嘴型 + 嘴型控制約束 + 情緒殘留 + 微動作鏈。' },
            { key: 'redteam_note', label: '（建議）/redteam kling 自審', type: 'textarea', hint: '消耗 Kling 額度前，假設會失敗、列至少 5 個攻擊角度 + 最糟情況 + 改變判斷的條件。' },
          ],
        },
        {
          cmd: '/export', title: '互動 HTML 匯出',
          intro: '用 build_storyboard_html.py 產出功能性互動 HTML（非純文字）。每個完整專案必含 Board A/B/C + 互動 HTML。',
          fields: [
            { key: 'export_notes', label: '匯出檢查 / 缺口', type: 'textarea', hint: '確認含 Board A/B/C、shot cards、asset legend、GPT 首/尾禎 tab、Kling tab、copy 按鈕、completion checkbox、localStorage 進度。' },
          ],
        },
        // ── 社群 / 商業分支（可選，依專案需要）──
        {
          cmd: '/endorsement', title: '商業代言適配 — Commercial Partnership Strategist',
          intro: '含業配/品牌合作/sponsor 時用。適配未通過前不進 boards/prompts/social-posts。建議 /critic endorsement。',
          optional: true,
          fields: [
            { key: 'partner_product', label: '合作對象 / 產品', type: 'text', required: true },
            { key: 'why_credible', label: 'IP/角色為何能可信地一起出現', type: 'textarea' },
            { key: 'integration_type', label: '整合方式', type: 'text', hint: 'native story / 道具 / 視覺梗 / 實用工具 / 環境贊助 / 明示代言。' },
            { key: 'claims', label: '必說 claim / 須避免 claim + 揭露需求', type: 'textarea' },
            { key: 'recommendation', label: '建議：approve / revise / reject', type: 'select', options: ['approve', 'revise', 'reject'] },
          ],
        },
        {
          cmd: '/social-strategy', title: '社群內容企劃 — Social Content Strategist',
          intro: '寫 caption 前先過策略：目標、受眾關係、平台角色、內容支柱、語氣、互動、節奏。',
          optional: true,
          fields: [
            { key: 'objective_audience', label: '社群目標 + 受眾關係', type: 'textarea', required: true },
            { key: 'content_pillar', label: '內容支柱', type: 'text', hint: '角色日記 / 世界觀 / 產品故事 / 幕後 / 社群提問 / 公告 / campaign beat。' },
            { key: 'format_voice', label: '格式建議 + 角色聲音策略', type: 'textarea' },
            { key: 'interaction_series', label: '互動設計 + 系列節奏', type: 'textarea' },
            { key: 'approval', label: '建議：approve / revise / hold', type: 'select', options: ['approve', 'revise', 'hold'] },
          ],
        },
        {
          cmd: '/social-posts', title: 'IG / FB 社群包 — Social Content Editor',
          intro: '把素材轉成平台貼文。發佈不可逆，建議 /redteam social-posts。',
          optional: true,
          fields: [
            { key: 'platform_format', label: '平台 + 格式 + 目標', type: 'text', required: true },
            { key: 'caption_options', label: 'Caption 選項（繁中）', type: 'textarea', required: true },
            { key: 'growth_packaging', label: '首句 / 封面標題 / 分享收藏觸發 / 留言誘因', type: 'textarea' },
            { key: 'cta_hashtags', label: 'CTA + hashtags + alt text', type: 'textarea' },
            { key: 'disclosure', label: '揭露聲明（贊助/合作時）', type: 'text' },
          ],
        },
        {
          cmd: '/media-plan', title: '付費投放規劃 — Media Buying Strategist',
          intro: '只有明確要投放/廣告/A-B test 時才完整跑。不要捏造成效預測。投放前建議 /redteam media-plan（最高風險）。',
          optional: true,
          fields: [
            { key: 'objective_funnel', label: '活動目標 + 漏斗階段', type: 'text', required: true },
            { key: 'audience_segments', label: '受眾分群', type: 'textarea' },
            { key: 'placements_variants', label: '版位 + 創意變體', type: 'textarea' },
            { key: 'ab_kpi', label: 'A/B 測試計畫（一次一變數）+ KPI', type: 'textarea' },
            { key: 'budget_recommendation', label: '預算假設 + 建議（approve/revise/test small/hold）', type: 'textarea' },
          ],
        },
      ],
    },

    // ═══════════════ 4) MULTI-PARTY DISCUSSION ═══════════════
    'multi-party-discussion': {
      label: '多方討論 Multi-Party',
      summary: '管理 Ray 與多個 AI（Claude/Codex/Gemini）之間的多輪議題討論，確保每議題有完整紀錄、清楚觀點歸屬、明確決策脈絡。同角色多人共識也走這裡。',
      outputs: ['AI和我的多方討論集/YYYY-MM-DD_議題.md', 'README 討論清單列'],
      stages: [
        {
          cmd: '/new', title: '開啟新討論',
          intro: '「開三方討論：[主題]」時用。建立討論檔、填背景與初始觀點、列給下一位 AI 的問題。',
          fields: [
            { key: 'topic', label: '議題名稱', type: 'text', required: true },
            { key: 'purpose', label: '議題（一句話說明目的）', type: 'text', required: true },
            { key: 'background', label: '背景（為什麼討論、現況）', type: 'textarea', required: true },
            { key: 'ray_view', label: 'Ray 的想法 / 原始立場', type: 'textarea' },
            { key: 'claude_view', label: 'Claude Code 的初始觀點', type: 'textarea', required: true },
            { key: 'next_ai_questions', label: '給下一位 AI 的具體問題', type: 'textarea', required: true, hint: '列出要 Codex / Gemini 回答的問題；並寫清楚要帶哪個檔案路徑過去。' },
          ],
        },
        {
          cmd: '/add-round', title: '加入新一輪回應（可重複）',
          intro: '帶回某 AI 的回應時用。加進對應發言者區塊、更新狀態摘要、必要時列差異。',
          repeatable: true,
          fields: [
            { key: 'speaker', label: '發言者', type: 'select', required: true, options: ['Codex', 'Antigravity (Gemini)', 'Ray', 'Claude Code', '其他 AI'] },
            { key: 'round_content', label: '本輪內容 / 立場', type: 'textarea', required: true },
            { key: 'status_update', label: '當前狀態摘要更新', type: 'textarea', hint: '進度、已共識點、待討論點、下一位發言 AI。' },
            { key: 'diff_note', label: '差異整理（共識 vs 分歧）', type: 'textarea' },
          ],
        },
        {
          cmd: '/close', title: '結束討論',
          intro: '「結束三方討論」時用。寫結論：最終決定、為什麼、採納哪些/保留哪些備案。',
          fields: [
            { key: 'final_decision', label: '最終決定', type: 'textarea', required: true },
            { key: 'why', label: '為什麼這樣決定（不只寫結果）', type: 'textarea', required: true },
            { key: 'adopted_reserved', label: '採納的觀點 / 保留為備案的觀點', type: 'textarea' },
            { key: 'followup', label: '後續執行（行動清單 + 檔案路徑）', type: 'textarea' },
            { key: 'status', label: '狀態', type: 'select', options: ['已決定', '已執行'] },
          ],
        },
      ],
    },

    // ═══════════════ 5) IP FULL WORKFLOW（orchestrator）═══════════════
    'ip-full-workflow': {
      label: '全流程導覽 IP Full Workflow',
      summary: 'admin/backend 的全流程單一入口，協調 brand-core → character-consistency-v2 → storyboard-workflow 三模組。用來盤點一個 IP 從品牌到社群/商業輸出的整體進度，不取代各子 skill 的逐階段產出。',
      outputs: ['全流程進度盤點', '各模組產出檔的指標'],
      stages: [
        {
          cmd: '/identify-ip', title: '識別 IP',
          intro: '先識別 IP，別把某 IP 的規則套到另一個（除非明確說共用品牌世界）。',
          fields: [
            { key: 'ip_name', label: 'IP 名稱', type: 'text', required: true },
            { key: 'shares_world', label: '是否與其他 IP 共用品牌世界？', type: 'select', options: ['否（獨立）', '是（共用）'] },
            { key: 'style_type', label: 'ip_style_type', type: 'select', options: ['stylized_3d_toy', 'stylized_2d_anime', 'semi_realistic', 'realistic_human', 'live_action_reference'] },
          ],
        },
        {
          cmd: '/brand-core', title: '上游：品牌核心狀態',
          intro: '確認 brand-core 是否齊備（brand_bible / character_roster / content_rules / story_territories / manifest）。',
          fields: [
            { key: 'brand_core_status', label: 'brand-core 完成度 / 缺口', type: 'textarea', required: true, hint: '哪些檔已有、哪些待補；負責人是誰。' },
          ],
        },
        {
          cmd: '/character-bible', title: '中游：角色聖經狀態',
          intro: '確認各角色的 character bible / 一致性資產進度。角色聖經是分鏡與 prompt 的上游。',
          fields: [
            { key: 'character_status', label: '各角色 bible 完成度 / 缺口', type: 'textarea', required: true, hint: '逐角色：身份卡/錨點/比例/表演/表情動作/造型/延展是否齊備。' },
            { key: 'voice_guidelines', label: 'voice_acting_guidelines 是否存在', type: 'select', options: ['有', '沒有（進 /kling 前要先補 /step5i）'] },
          ],
        },
        {
          cmd: '/storyboard', title: '下游：分鏡/社群/商業狀態',
          intro: '確認各專案的 storyboard / social / commercial 產出進度。',
          fields: [
            { key: 'storyboard_status', label: '各短片專案進度 / 缺口', type: 'textarea', required: true, hint: '逐專案：brief/script/look-dev/boards/shots/timing/asset/prompt/kling/social 到哪。' },
          ],
        },
        {
          cmd: '/overview', title: '全流程盤點結論',
          intro: '彙整三模組進度，列出本週瓶頸與下一步。',
          fields: [
            { key: 'bottlenecks', label: '本週瓶頸', type: 'textarea', required: true },
            { key: 'next_steps', label: '下一步 / 待指派', type: 'textarea', required: true },
          ],
        },
      ],
    },

  };

  // 顯示順序
  const SKILL_LIST = [
    'brand-core',
    'character-consistency-v2',
    'storyboard-workflow',
    'multi-party-discussion',
    'ip-full-workflow',
  ];

  // 22 角色 → 主 skill（依 roles-data.js 5 主頻道收斂）
  const ROLE_SKILL = {
    1: 'brand-core',
    2: 'character-consistency-v2', 3: 'character-consistency-v2', 4: 'character-consistency-v2',
    5: 'character-consistency-v2', 6: 'character-consistency-v2', 7: 'character-consistency-v2',
    8: 'character-consistency-v2', 9: 'character-consistency-v2',
    10: 'storyboard-workflow', 11: 'storyboard-workflow', 12: 'storyboard-workflow',
    13: 'storyboard-workflow', 14: 'storyboard-workflow', 15: 'storyboard-workflow',
    16: 'storyboard-workflow', 17: 'storyboard-workflow', 18: 'storyboard-workflow',
    19: 'storyboard-workflow', 20: 'storyboard-workflow', 21: 'storyboard-workflow',
    22: 'storyboard-workflow',
  };

  const API = { SKILL_FLOWS, SKILL_LIST, ROLE_SKILL };

  // 純瀏覽器掛 window；node 用於本地驗證走 module.exports。
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) { global.SKILL_FLOWS = SKILL_FLOWS; global.SKILL_LIST = SKILL_LIST; global.ROLE_SKILL = ROLE_SKILL; }

})(typeof window !== 'undefined' ? window : this);
