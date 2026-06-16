// ─────────────────────────────────────────────────────────────────────────────
// AI Rank Tracker · i18n Translation Dictionary
// 9 P1 languages: EN, AR (RTL), IT, NL, ZH, ES, FR, DE, PT-BR
// Namespace: nav.* | scan.*
// ─────────────────────────────────────────────────────────────────────────────

export type Locale = 'en' | 'ar' | 'it' | 'nl' | 'zh' | 'es' | 'fr' | 'de' | 'pt-br'

export const RTL_LOCALES: Locale[] = ['ar']

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  it: 'Italiano',
  nl: 'Nederlands',
  zh: '中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-br': 'Português (BR)',
}

export type TranslationDict = Record<string, string>

const en: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'GEO/AEO Visibility Scanner',

  'scan.badge': 'Free AI Visibility Scan',
  'scan.hero.title': 'Does AI Know Your Brand?',
  'scan.hero.subtitle':
    'Enter your brand URL to check your AI Visibility Score across answer engines like Perplexity.',

  'scan.form.url.label': 'Brand URL',
  'scan.form.url.placeholder': 'https://yourbrand.com',
  'scan.form.providers.label': 'Providers',
  'scan.form.providers.mock': 'Mock (demo, instant)',
  'scan.form.providers.perplexity': 'Perplexity (live)',
  'scan.form.cta': 'Run AI Scan',

  'scan.scanning': 'Scanning…',
  'scan.scanning.desc': 'Querying AI engines and scoring your visibility…',

  'scan.score.label': 'AI Visibility Score',
  'scan.score.subtitle': 'out of 100',

  'scan.results.mentionRate': 'Mention Rate',
  'scan.results.citationRate': 'Citation Rate',
  'scan.results.engines': 'Engines',
  'scan.results.prompts': 'Prompts',
  'scan.results.gaps': 'Coverage Gaps',
  'scan.results.recommendations': 'Recommendations',
  'scan.results.scanAgain': '← Scan another brand',

  'scan.error.title': 'Scan failed',
  'scan.error.retry': 'Try again',

  'scan.validation.url': 'Please enter a valid URL, e.g. https://yourbrand.com',
  'scan.validation.provider': 'Select at least one provider',
}

const ar: TranslationDict = {
  'nav.title': 'متتبّع ترتيب الذكاء الاصطناعي',
  'nav.tagline': 'ماسح ظهور GEO/AEO',

  'scan.badge': 'فحص رؤية ذكاء اصطناعي مجاني',
  'scan.hero.title': 'هل يعرف الذكاء الاصطناعي علامتك التجارية؟',
  'scan.hero.subtitle':
    'أدخل رابط علامتك التجارية للتحقق من درجة رؤيتك عبر محركات الإجابة مثل Perplexity.',

  'scan.form.url.label': 'رابط العلامة التجارية',
  'scan.form.url.placeholder': 'https://yourbrand.com',
  'scan.form.providers.label': 'المزودون',
  'scan.form.providers.mock': 'محاكاة (تجريبي، فوري)',
  'scan.form.providers.perplexity': 'Perplexity (مباشر)',
  'scan.form.cta': 'تشغيل فحص الذكاء الاصطناعي',

  'scan.scanning': 'جارٍ الفحص…',
  'scan.scanning.desc': 'استعلام محركات الذكاء الاصطناعي وتسجيل رؤيتك…',

  'scan.score.label': 'درجة رؤية الذكاء الاصطناعي',
  'scan.score.subtitle': 'من 100',

  'scan.results.mentionRate': 'معدل الإشارة',
  'scan.results.citationRate': 'معدل الاستشهاد',
  'scan.results.engines': 'المحركات',
  'scan.results.prompts': 'الأسئلة',
  'scan.results.gaps': 'ثغرات التغطية',
  'scan.results.recommendations': 'التوصيات',
  'scan.results.scanAgain': 'فحص علامة أخرى ←',

  'scan.error.title': 'فشل الفحص',
  'scan.error.retry': 'حاول مرة أخرى',

  'scan.validation.url': 'يرجى إدخال رابط صحيح، مثال: https://yourbrand.com',
  'scan.validation.provider': 'اختر مزوداً واحداً على الأقل',
}

const it: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'Scanner Visibilità GEO/AEO',

  'scan.badge': 'Scansione AI visibilità gratuita',
  'scan.hero.title': "L'AI conosce il tuo brand?",
  'scan.hero.subtitle':
    "Inserisci l'URL del tuo brand per verificare il tuo AI Visibility Score sui motori di risposta come Perplexity.",

  'scan.form.url.label': 'URL Brand',
  'scan.form.url.placeholder': 'https://yourbrand.com',
  'scan.form.providers.label': 'Provider',
  'scan.form.providers.mock': 'Mock (demo, istantaneo)',
  'scan.form.providers.perplexity': 'Perplexity (live)',
  'scan.form.cta': 'Avvia scansione AI',

  'scan.scanning': 'Scansione in corso…',
  'scan.scanning.desc': "Interrogazione dei motori AI e calcolo della visibilità…",

  'scan.score.label': 'AI Visibility Score',
  'scan.score.subtitle': 'su 100',

  'scan.results.mentionRate': 'Tasso di menzione',
  'scan.results.citationRate': 'Tasso di citazione',
  'scan.results.engines': 'Motori',
  'scan.results.prompts': 'Prompt',
  'scan.results.gaps': 'Lacune di copertura',
  'scan.results.recommendations': 'Raccomandazioni',
  'scan.results.scanAgain': '← Scansiona un altro brand',

  'scan.error.title': 'Scansione fallita',
  'scan.error.retry': 'Riprova',

  'scan.validation.url': 'Inserisci un URL valido, es. https://yourbrand.com',
  'scan.validation.provider': 'Seleziona almeno un provider',
}

const nl: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'GEO/AEO Zichtbaarheidsscanner',

  'scan.badge': 'Gratis AI-zichtbaarheidsscan',
  'scan.hero.title': 'Kent AI jouw merk?',
  'scan.hero.subtitle':
    'Voer je merk-URL in om je AI Visibility Score te berekenen via antwoordmotoren zoals Perplexity.',

  'scan.form.url.label': 'Merk-URL',
  'scan.form.url.placeholder': 'https://jemerk.com',
  'scan.form.providers.label': 'Providers',
  'scan.form.providers.mock': 'Mock (demo, direct)',
  'scan.form.providers.perplexity': 'Perplexity (live)',
  'scan.form.cta': 'AI-scan starten',

  'scan.scanning': 'Scannen…',
  'scan.scanning.desc': 'AI-engines bevragen en zichtbaarheid berekenen…',

  'scan.score.label': 'AI Visibility Score',
  'scan.score.subtitle': 'van 100',

  'scan.results.mentionRate': 'Vermeldingsgraad',
  'scan.results.citationRate': 'Citatiegraad',
  'scan.results.engines': 'Engines',
  'scan.results.prompts': 'Prompts',
  'scan.results.gaps': 'Dekkingsgaten',
  'scan.results.recommendations': 'Aanbevelingen',
  'scan.results.scanAgain': '← Scan een ander merk',

  'scan.error.title': 'Scan mislukt',
  'scan.error.retry': 'Opnieuw proberen',

  'scan.validation.url': 'Voer een geldige URL in, bijv. https://jemerk.com',
  'scan.validation.provider': 'Selecteer ten minste één provider',
}

const zh: TranslationDict = {
  'nav.title': 'AI 排名追踪器',
  'nav.tagline': 'GEO/AEO 可见度扫描器',

  'scan.badge': '免费 AI 可见度扫描',
  'scan.hero.title': 'AI 了解您的品牌吗？',
  'scan.hero.subtitle':
    '输入您的品牌 URL，获取跨答案引擎（如 Perplexity）的 AI 可见度评分。',

  'scan.form.url.label': '品牌 URL',
  'scan.form.url.placeholder': 'https://yourbrand.com',
  'scan.form.providers.label': '提供商',
  'scan.form.providers.mock': '模拟（演示，即时）',
  'scan.form.providers.perplexity': 'Perplexity（实时）',
  'scan.form.cta': '运行 AI 扫描',

  'scan.scanning': '扫描中…',
  'scan.scanning.desc': '正在查询 AI 引擎并计算可见度…',

  'scan.score.label': 'AI 可见度评分',
  'scan.score.subtitle': '满分 100',

  'scan.results.mentionRate': '提及率',
  'scan.results.citationRate': '引用率',
  'scan.results.engines': '引擎',
  'scan.results.prompts': '提示词',
  'scan.results.gaps': '覆盖空白',
  'scan.results.recommendations': '建议',
  'scan.results.scanAgain': '← 扫描另一个品牌',

  'scan.error.title': '扫描失败',
  'scan.error.retry': '重试',

  'scan.validation.url': '请输入有效的 URL，例如 https://yourbrand.com',
  'scan.validation.provider': '请至少选择一个提供商',
}

const es: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'Escáner de visibilidad GEO/AEO',

  'scan.badge': 'Escaneo de visibilidad IA gratuito',
  'scan.hero.title': '¿La IA conoce tu marca?',
  'scan.hero.subtitle':
    'Ingresa la URL de tu marca para verificar tu puntuación de visibilidad IA en motores de respuesta como Perplexity.',

  'scan.form.url.label': 'URL de la marca',
  'scan.form.url.placeholder': 'https://tumarca.com',
  'scan.form.providers.label': 'Proveedores',
  'scan.form.providers.mock': 'Mock (demo, instantáneo)',
  'scan.form.providers.perplexity': 'Perplexity (en vivo)',
  'scan.form.cta': 'Ejecutar escaneo IA',

  'scan.scanning': 'Escaneando…',
  'scan.scanning.desc': 'Consultando motores IA y calculando tu visibilidad…',

  'scan.score.label': 'Puntuación de visibilidad IA',
  'scan.score.subtitle': 'de 100',

  'scan.results.mentionRate': 'Tasa de mención',
  'scan.results.citationRate': 'Tasa de citación',
  'scan.results.engines': 'Motores',
  'scan.results.prompts': 'Prompts',
  'scan.results.gaps': 'Brechas de cobertura',
  'scan.results.recommendations': 'Recomendaciones',
  'scan.results.scanAgain': '← Escanear otra marca',

  'scan.error.title': 'Escaneo fallido',
  'scan.error.retry': 'Reintentar',

  'scan.validation.url': 'Ingresa una URL válida, p. ej. https://tumarca.com',
  'scan.validation.provider': 'Selecciona al menos un proveedor',
}

const fr: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'Scanner de visibilité GEO/AEO',

  'scan.badge': 'Scan de visibilité IA gratuit',
  'scan.hero.title': "L'IA connaît-elle votre marque ?",
  'scan.hero.subtitle':
    "Entrez l'URL de votre marque pour vérifier votre score de visibilité IA sur des moteurs de réponse comme Perplexity.",

  'scan.form.url.label': 'URL de la marque',
  'scan.form.url.placeholder': 'https://votremarque.com',
  'scan.form.providers.label': 'Fournisseurs',
  'scan.form.providers.mock': 'Mock (démo, instantané)',
  'scan.form.providers.perplexity': 'Perplexity (en direct)',
  'scan.form.cta': 'Lancer le scan IA',

  'scan.scanning': 'Scan en cours…',
  'scan.scanning.desc': 'Interrogation des moteurs IA et calcul de votre visibilité…',

  'scan.score.label': 'Score de visibilité IA',
  'scan.score.subtitle': 'sur 100',

  'scan.results.mentionRate': 'Taux de mention',
  'scan.results.citationRate': 'Taux de citation',
  'scan.results.engines': 'Moteurs',
  'scan.results.prompts': 'Prompts',
  'scan.results.gaps': 'Lacunes de couverture',
  'scan.results.recommendations': 'Recommandations',
  'scan.results.scanAgain': '← Scanner une autre marque',

  'scan.error.title': 'Scan échoué',
  'scan.error.retry': 'Réessayer',

  'scan.validation.url': 'Entrez une URL valide, ex. https://votremarque.com',
  'scan.validation.provider': 'Sélectionnez au moins un fournisseur',
}

const de: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'GEO/AEO Sichtbarkeitsscanner',

  'scan.badge': 'Kostenloser KI-Sichtbarkeits-Scan',
  'scan.hero.title': 'Kennt die KI Ihre Marke?',
  'scan.hero.subtitle':
    'Geben Sie Ihre Marken-URL ein, um Ihren KI-Sichtbarkeitsscore bei Antwortsuchmaschinen wie Perplexity zu ermitteln.',

  'scan.form.url.label': 'Marken-URL',
  'scan.form.url.placeholder': 'https://ihremarke.com',
  'scan.form.providers.label': 'Anbieter',
  'scan.form.providers.mock': 'Mock (Demo, sofort)',
  'scan.form.providers.perplexity': 'Perplexity (live)',
  'scan.form.cta': 'KI-Scan starten',

  'scan.scanning': 'Scanne…',
  'scan.scanning.desc': 'KI-Engines abfragen und Sichtbarkeit berechnen…',

  'scan.score.label': 'KI-Sichtbarkeitsscore',
  'scan.score.subtitle': 'von 100',

  'scan.results.mentionRate': 'Erwähnungsrate',
  'scan.results.citationRate': 'Zitationsrate',
  'scan.results.engines': 'Engines',
  'scan.results.prompts': 'Prompts',
  'scan.results.gaps': 'Abdeckungslücken',
  'scan.results.recommendations': 'Empfehlungen',
  'scan.results.scanAgain': '← Andere Marke scannen',

  'scan.error.title': 'Scan fehlgeschlagen',
  'scan.error.retry': 'Erneut versuchen',

  'scan.validation.url': 'Gültige URL eingeben, z. B. https://ihremarke.com',
  'scan.validation.provider': 'Mindestens einen Anbieter auswählen',
}

const ptBr: TranslationDict = {
  'nav.title': 'AI Rank Tracker',
  'nav.tagline': 'Scanner de Visibilidade GEO/AEO',

  'scan.badge': 'Scan de visibilidade IA gratuito',
  'scan.hero.title': 'A IA conhece a sua marca?',
  'scan.hero.subtitle':
    'Insira a URL da sua marca para verificar seu AI Visibility Score em motores de resposta como Perplexity.',

  'scan.form.url.label': 'URL da Marca',
  'scan.form.url.placeholder': 'https://suamarca.com.br',
  'scan.form.providers.label': 'Provedores',
  'scan.form.providers.mock': 'Mock (demo, instantâneo)',
  'scan.form.providers.perplexity': 'Perplexity (ao vivo)',
  'scan.form.cta': 'Executar Scan IA',

  'scan.scanning': 'Escaneando…',
  'scan.scanning.desc': 'Consultando motores IA e calculando sua visibilidade…',

  'scan.score.label': 'AI Visibility Score',
  'scan.score.subtitle': 'de 100',

  'scan.results.mentionRate': 'Taxa de Menção',
  'scan.results.citationRate': 'Taxa de Citação',
  'scan.results.engines': 'Motores',
  'scan.results.prompts': 'Prompts',
  'scan.results.gaps': 'Lacunas de Cobertura',
  'scan.results.recommendations': 'Recomendações',
  'scan.results.scanAgain': '← Escanear outra marca',

  'scan.error.title': 'Scan falhou',
  'scan.error.retry': 'Tentar novamente',

  'scan.validation.url': 'Insira uma URL válida, ex. https://suamarca.com.br',
  'scan.validation.provider': 'Selecione pelo menos um provedor',
}

export const translations: Record<Locale, TranslationDict> = {
  en,
  ar,
  it,
  nl,
  zh,
  es,
  fr,
  de,
  'pt-br': ptBr,
}

// ─── Campaign dashboard namespace (v0.7.0) ──────────────────────────────────────
// Keys are declared ONCE and shared across every locale, so the locale-parity
// guarantee holds by construction: each locale supplies a values array in the
// same order, merged into its dict below.
const CAMPAIGN_KEYS = [
  'nav.campaign',
  'campaign.hero.title',
  'campaign.hero.subtitle',
  'campaign.form.brand',
  'campaign.form.domain',
  'campaign.form.prompts',
  'campaign.form.promptPlaceholder',
  'campaign.form.add',
  'campaign.form.competitors',
  'campaign.form.competitorName',
  'campaign.form.run',
  'campaign.form.running',
  'campaign.form.demo',
  'campaign.form.brandRequired',
  'campaign.form.promptRequired',
  'campaign.back',
  'campaign.score.label',
  'campaign.runs',
  'campaign.trend.title',
  'campaign.trend.visibility',
  'campaign.trend.sov',
  'campaign.trend.empty',
  'campaign.trend.delta',
  'campaign.engines.title',
  'campaign.engines.mentionRate',
  'campaign.engines.citationRate',
  'campaign.competitors.title',
  'campaign.competitors.you',
  'campaign.prompts.title',
  'campaign.prompts.mentions',
  'campaign.prompts.citations',
  'campaign.prompts.none',
  'campaign.export',
] as const

const campaignValues: Record<Locale, readonly string[]> = {
  en: [
    'Campaigns', 'Campaign Dashboard',
    "Track your brand's AI share of voice over time — across engines and against competitors.",
    'Brand name', 'Domain', 'Prompts', 'Add a prompt…', 'Add', 'Competitors', 'Competitor name',
    'Run campaign', 'Running campaign…', 'Load demo campaign', 'Brand name is required',
    'Add at least one prompt', '← Back to scan', 'AI Visibility Score', 'runs',
    'Share of voice over time', 'Visibility', 'Share of voice',
    'Run this campaign again over time to build a trend.', 'Change since first run',
    'Per-engine breakdown', 'Mention rate', 'Citation rate', 'Competitor comparison', 'you',
    'Per-prompt drill-down', 'Mentions', 'Citations', 'No citations', 'Download report (.md)',
  ],
  ar: [
    'الحملات', 'لوحة الحملات',
    'تتبّع حصة علامتك التجارية في إجابات الذكاء الاصطناعي عبر الزمن — عبر المحركات وأمام المنافسين.',
    'اسم العلامة التجارية', 'النطاق', 'الأسئلة', 'أضف سؤالاً…', 'إضافة', 'المنافسون', 'اسم المنافس',
    'تشغيل الحملة', 'جارٍ تشغيل الحملة…', 'تحميل حملة تجريبية', 'اسم العلامة التجارية مطلوب',
    'أضف سؤالاً واحداً على الأقل', '→ العودة إلى الفحص', 'درجة رؤية الذكاء الاصطناعي', 'تشغيلات',
    'حصة الصوت عبر الزمن', 'الظهور', 'حصة الصوت',
    'شغّل هذه الحملة مجدداً عبر الزمن لبناء اتجاه.', 'التغيّر منذ أول تشغيل',
    'التفصيل حسب المحرّك', 'معدل الإشارة', 'معدل الاستشهاد', 'مقارنة المنافسين', 'أنت',
    'تفصيل حسب السؤال', 'الإشارات', 'الاستشهادات', 'لا استشهادات', 'تنزيل التقرير (.md)',
  ],
  it: [
    'Campagne', 'Dashboard campagne',
    'Monitora la share of voice del tuo brand nelle risposte AI nel tempo — tra motori e rispetto ai concorrenti.',
    'Nome del brand', 'Dominio', 'Prompt', 'Aggiungi un prompt…', 'Aggiungi', 'Concorrenti', 'Nome concorrente',
    'Avvia campagna', 'Avvio campagna…', 'Carica campagna demo', 'Il nome del brand è obbligatorio',
    'Aggiungi almeno un prompt', '← Torna alla scansione', 'AI Visibility Score', 'esecuzioni',
    'Share of voice nel tempo', 'Visibilità', 'Share of voice',
    'Esegui di nuovo questa campagna nel tempo per costruire un trend.', 'Variazione dalla prima esecuzione',
    'Dettaglio per motore', 'Tasso di menzione', 'Tasso di citazione', 'Confronto concorrenti', 'tu',
    'Dettaglio per prompt', 'Menzioni', 'Citazioni', 'Nessuna citazione', 'Scarica report (.md)',
  ],
  nl: [
    'Campagnes', 'Campagne-dashboard',
    'Volg de AI share of voice van je merk in de tijd — over engines heen en tegenover concurrenten.',
    'Merknaam', 'Domein', 'Prompts', 'Voeg een prompt toe…', 'Toevoegen', 'Concurrenten', 'Naam concurrent',
    'Campagne uitvoeren', 'Campagne uitvoeren…', 'Demo-campagne laden', 'Merknaam is verplicht',
    'Voeg ten minste één prompt toe', '← Terug naar scan', 'AI Visibility Score', 'runs',
    'Share of voice in de tijd', 'Zichtbaarheid', 'Share of voice',
    'Voer deze campagne in de tijd opnieuw uit om een trend op te bouwen.', 'Verandering sinds de eerste run',
    'Uitsplitsing per engine', 'Vermeldingsgraad', 'Citatiegraad', 'Concurrentievergelijking', 'jij',
    'Uitsplitsing per prompt', 'Vermeldingen', 'Citaties', 'Geen citaties', 'Rapport downloaden (.md)',
  ],
  zh: [
    '活动', '活动仪表板',
    '随时间跟踪您的品牌在 AI 回答中的声量份额——跨引擎并对比竞争对手。',
    '品牌名称', '域名', '提示词', '添加提示词…', '添加', '竞争对手', '竞争对手名称',
    '运行活动', '正在运行活动…', '加载演示活动', '品牌名称为必填项',
    '请至少添加一个提示词', '← 返回扫描', 'AI 可见度评分', '次运行',
    '声量份额随时间变化', '可见度', '声量份额',
    '随时间再次运行此活动以构建趋势。', '自首次运行以来的变化',
    '按引擎细分', '提及率', '引用率', '竞争对手对比', '您',
    '按提示词细分', '提及', '引用', '无引用', '下载报告 (.md)',
  ],
  es: [
    'Campañas', 'Panel de campañas',
    'Sigue la cuota de voz de tu marca en las respuestas de IA a lo largo del tiempo, entre motores y frente a competidores.',
    'Nombre de la marca', 'Dominio', 'Prompts', 'Añade un prompt…', 'Añadir', 'Competidores', 'Nombre del competidor',
    'Ejecutar campaña', 'Ejecutando campaña…', 'Cargar campaña demo', 'El nombre de la marca es obligatorio',
    'Añade al menos un prompt', '← Volver al escaneo', 'Puntuación de visibilidad IA', 'ejecuciones',
    'Cuota de voz a lo largo del tiempo', 'Visibilidad', 'Cuota de voz',
    'Ejecuta esta campaña de nuevo a lo largo del tiempo para crear una tendencia.', 'Cambio desde la primera ejecución',
    'Desglose por motor', 'Tasa de mención', 'Tasa de citación', 'Comparación de competidores', 'tú',
    'Desglose por prompt', 'Menciones', 'Citas', 'Sin citas', 'Descargar informe (.md)',
  ],
  fr: [
    'Campagnes', 'Tableau de bord des campagnes',
    'Suivez la part de voix de votre marque dans les réponses IA au fil du temps — entre moteurs et face aux concurrents.',
    'Nom de la marque', 'Domaine', 'Prompts', 'Ajouter un prompt…', 'Ajouter', 'Concurrents', 'Nom du concurrent',
    'Lancer la campagne', 'Lancement de la campagne…', 'Charger la campagne démo', 'Le nom de la marque est obligatoire',
    'Ajoutez au moins un prompt', '← Retour au scan', 'Score de visibilité IA', 'exécutions',
    'Part de voix au fil du temps', 'Visibilité', 'Part de voix',
    'Relancez cette campagne au fil du temps pour construire une tendance.', 'Évolution depuis la première exécution',
    'Détail par moteur', 'Taux de mention', 'Taux de citation', 'Comparaison des concurrents', 'vous',
    'Détail par prompt', 'Mentions', 'Citations', 'Aucune citation', 'Télécharger le rapport (.md)',
  ],
  de: [
    'Kampagnen', 'Kampagnen-Dashboard',
    'Verfolgen Sie den AI-Share-of-Voice Ihrer Marke im Zeitverlauf — über Engines hinweg und gegen Wettbewerber.',
    'Markenname', 'Domain', 'Prompts', 'Prompt hinzufügen…', 'Hinzufügen', 'Wettbewerber', 'Name des Wettbewerbers',
    'Kampagne starten', 'Kampagne läuft…', 'Demo-Kampagne laden', 'Markenname ist erforderlich',
    'Fügen Sie mindestens einen Prompt hinzu', '← Zurück zum Scan', 'KI-Sichtbarkeitsscore', 'Läufe',
    'Share of Voice im Zeitverlauf', 'Sichtbarkeit', 'Share of Voice',
    'Führen Sie diese Kampagne im Zeitverlauf erneut aus, um einen Trend aufzubauen.', 'Veränderung seit dem ersten Lauf',
    'Aufschlüsselung pro Engine', 'Erwähnungsrate', 'Zitationsrate', 'Wettbewerbsvergleich', 'Sie',
    'Aufschlüsselung pro Prompt', 'Erwähnungen', 'Zitate', 'Keine Zitate', 'Bericht herunterladen (.md)',
  ],
  'pt-br': [
    'Campanhas', 'Painel de campanhas',
    'Acompanhe a participação de voz da sua marca nas respostas de IA ao longo do tempo — entre motores e frente aos concorrentes.',
    'Nome da marca', 'Domínio', 'Prompts', 'Adicione um prompt…', 'Adicionar', 'Concorrentes', 'Nome do concorrente',
    'Executar campanha', 'Executando campanha…', 'Carregar campanha demo', 'O nome da marca é obrigatório',
    'Adicione pelo menos um prompt', '← Voltar ao scan', 'AI Visibility Score', 'execuções',
    'Participação de voz ao longo do tempo', 'Visibilidade', 'Participação de voz',
    'Execute esta campanha novamente ao longo do tempo para construir uma tendência.', 'Variação desde a primeira execução',
    'Detalhamento por motor', 'Taxa de menção', 'Taxa de citação', 'Comparação de concorrentes', 'você',
    'Detalhamento por prompt', 'Menções', 'Citações', 'Sem citações', 'Baixar relatório (.md)',
  ],
}

for (const loc of Object.keys(translations) as Locale[]) {
  const vals = campaignValues[loc]
  CAMPAIGN_KEYS.forEach((k, i) => {
    translations[loc][k] = vals[i] as string
  })
}

/** Translate `key` for `locale`, falling back to English then the raw key. */
export function t(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key
}

/** True when `s` is a supported locale code. */
export function isLocale(s: string | null | undefined): s is Locale {
  return !!s && s in translations
}
