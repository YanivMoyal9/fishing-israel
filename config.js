// ===== הגדרות חיבורים חיצוניים =====
// מלאו את הערכים כדי להפעיל את התכונות. בלי ערכים — האתר עובד רגיל,
// יומן התפיסות נשמר מקומית בדפדפן (localStorage) ועצת ה-AI מוסתרת.

const CONFIG = {
  // --- Supabase: יומן תפיסות בענן (סנכרון בין מכשירים) ---
  // 1. צרו פרויקט חינמי ב-https://supabase.com
  // 2. הריצו את הקובץ supabase-schema.sql ב-SQL Editor
  // 3. העתיקו מ-Settings > API את ה-URL וה-anon public key לכאן
  SUPABASE_URL: "",        // למשל: "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",   // המפתח הציבורי (anon) — בטוח לשים בצד לקוח

  // --- עצת דייג AI (Claude) דרך שרת Proxy ---
  // חשוב: אין לשים כאן מפתח API של Anthropic! המפתח חייב לשבת בשרת ה-Proxy
  // (Azure). ה-Proxy צריך לחשוף נקודת קצה תואמת /v1/messages, להוסיף את
  // המפתח בצד השרת, ולהחזיר כותרות CORS לדומיין של האתר.
  AI_PROXY_URL: "",        // למשל: "https://my-proxy.azurewebsites.net/v1/messages"
  AI_PROXY_TOKEN: "",      // אופציונלי: טוקן שה-Proxy שלכם דורש (לא מפתח Anthropic)
  AI_MODEL: "claude-opus-4-8"
};
