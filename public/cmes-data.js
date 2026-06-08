/**
 * Curated Ayurveda CME videos (YouTube embeds).
 * Only videos with "CME" in the title — grouped by clinical disorder categories.
 */
const CME_TOPICS = [
  { id: 'all', label: 'All Topics', icon: 'fa-table-cells-large' },
  { id: 'rheumatoid_arthritis', label: 'Rheumatoid Arthritis', icon: 'fa-bone' },
  { id: 'cervical_spondylosis', label: 'Cervical Spondylosis', icon: 'fa-user-injured' },
  { id: 'ankylosing_spondylitis', label: 'Ankylosing Spondylitis', icon: 'fa-x-ray' },
  { id: 'musculoskeletal', label: 'Musculoskeletal Disorders', icon: 'fa-person-walking' },
  { id: 'vata_disorders', label: 'Vata Disorders', icon: 'fa-wind' },
  { id: 'pitta_disorders', label: 'Pitta Disorders', icon: 'fa-fire-flame-curved' },
  { id: 'kapha_disorders', label: 'Kapha Disorders', icon: 'fa-droplet' },
  { id: 'pain_management', label: 'Pain Management', icon: 'fa-hand-dots' },
  { id: 'migraine', label: 'Migraine & Headache', icon: 'fa-head-side-virus' },
  { id: 'gout_arthritis', label: 'Gout Arthritis', icon: 'fa-shoe-prints' },
  { id: 'diabetes', label: 'Diabetes Management', icon: 'fa-syringe' },
  { id: 'hrudroga', label: 'Hrudroga (Heart Disease)', icon: 'fa-heart-pulse' },
  { id: 'infertility', label: 'Infertility', icon: 'fa-baby' },
  { id: 'liver_disorders', label: 'Liver Disorders', icon: 'fa-lungs' },
  { id: 'lung_infections', label: 'Lung Infections', icon: 'fa-virus' },
  { id: 'kidney_disorders', label: 'Chronic Kidney Disorders', icon: 'fa-filter' },
  { id: 'thyroid', label: 'Thyroid Disorders', icon: 'fa-stethoscope' },
  { id: 'psoriasis', label: 'Psoriasis', icon: 'fa-hand' },
  { id: 'skin_problems', label: 'Skin Problems', icon: 'fa-hand-sparkles' },
  { id: 'hair_problems', label: 'Hair Problems', icon: 'fa-scissors' },
  { id: 'anemia', label: 'Anemic Disorders', icon: 'fa-tint' },
  { id: 'facial_paralysis', label: 'Facial Paralysis', icon: 'fa-face-frown' }
];

const CME_VIDEOS = [
  // Rheumatoid Arthritis (Amavata)
  { id: 'dY99nn_zdaQ', topic: 'rheumatoid_arthritis', title: 'Archive Release: Ayurveda CME on Rheumatoid Arthritis Dr. Gopakumar Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'Clinical CME on Ayurvedic approach to rheumatoid arthritis (Amavata) — diagnosis, pathogenesis, and treatment protocols.' },
  { id: '8epXf_9NZ6g', topic: 'rheumatoid_arthritis', title: 'Archive Release: Ayurveda CME on Rheumatoid Arthritis by Dr. Gopakumar Part II', channel: 'AVP Research Foundation', duration: 'CME', description: 'Continued CME session on Amavata management — herbal formulations, Panchakarma, and follow-up care.' },
  { id: 'uqbZFk_OakY', topic: 'rheumatoid_arthritis', title: 'Archive Release: Ayurveda CME on Rheumatoid Arthritis by Dr. M R Vasudevan Namboothiri Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'Expert CME lecture on rheumatoid arthritis from classical Kerala Ayurveda perspective.' },
  { id: '9DP-x0G1QTI', topic: 'rheumatoid_arthritis', title: 'Archive Release: Ayurveda CME on Rheumatoid Arthritis by Dr. MS Kamat Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME on Amavata — Nidana, Samprapti, and Chikitsa Sutra with case-based discussion.' },
  { id: 'hD54h0B8c8o', topic: 'rheumatoid_arthritis', title: 'Archive Release: CME on Rheumatoid Arthritis by Dr. Gnanaraj, Consultant Orthopaedician Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'Integrative CME bridging orthopaedic and Ayurvedic understanding of rheumatoid arthritis.' },

  // Cervical Spondylosis (Griva Sandhigata Vata / Manyastambha)
  { id: 'iIEGlB222s4', topic: 'cervical_spondylosis', title: 'Archive Release: Ayurveda CME Cervical Spondylosis Dr. Ramesh R Varier, Arya Vaidya Nilayam, Madurai', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME on cervical spondylosis — Greeva Basti, Nasya, and classical Ayurvedic management.' },
  { id: 'JiuSE_eZTig', topic: 'cervical_spondylosis', title: 'Archive Release: Ayurveda CME on Cervical Spondylosis Dr. N.V. Sreevaths Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'Clinical CME covering cervical spine disorders, Vata-Kapha involvement, and treatment planning.' },
  { id: 'R-9InRRiBFI', topic: 'cervical_spondylosis', title: 'Archive Release: Ayurveda CME on Cervical Spondylosis Dr. N.V. Sreevaths Part II', channel: 'AVP Research Foundation', duration: 'CME', description: 'Part II — external therapies, rehabilitation, and lifestyle guidance for cervical spondylosis.' },
  { id: 'GPD-_DD8jqU', topic: 'cervical_spondylosis', title: 'Archive Release: Ayurveda CME on Cervical Spondylosis Dr.Sreekumar Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME session on neck pain and cervical degeneration from Ayurvedic Kayachikitsa viewpoint.' },
  { id: 'CRBBLtC_EOw', topic: 'cervical_spondylosis', title: 'Archive Release: Ayurveda CME on Cervical Spondylosis Dr. Reshmi Sarin', channel: 'AVP Research Foundation', duration: 'CME', description: 'Expert CME on Ayurvedic protocols for cervical spondylosis and radiculopathy.' },

  // Ankylosing Spondylitis (related spinal / inflammatory musculoskeletal)
  { id: 'f-7o4S1CLxg', topic: 'ankylosing_spondylitis', title: 'Virtual CME on Ayurvedic Management of Musculoskeletal Disorders by Prof. Muralidhara Sharma', channel: 'Ayurveda Network BHU', duration: 'CME', description: 'CME on inflammatory and degenerative musculoskeletal disorders including axial spondyloarthropathies.' },
  { id: '_87wJxR4HlE', topic: 'ankylosing_spondylitis', title: 'Archive Release: Ayurveda CME on Lumbar Spondylosis by Dr. B.R.J. Sathish Kumar', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME on spinal spondylosis — relevant for ankylosing and axial spine disorders in Ayurvedic practice.' },
  { id: 'hX5zoR4hoWQ', topic: 'ankylosing_spondylitis', title: 'Archive Release: Ayurveda CME on Rheumatoid Arthritis by Dr. KT Jayakrishnan Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME on inflammatory arthritis management applicable to spondyloarthropathies and joint stiffness.' },

  // Musculoskeletal Disorders
  { id: 'f-7o4S1CLxg', topic: 'musculoskeletal', title: 'Virtual CME on Ayurvedic Management of Musculoskeletal Disorders by Prof. Muralidhara Sharma', channel: 'Ayurveda Network BHU', duration: 'CME', description: 'Comprehensive CME on Sandhivata, Vatavyadhi, and musculoskeletal pain syndromes.' },
  { id: 'sWDqO1Db5mA', topic: 'musculoskeletal', title: 'CME on Mgmt of Joint Disorders with AYURVEDA By Dr Avinash Singh', channel: 'Dr Avinash Singh Chauhan', duration: 'CME', description: 'Clinical CME on joint disorders — OA, RA, and soft-tissue conditions in Ayurvedic OPD/IPD.' },
  { id: 'U0tOaeAAjxU', topic: 'musculoskeletal', title: 'Kairali CME On Ayurvedic Management Of Knee OA', channel: 'Rishabh Marketing Kairali', duration: 'CME', description: 'CME focused on knee osteoarthritis (Janu Sandhigata Vata) — Panchakarma and oral medications.' },
  { id: 'p21sPM-JVpw', topic: 'musculoskeletal', title: 'Archive Release: Ayurveda CME on Osteoarthritis by Dr. Dhanashekara Raja Ganga Hospital Coimbatore', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME on osteoarthritis management — weight-bearing joints, Abhyanga, and Basti protocols.' },

  // Vata Disorders
  { id: 'BFpCD2FcTxU', topic: 'vata_disorders', title: 'AV Pune CME : AmashayGat Vat', channel: 'Ayurved Vyaspeeth Kendriya', duration: 'CME', description: 'CME on Amashaya-gata Vata — a core Vata disorder affecting digestion and systemic Vata vitiation.' },
  { id: 'f-7o4S1CLxg', topic: 'vata_disorders', title: 'Virtual CME on Ayurvedic Management of Musculoskeletal Disorders by Prof. Muralidhara Sharma', channel: 'Ayurveda Network BHU', duration: 'CME', description: 'Vatavyadhi-focused CME covering joint pain, stiffness, and neuromuscular Vata disorders.' },
  { id: 'eKRubrvq7oY', topic: 'vata_disorders', title: '14 CME Dr Shreevathsa Manasa Prakruti in Ayurveda', channel: 'GAMC Bengaluru', duration: 'CME', description: 'CME on Manasa Prakriti and Vata-dominant psychological disorders in Ayurvedic clinical practice.' },
  { id: 'dY99nn_zdaQ', topic: 'vata_disorders', title: 'Archive Release: Ayurveda CME on Rheumatoid Arthritis Dr. Gopakumar Part I', channel: 'AVP Research Foundation', duration: 'CME', description: 'Vata-Kapha disorder CME — Amavata as a prototypical Vata-involved inflammatory condition.' },

  // Pitta Disorders
  { id: 'iE31sqs-hWQ', topic: 'pitta_disorders', title: 'Ayurvedic Interventions for Chronic Liver Disorders_Maharishi Ayurveda CME', channel: 'indianvaidyas', duration: 'CME', description: 'CME on Pitta-dominated liver disorders — Yakrit Roga, Dhatu Agni, and hepatoprotective Ayurvedic care.' },
  { id: '-NjXxfaU-rk', topic: 'pitta_disorders', title: 'DR MURALIDHAR SHARMA | MANAGEMENT OF RAKTAVAHA SROTAS & HEPATOBILIARY DISORDERS | CME | MANGALORE', channel: 'VLTV', duration: 'CME', description: 'CME on Raktavaha Srotas and Pitta-related blood and hepatobiliary disorders.' },
  { id: 'TALGeqpi8wg', topic: 'pitta_disorders', title: '"Role of Ayurvedic Immuno-Modulators in Preventive Health Care" Dabur CME', channel: 'indianvaidyas', duration: 'CME', description: 'CME on Pitta-mediated inflammatory and immune disorders — preventive Ayurvedic interventions.' },

  // Kapha Disorders
  { id: 'rVNwTimXxLA', topic: 'kapha_disorders', title: '"Diabetes Management with Ayurveda" (Dabur CME) Prof. Dr. G. S. Tomar', channel: 'indianvaidyas', duration: 'CME', description: 'CME on Kapha-Meda disorders — Prameha as Santarpanajanya Vyadhi with lifestyle and herbal management.' },
  { id: 'LJQr4tkk1_w', topic: 'kapha_disorders', title: 'MAASD 77th CME Hypothyroidism & Ayurved Dr.Seema Garje MD', channel: 'MAASD', duration: 'CME', description: 'CME on hypothyroidism — Kapha-Vata disorder with Ayurvedic metabolic correction strategies.' },
  { id: 'TALGeqpi8wg', topic: 'kapha_disorders', title: '"Role of Ayurvedic Immuno-Modulators in Preventive Health Care" Dabur CME', channel: 'indianvaidyas', duration: 'CME', description: 'CME addressing Kapha accumulation, Ama, and immune modulation in chronic disorders.' },

  // Pain Management
  { id: 'y0OAgdbz0Bk', topic: 'pain_management', title: 'CME on Pain Management in Ayurveda', channel: 'SEARCH SC', duration: 'CME', description: 'Dedicated CME on Ayurvedic pain management — Vata shamana, external therapies, and analgesic herbs.' },
  { id: 'J1cyUkEMdgA', topic: 'pain_management', title: 'MAASD 100 CME | Pain Management Through Panchakarma | Vd Ramdas Avhad', channel: 'MAASD', duration: 'CME', description: 'CME on Panchakarma-based pain relief — Basti, Kati Basti, and chronic pain protocols.' },
  { id: 'f-7o4S1CLxg', topic: 'pain_management', title: 'Virtual CME on Ayurvedic Management of Musculoskeletal Disorders by Prof. Muralidhara Sharma', channel: 'Ayurveda Network BHU', duration: 'CME', description: 'CME covering joint pain, myalgia, and musculoskeletal pain syndromes in Ayurveda.' },

  // Migraine & Headache (Shirashoola)
  { id: 'Qz7sp0qqQ3Q', topic: 'migraine', title: 'CME on Panchakarma, Amrita School of Ayurveda: Talk by Dr Rajeswari P N', channel: 'Amrita School of Ayurveda', duration: 'CME', description: 'CME on Panchakarma therapies applicable to Shirashoola, migraine, and chronic headache disorders.' },
  { id: 'vBCyiyFgA-E', topic: 'migraine', title: 'Decoding investigations through Ayurveda CME 3rd Aug 2025', channel: 'soushruti', duration: 'CME', description: 'Clinical CME on interpreting modern investigations for headache, migraine, and neurological complaints in Ayurveda.' },
  { id: 'J1cyUkEMdgA', topic: 'migraine', title: 'MAASD 100 CME | Pain Management Through Panchakarma | Vd Ramdas Avhad', channel: 'MAASD', duration: 'CME', description: 'CME on Shirodhara, Nasya, and Panchakarma for chronic headache and migraine management.' },

  // Gout Arthritis (Vatarakta)
  { id: 'sWDqO1Db5mA', topic: 'gout_arthritis', title: 'CME on Mgmt of Joint Disorders with AYURVEDA By Dr Avinash Singh', channel: 'Dr Avinash Singh Chauhan', duration: 'CME', description: 'CME on joint disorders including Vatarakta (gout) — Ama Pachana, diet, and anti-inflammatory protocols.' },
  { id: 'p21sPM-JVpw', topic: 'gout_arthritis', title: 'Archive Release: Ayurveda CME on Osteoarthritis by Dr. Dhanashekara Raja Ganga Hospital Coimbatore', channel: 'AVP Research Foundation', duration: 'CME', description: 'CME on arthritic joint disease management — applicable to gouty and crystal arthropathies in Ayurveda.' },
  { id: 'U0tOaeAAjxU', topic: 'gout_arthritis', title: 'Kairali CME On Ayurvedic Management Of Knee OA', channel: 'Rishabh Marketing Kairali', duration: 'CME', description: 'CME on joint inflammation and pain — relevant for gout arthritis and hyperuricemia management.' },

  // Diabetes Management (Prameha / Madhumeha)
  { id: 'rVNwTimXxLA', topic: 'diabetes', title: '"Diabetes Management with Ayurveda" (Dabur CME) Prof. Dr. G. S. Tomar', channel: 'indianvaidyas', duration: 'CME', description: 'CME on Prameha Chikitsa — Nidana Parivarjana, Ahara-Vihara, and herbal antidiabetic formulations.' },
  { id: 'VnXU4aN0IYA', topic: 'diabetes', title: 'Virtual CME On Ayurvedic Management Of Diabetes', channel: 'Rishabh Marketing Kairali', duration: 'CME', description: 'Virtual CME on diabetes mellitus — Agni deepana, Meda hara, and complication prevention in Ayurveda.' },
  { id: '0_fxvUT8-ZU', topic: 'diabetes', title: 'Ayurvedic Management of Diabetes (Virtual CME Naturefit x Kairali)', channel: 'NatureFit', duration: 'CME', description: 'Clinical CME on integrative diabetes care — glycemic control through Ayurvedic diet and therapies.' },

  // Hrudroga (Heart Disease)
  { id: 'KTmYRyhFAn0', topic: 'hrudroga', title: 'CME for Ayurvedic doctors and students on Hypertension Management with Ayurveda', channel: 'Bhrigu Healthconnect', duration: 'CME', description: 'CME on Hridroga and hypertension — Raktavaha Srotas, Hridya herbs, and cardiac lifestyle in Ayurveda.' },
  { id: '-NjXxfaU-rk', topic: 'hrudroga', title: 'DR MURALIDHAR SHARMA | MANAGEMENT OF RAKTAVAHA SROTAS & HEPATOBILIARY DISORDERS | CME | MANGALORE', channel: 'VLTV', duration: 'CME', description: 'CME on Raktavaha Srotas disorders — cardiovascular and circulatory management in Ayurvedic practice.' },

  // Infertility (Vandhyatva)
  { id: 'xoXvzazWTFc', topic: 'infertility', title: 'MAASD 97th CME | Infertility Management in Ayurveda | Dr. Seema Mehre (MS)', channel: 'MAASD', duration: 'CME', description: 'CME on Vandhyatva — Beeja-Kshetra-Ambu-Ritu assessment and Ayurvedic fertility protocols.' },
  { id: 'K6BzpBCndSA', topic: 'infertility', title: 'CME on Panchakarma, Amrita School of Ayurveda: Talk by Dr Ashvini Kumar M', channel: 'Amrita School of Ayurveda', duration: 'CME', description: 'CME on Panchakarma for reproductive health — Uttara Basti and detox for infertility management.' },

  // Liver Disorders (Yakrit Roga)
  { id: 'iE31sqs-hWQ', topic: 'liver_disorders', title: 'Ayurvedic Interventions for Chronic Liver Disorders_Maharishi Ayurveda CME', channel: 'indianvaidyas', duration: 'CME', description: 'CME on chronic liver disease — Yakrit Vikara, Pitta shamana, and hepatoprotective Rasayana therapy.' },
  { id: '-NjXxfaU-rk', topic: 'liver_disorders', title: 'DR MURALIDHAR SHARMA | MANAGEMENT OF RAKTAVAHA SROTAS & HEPATOBILIARY DISORDERS | CME | MANGALORE', channel: 'VLTV', duration: 'CME', description: 'CME on hepatobiliary disorders — jaundice, fatty liver, and gallbladder conditions in Ayurveda.' },

  // Lung Infections (Kasa, Shwasa, Pratishyaya)
  { id: '23V-iTftmfo', topic: 'lung_infections', title: 'CME - Lung disorders', channel: 'Arya Vaidya Sala Kottakkal', duration: 'CME', description: 'CME on respiratory and lung disorders — Kasa, Shwasa, and infectious pulmonary conditions in Ayurveda.' },

  // Chronic Kidney Disorders (Mutraghata / Vrikka Roga)
  { id: 'T25ZvfrWjU8', topic: 'kidney_disorders', title: 'CME on CKD and Holistic approach to Health', channel: 'Tejas Bagur', duration: 'CME', description: 'CME on chronic kidney disease — Mutravaha Srotas, Basti therapy, and renal-friendly Ayurvedic care.' },
  { id: '6CDUREB6j8k', topic: 'kidney_disorders', title: 'MAASD 98th CME | Critical Care Management in Ayurveda | Expert Clinical Insights', channel: 'MAASD', duration: 'CME', description: 'CME on critical care including renal failure support and emergency Ayurvedic interventions.' },

  // Thyroid Disorders (Galaganda / Hypothyroidism)
  { id: 'H0Nw_2i16Kw', topic: 'thyroid', title: 'MAASD 101st CME | Reversing Thyroid Disorders Through Ayurved', channel: 'MAASD', duration: 'CME', description: 'CME on thyroid disorders — Galaganda, hypothyroidism, and metabolic correction through Ayurveda.' },
  { id: 'LJQr4tkk1_w', topic: 'thyroid', title: 'MAASD 77th CME Hypothyroidism & Ayurved Dr.Seema Garje MD', channel: 'MAASD', duration: 'CME', description: 'CME on hypothyroidism management — Kapha-Vata balancing, Agni restoration, and herbal support.' },

  // Psoriasis (Kushtha / Ekakushtha)
  { id: 'x-Z-60rZfko', topic: 'psoriasis', title: 'MAASD 99th CME | Psoriasis Ayurvedic Management | Vd. Aniruddha Kulkarni | Clinical Approach', channel: 'MAASD', duration: 'CME', description: 'CME on psoriasis (Kitibha/Ekakushtha) — Shodhana, Shamana, and diet-lifestyle protocols.' },
  { id: 'GLySP0arYrA', topic: 'psoriasis', title: '#MAASD 9th #CME | #PSORIASIS Part 2 | DrGaurang Joshi Rajkot', channel: 'MAASD', duration: 'CME', description: 'Part II CME on psoriasis — Panchakarma, Lepa, and long-term Kushtha management.' },

  // Skin Problems
  { id: 'e2DvUmscjs0', topic: 'skin_problems', title: 'Common Dermatological Disorders | Dr Jayasree M | Ananthapuri CME Series', channel: 'KGMOA Thiruvananthapuram', duration: 'CME', description: 'CME on common skin disorders — eczema, urticaria, and inflammatory dermatoses in Ayurvedic dermatology.' },
  { id: '46WrQkte1ks', topic: 'skin_problems', title: 'cme program -Acne -management ssims -dr shashikala.p.krishnamurthy', channel: 'Shashikala Krishnamurthy', duration: 'CME', description: 'CME on acne (Yauvan Pidika) — Pitta-Kapha skin disorder management with Ayurvedic protocols.' },
  { id: 'x-Z-60rZfko', topic: 'skin_problems', title: 'MAASD 99th CME | Psoriasis Ayurvedic Management | Vd. Aniruddha Kulkarni | Clinical Approach', channel: 'MAASD', duration: 'CME', description: 'CME on Kushtha classification and skin disease management applicable to chronic dermatological conditions.' },

  // Hair Problems (Khalitya / Indralupta)
  { id: '3P9X1_bljQY', topic: 'hair_problems', title: 'CME ON SFG TRICHOLOGY - PATCHY HAIR LOSS', channel: 'Hidoc Dr.', duration: 'CME', description: 'CME on patchy hair loss and alopecia — clinical assessment and treatment approaches including Ayurvedic trichology.' },

  // Anemic Disorders (Pandu / Kamala)
  { id: '-NjXxfaU-rk', topic: 'anemia', title: 'DR MURALIDHAR SHARMA | MANAGEMENT OF RAKTAVAHA SROTAS & HEPATOBILIARY DISORDERS | CME | MANGALORE', channel: 'VLTV', duration: 'CME', description: 'CME on Raktavaha Srotas — Pandu, Kamala, and blood disorders with Ayurvedic hematinic and Pitta management.' },

  // Facial Paralysis (Pakshaghata / Ardita)
  { id: 'kRGxTrbWcDY', topic: 'facial_paralysis', title: 'DR. RAVISHANKAR PERVAJE | CME ON MANAGEMENT OF PAKSHAGATHA AYURVEDIC APPROACH | SHARADA HOSPITAL', channel: 'VLTV', duration: 'CME', description: 'CME on Pakshaghata — facial paralysis and hemiplegia with Nasya, Snehana, and Basti protocols.' },
  { id: 'dXBwINpYB3Y', topic: 'facial_paralysis', title: 'MAASD 93rd CME | 6th NERVE PALSY Part 2 | DrNutan Radaye MS', channel: 'MAASD', duration: 'CME', description: 'CME on cranial nerve palsy including facial nerve involvement — Ayurvedic and integrative management.' },
  { id: '7IFMMhOmjRk', topic: 'facial_paralysis', title: 'MAASD 93rd CME part 1 | Dr Nutan Radaye HOD Shalakya Dept YMT AMC Navi Mumbai', channel: 'MAASD', duration: 'CME', description: 'Part I CME on facial nerve disorders and Shalakya Tantra approach to paralysis conditions.' }
];

/** Deduplicate by YouTube id while keeping first occurrence */
function getUniqueVideos(videos) {
  const seen = new Set();
  return videos.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}

/** Pick the best catalog row for a video when filtering by topic */
function getVideoMeta(youtubeId, preferredTopic) {
  if (preferredTopic && preferredTopic !== 'all') {
    const match = CME_VIDEOS.find((v) => v.id === youtubeId && v.topic === preferredTopic);
    if (match) return match;
  }
  return CME_VIDEOS.find((v) => v.id === youtubeId);
}

function getVideosForTopic(topicId) {
  const unique = getUniqueVideos(CME_VIDEOS);
  if (topicId === 'all') return unique;
  const ids = new Set(CME_VIDEOS.filter((v) => v.topic === topicId).map((v) => v.id));
  return unique
    .filter((v) => ids.has(v.id))
    .map((v) => getVideoMeta(v.id, topicId) || v);
}

function countByTopic(topicId) {
  if (topicId === 'all') return getUniqueVideos(CME_VIDEOS).length;
  return new Set(CME_VIDEOS.filter((v) => v.topic === topicId).map((v) => v.id)).size;
}

const CME_CHANNELS = [
  { name: 'AVP Research Foundation', url: 'https://www.youtube.com/@PRKrishnakumarJisAVPResearchFoundation', handle: '@PRKrishnakumarJisAVPResearchFoundation' },
  { name: 'MAASD', url: 'https://www.youtube.com/@MAASD', handle: '@MAASD' },
  { name: 'VLTV', url: 'https://www.youtube.com/@VLTV', handle: '@VLTV' },
  { name: 'Amrita School of Ayurveda', url: 'https://www.youtube.com/@AmritaSchoolofAyurveda', handle: '@AmritaSchoolofAyurveda' },
  { name: 'Arya Vaidya Sala Kottakkal', url: 'https://www.youtube.com/@AryaVaidyaSalaKottakkal', handle: '@AryaVaidyaSalaKottakkal' },
  { name: 'Ayurveda Network BHU', url: 'https://www.youtube.com/@AyurvedaNetworkBHU', handle: '@AyurvedaNetworkBHU' },
  { name: 'Indian Vaidyas (Dabur CME)', url: 'https://www.youtube.com/@indianvaidyas', handle: '@indianvaidyas' }
];
