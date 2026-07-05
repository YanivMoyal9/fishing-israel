# 🎣 דיג חופי ישראל — תחזית ומידע לדייג

אתר PWA (מתקין כאפליקציה בטלפון) שמציג תחזית ים ומזג אוויר אמיתית לכל מישור החוף — 14 ערים מנהריה עד זיקים, כולל מרינות, נמלים ושפכי נחלים — עם ציון דיג יומי, מדריך שיטות דיג ובובות, דגים בעונה ויומן תפיסות.

**נתונים חיים:** [Open-Meteo](https://open-meteo.com/) (חינם, בלי מפתח API, מתעדכן כל שעה).

## הרצה מקומית

פשוט לפתוח את `index.html` בדפדפן, או להריץ שרת מקומי:

```
npx http-server -p 8317 .
```

## פריסה ל-GitHub Pages (חינם)

```
git push
```

האתר מתפרסם אוטומטית מ-branch `main` (מוגדר ב-Settings > Pages).

## התקנה כאפליקציה בטלפון (PWA)

1. פתחו את כתובת האתר בכרום (אנדרואיד) או ספארי (אייפון)
2. אנדרואיד: תפריט ⋮ > "הוסף למסך הבית" / "התקן אפליקציה"
3. אייפון: כפתור שיתוף > "הוסף למסך הבית"

האפליקציה עובדת גם בלי אינטרנט (מציגה את הנתונים האחרונים שנטענו).

## הפעלת יומן תפיסות בענן (Supabase)

בלי הגדרה — היומן נשמר מקומית בדפדפן. כדי לסנכרן בין מכשירים:

1. צרו פרויקט חינמי ב-[supabase.com](https://supabase.com)
2. ב-SQL Editor הריצו את התוכן של `supabase-schema.sql`
3. ב-Settings > API העתיקו את **Project URL** ואת **anon public key**
4. הדביקו אותם ב-`config.js`:
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJ...",
   ```

## הפעלת עצת דייג AI (Claude דרך Azure Proxy)

⚠️ **לעולם אל תשימו מפתח Anthropic ב-`config.js`** — הוא גלוי לכל מי שנכנס לאתר. המפתח חייב לשבת בשרת ה-Proxy.

ה-Proxy (למשל Azure Function / App Service) צריך:

1. **לחשוף נקודת קצה** בפורמט של Anthropic Messages API (למשל `POST /v1/messages`)
2. **להעביר את הבקשה** ל-`https://api.anthropic.com/v1/messages` עם הכותרות:
   - `x-api-key: <המפתח בשרת>`
   - `anthropic-version: 2023-06-01`
   - `content-type: application/json`
3. **להחזיר כותרות CORS** לדומיין של האתר:
   - `Access-Control-Allow-Origin: https://<username>.github.io`
   - `Access-Control-Allow-Headers: Content-Type, Authorization`
   - `Access-Control-Allow-Methods: POST, OPTIONS`
   - ולענות 204 לבקשות `OPTIONS` (preflight)
4. מומלץ: לדרוש טוקן משלכם ב-`Authorization: Bearer` כדי שלא כל אחד ישתמש ב-Proxy

ואז ב-`config.js`:

```js
AI_PROXY_URL: "https://my-proxy.azurewebsites.net/v1/messages",
AI_PROXY_TOKEN: "הטוקן-שלכם-אם-הגדרתם",
AI_MODEL: "claude-opus-4-8",
```

כשה-URL מוגדר, כרטיס "🤖 עצת דייג מ-AI" מופיע אוטומטית באתר.

## מבנה הפרויקט

| קובץ | תפקיד |
|---|---|
| `index.html` | מבנה הדף |
| `style.css` | עיצוב |
| `data.js` | נקודות דיג, בסיס ידע דגים, עונות |
| `app.js` | שליפת נתונים, ציון דיג, המלצות, יומן, AI |
| `config.js` | הגדרות Supabase ו-AI Proxy |
| `sw.js` + `manifest.webmanifest` | PWA (התקנה + אופליין) |
| `supabase-schema.sql` | סכימת יומן התפיסות |
