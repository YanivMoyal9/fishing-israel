// ===== מצב גלובלי =====
const LOC_KEY = "fishing-location";

function restoreLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOC_KEY) || "null");
    if (saved) {
      const region = REGIONS.find(r => r.city === saved.city);
      const spot = region?.spots.find(s => s.id === saved.spotId);
      if (region && spot) return { region, spot };
    }
  } catch (e) { /* בחירה שמורה לא תקינה — נופלים לברירת המחדל */ }
  const region = REGIONS.find(r => r.city === "אשדוד") || REGIONS[0];
  return { region, spot: region.spots[0] };
}

let { region: currentRegion, spot: currentSpot } = restoreLocation();
let weatherData = null;
let marineData = null;

function saveLocation() {
  localStorage.setItem(LOC_KEY, JSON.stringify({ city: currentRegion.city, spotId: currentSpot.id }));
}

function isFreshwater() {
  return currentSpot.type === "lake";
}

// ===== עזרים =====
const $ = id => document.getElementById(id);

function windDirText(deg) {
  const dirs = ["צפונית","צפון-מזרחית","מזרחית","דרום-מזרחית","דרומית","דרום-מערבית","מערבית","צפון-מערבית"];
  return dirs[Math.round(deg / 45) % 8];
}

function weatherEmoji(code) {
  return (WEATHER_CODES[code] || ["🌊","—"]);
}

function currentSeason(month) {
  for (const key in SEASONS) {
    if (SEASONS[key].months.includes(month)) return SEASONS[key];
  }
  return SEASONS.summer;
}

function fmtTime(iso) {
  return iso.slice(11, 16);
}

// ===== שליפת נתונים =====
async function fetchAll(spot) {
  const tz = "Asia/Jerusalem";
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,precipitation,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_sum,weather_code,sunrise,sunset` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,weather_code` +
    `&timezone=${tz}&forecast_days=7`;

  // באגמים ונהרות אין נתוני גלים — שולפים מזג אוויר בלבד
  if (spot.type === "lake") {
    const wRes = await fetch(weatherUrl);
    if (!wRes.ok) throw new Error("API error");
    weatherData = await wRes.json();
    marineData = null;
    return;
  }

  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature` +
    `&daily=wave_height_max,wave_direction_dominant,wave_period_max` +
    `&current=wave_height,wave_direction,wave_period,sea_surface_temperature` +
    `&timezone=${tz}&forecast_days=7`;

  const [wRes, mRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
  if (!wRes.ok || !mRes.ok) throw new Error("API error");
  weatherData = await wRes.json();
  marineData = await mRes.json();
}

// ===== חישוב ציון דיג (1–10) =====
function fishingScore(waveMax, windMax, precip, spotType, pressureTrend) {
  let waveScore;
  if (spotType === "lake") {
    // באגם אין גלי ים — הרוח היא הגורם המרכזי
    waveScore = 9;
  } else if (spotType === "marina") {
    // המרינה מוגנת — גלים מפריעים פחות
    waveScore = waveMax > 2.5 ? 6 : 9;
  } else if (waveMax < 0.3) {
    waveScore = 6.5;               // ים "שמן" — פחות טוב לחוף, טוב לספינינג עדין
  } else if (waveMax <= 1.4) {
    waveScore = 10;                // התנאים הקלאסיים הטובים
  } else if (waveMax <= 2.0) {
    waveScore = 6;                 // גלי אך אפשרי, טוב ללברק
  } else if (waveMax <= 2.6) {
    waveScore = 3;
  } else {
    waveScore = 1;                 // ים סוער — מסוכן
  }

  let windScore;
  if (windMax < 15) windScore = 10;
  else if (windMax < 25) windScore = 8;
  else if (windMax < 35) windScore = 5;
  else windScore = 2;

  let score = waveScore * 0.55 + windScore * 0.45;
  if (precip > 10) score -= 2;
  else if (precip > 2) score -= 0.8;
  if (pressureTrend < -2) score += 0.6;   // לחץ יורד — דגים פעילים
  else if (pressureTrend > 3) score -= 0.4;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function scoreClass(s) {
  return s >= 7 ? "good" : s >= 4 ? "mid" : "bad";
}

function scoreText(s) {
  if (s >= 9) return "תנאים מצוינים לדיג! 🔥";
  if (s >= 7) return "תנאים טובים לדיג";
  if (s >= 5) return "תנאים סבירים";
  if (s >= 3) return "תנאים חלשים — הים לא משתף פעולה";
  return "לא מומלץ לדוג היום — ים סוער או רוח חזקה";
}

// ===== מנוע המלצות לפי תנאים חיים =====
function buildRecommendations(spot, wave, wind, month, pressureTrend) {
  const recs = [];
  const isWinter = [11,12,1,2,3].includes(month);
  const isAutumn = [9,10,11,12].includes(month);
  const isSummer = [5,6,7,8,9].includes(month);

  // --- מים מתוקים: אגמים ונהרות ---
  if (spot.type === "lake") {
    if (wind < 15) {
      recs.push(["🎈 תנאי מצוף מושלמים", "רוח חלשה = מצוף יציב וקריא. דיג קלאסי לאמנונים: להאכיל את הנקודה בתירס, מצוף עדין וקרס קטן."]);
    } else if (wind >= 25) {
      recs.push(["💨 רוח חזקה על המים", "קשה לקרוא מצוף היום. עדיף דיג תחתית עם משקולת שמחזיקה — קרפיונים ושפמנונים פחות מושפעים מהרוח."]);
    } else {
      recs.push(["🎈 מצוף בצד המוגן", "רוח בינונית — לחפש את הצד המוגן מהרוח של האגם; שם גם המזון נדחף ואיתו הדגים."]);
    }
    if (isSummer) {
      recs.push(["🌅 אמנונים ברדודים", "בקיץ האמנונים ברדודים בבוקר ולפנות ערב. בצהריים הם יורדים לעומק — לדוג עמוק יותר או לנוח בצל."]);
      recs.push(["🌙 לילה של שפמנונים", "לילות הקיץ החמים הם שיא עונת השפמנון — תחתית כבדה עם כבד עוף אחרי החשיכה."]);
    }
    if (pressureTrend < -2) {
      recs.push(["📉 לחץ ברומטרי יורד", "לפני מערכת — הקרפיונים והשפמנונים נכנסים לבולמוס. זמן מצוין לצאת!"]);
    }
    recs.push(["🌅 שעות הזהב", "גם במים מתוקים: הזריחה והשקיעה הן שעות הפעילות החזקות."]);
    recs.push(["📜 חוקי המים המתוקים", "דיג בכנרת מחייב רישיון דיג חובבים, ויש סגר רבייה באביב. במאגרים ואגמים — לדוג רק היכן שמותר."]);
    return recs;
  }

  if (wave > 2.2) {
    recs.push(["⚠️ ים סוער", "לא לעלות על שוברי גלים וסלעים. אם בכל זאת יוצאים — רק במרינה הפנימית המוגנת."]);
  } else if (wave >= 0.4 && wave <= 1.5) {
    recs.push(["🎣 סרפקסטינג (דיג חופים)", "גובה גלים אידיאלי לדיג מהחוף. המים העכורים קלות מקרבים דגים לקו החוף. פיתיונות: תולעת חרוזית, שרימפס."]);
  } else if (wave < 0.4) {
    recs.push(["🪶 ים שטוח — דיג עדין", "מים צלולים ורגועים: מתאים לספינינג קל (LRF) במרינה, דיג מצוף לבורי, וחכה עדינה עם קרסים קטנים. הדגים זהירים יותר במים צלולים — חוטים דקים."]);
  }

  if (wave >= 1.4 && wave <= 2.2 && isWinter) {
    recs.push(["🐠 חלון לברק!", "ים גלי בחורף = תנאי הלברק הקלאסיים. ספינינג עם לורים שוחים בזריחה ובשקיעה, בכניסת המרינה ובחופים."]);
  }

  if (isAutumn && wave < 1.8) {
    recs.push(["🦈 עונת הטורפים", "סתיו-תחילת חורף: אינטיאס ופלמידה קרוב לחוף. כפיות מתכת ולורים גדולים, במיוחד בשעה הראשונה והאחרונה של האור. לחפש ציפורים צוללות."]);
  }

  if (wind >= 30) {
    recs.push(["💨 רוח חזקה", "הטלות קשות היום. עדיף לדוג במקום מוגן (מרינה) או עם משקולות כבדות יותר (100–150 גרם) וחוט דק להפחתת התנגדות."]);
  }

  if (pressureTrend < -2) {
    recs.push(["📉 לחץ ברומטרי יורד", "ירידת לחץ לפני מערכת מזג אוויר — הדגים בדרך כלל נכנסים לבולמוס אכילה. זמן מצוין לצאת!"]);
  }

  recs.push(["🌅 שעות הזהב", "בכל עונה: שעה סביב הזריחה ושעה סביב השקיעה הן שעות הפעילות החזקות ביותר של רוב הדגים."]);

  if (spot.type === "port") {
    recs.push(["⚓ באזור הנמל", "מים עמוקים וקרקעית סלעית: דיג תחתית לסרגוסים ולוקוסים צמוד לסלעים. לדוג רק באזורים המותרים מחוץ לשטח הנמל."]);
  }

  return recs;
}

// ===== רינדור =====
function renderLocationPicker() {
  const select = $("city-select");
  const opt = r => `<option value="${r.city}"${r.city === currentRegion.city ? " selected" : ""}>📍 ${r.city}</option>`;
  const seaRegions = REGIONS.filter(r => r.water !== "fresh");
  const freshRegions = REGIONS.filter(r => r.water === "fresh");
  select.innerHTML =
    `<optgroup label="🌊 הים התיכון">${seaRegions.map(opt).join("")}</optgroup>` +
    `<optgroup label="🏞️ מים מתוקים">${freshRegions.map(opt).join("")}</optgroup>`;
  select.onchange = () => {
    currentRegion = REGIONS.find(r => r.city === select.value);
    currentSpot = currentRegion.spots[0];
    saveLocation();
    init();
  };

  const nav = $("spot-tabs");
  nav.innerHTML = "";
  currentRegion.spots.forEach(spot => {
    const btn = document.createElement("button");
    btn.className = "spot-tab" + (spot.id === currentSpot.id ? " active" : "");
    btn.textContent = spot.name;
    btn.onclick = () => { currentSpot = spot; saveLocation(); init(); };
    nav.appendChild(btn);
  });
}

function render() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const w = weatherData, m = marineData;
  const cur = w.current, mcur = m ? m.current : null;
  const waveMaxToday = m ? m.daily.wave_height_max[0] : 0;

  // מגמת לחץ: השוואת לחץ נוכחי ללחץ לפני 6 שעות
  const hourIdx = w.hourly.time.findIndex(t => new Date(t) >= now);
  const idx = Math.max(hourIdx, 6);
  const pressureTrend = w.hourly.surface_pressure[idx] - w.hourly.surface_pressure[idx - 6];

  // --- ציון היום ---
  const score = fishingScore(
    waveMaxToday,
    w.daily.wind_speed_10m_max[0],
    w.daily.precipitation_sum[0],
    currentSpot.type,
    pressureTrend
  );
  $("score-value").textContent = score;
  $("score-circle").className = "score-circle " + scoreClass(score);
  $("score-label").textContent = scoreText(score);
  $("spot-note").textContent = currentSpot.note;

  // --- תנאים עכשיו ---
  const [emoji, desc] = weatherEmoji(cur.weather_code);
  const conds = [
    [emoji, desc, "מזג אוויר"],
    ["🌡️", `${Math.round(cur.temperature_2m)}°`, "טמפ' אוויר"]
  ];
  if (mcur) {
    conds.push(
      ["🌊", `${mcur.wave_height.toFixed(1)} מ'`, `גלים · ${mcur.wave_period.toFixed(0)} שנ'`],
      ["💧", `${Math.round(mcur.sea_surface_temperature)}°`, "טמפ' מים"]
    );
  }
  conds.push(
    ["💨", `${Math.round(cur.wind_speed_10m)} קמ"ש`, `רוח ${windDirText(cur.wind_direction_10m)}`],
    ["🌬️", `${Math.round(cur.wind_gusts_10m)} קמ"ש`, "משבים"],
    ["🧭", `${Math.round(cur.surface_pressure)}`, `לחץ ${pressureTrend < -1 ? "יורד ↓" : pressureTrend > 1 ? "עולה ↑" : "יציב"}`],
    ["🌅", fmtTime(w.daily.sunrise[0]), "זריחה"],
    ["🌇", fmtTime(w.daily.sunset[0]), "שקיעה"]
  );
  $("conditions-now").innerHTML = conds.map(([ic, val, lbl]) =>
    `<div class="cond"><div class="icon">${ic}</div><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`
  ).join("");

  // --- המלצות ---
  const recs = buildRecommendations(currentSpot, waveMaxToday, w.daily.wind_speed_10m_max[0], month, pressureTrend);
  $("recommendations").innerHTML = recs.map(([title, body]) =>
    `<li><span class="rec-title">${title}:</span> ${body}</li>`
  ).join("");

  // --- 24 שעות קרובות ---
  const start = Math.max(hourIdx, 0);
  let hoursHtml = "";
  for (let i = start; i < Math.min(start + 24, w.hourly.time.length); i++) {
    let waveRow = "";
    if (m) {
      const mi = m.hourly.time.indexOf(w.hourly.time[i]);
      const wv = mi >= 0 ? m.hourly.wave_height[mi] : null;
      waveRow = `<div class="dim">🌊 ${wv !== null ? wv.toFixed(1) : "–"}</div>`;
    }
    hoursHtml += `<div class="hour-cell">
      <div class="h">${fmtTime(w.hourly.time[i])}</div>
      <div>${weatherEmoji(w.hourly.weather_code[i])[0]} ${Math.round(w.hourly.temperature_2m[i])}°</div>
      <div class="dim">💨 ${Math.round(w.hourly.wind_speed_10m[i])}</div>
      ${waveRow}
    </div>`;
  }
  $("hourly").innerHTML = hoursHtml;

  // --- תחזית שבועית ---
  let weekHtml = "";
  for (let d = 0; d < w.daily.time.length; d++) {
    const date = new Date(w.daily.time[d] + "T12:00");
    const dayScore = fishingScore(
      m ? m.daily.wave_height_max[d] : 0,
      w.daily.wind_speed_10m_max[d],
      w.daily.precipitation_sum[d],
      currentSpot.type,
      0
    );
    const [de] = weatherEmoji(w.daily.weather_code[d]);
    const waveLine = m ? `🌊 ${m.daily.wave_height_max[d].toFixed(1)} מ'<br>` : "";
    weekHtml += `<div class="day-card${d === 0 ? " today" : ""}">
      <div class="dname">${d === 0 ? "היום" : DAY_NAMES[date.getDay()]}</div>
      <div class="demoji">${de}</div>
      <div class="dtemp">${Math.round(w.daily.temperature_2m_max[d])}° / ${Math.round(w.daily.temperature_2m_min[d])}°</div>
      <div class="ddetail">${waveLine}💨 ${Math.round(w.daily.wind_speed_10m_max[d])} קמ"ש</div>
      <div class="day-score ${scoreClass(dayScore)}">${dayScore}/10</div>
    </div>`;
  }
  $("weekly").innerHTML = weekHtml;

  // --- דגים בעונה ---
  $("season-name").textContent = currentSeason(month).name;
  const relevant = FISH.filter(f => f.spots.includes(currentSpot.type));
  const inSeason = relevant.filter(f => f.months.includes(month));
  const offSeason = relevant.filter(f => !f.months.includes(month));

  const fishCard = f => `<div class="fish-card">
    <h3>${f.emoji} ${f.name} ${f.peak.includes(month) ? '<span class="peak">● שיא העונה</span>' : ""}</h3>
    <p><strong>שיטה:</strong> ${f.method}<br>
    <strong>פיתיון:</strong> ${f.bait}<br>
    ${f.tip}</p>
  </div>`;

  $("fish-in-season").innerHTML = inSeason.map(fishCard).join("") || "<p class='season-hint'>אין דגים עונתיים מובהקים כרגע בנקודה זו.</p>";
  $("fish-off-season").innerHTML = offSeason.map(fishCard).join("");

  $("last-updated").textContent = `עודכן: ${now.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })} · ${currentRegion.city} · ${currentSpot.name}`;
}

// ===== מדריך שיטות דיג ובובות =====
// מחזיר true אם השיטה מתאימה לתנאים הנוכחיים בנקודה שנבחרה
function methodRecommended(method, waveMax, windMax, month, spotType) {
  if (spotType === "lake") {
    switch (method.id) {
      case "float":    return windMax < 25;                       // המצוף — שיטת האגם המרכזית
      case "bottom":   return true;                               // קרפיונים ושפמנונים
      case "spinning": return windMax < 30;                       // ביניות ושפמנונים על לורים
      case "trolling": return windMax < 20;                       // ז'רזור מקיאק בכנרת
      default:         return false;
    }
  }
  switch (method.id) {
    case "surfcasting": return spotType === "beach" && waveMax >= 0.4 && waveMax <= 1.6 && windMax < 35;
    case "spinning":    return waveMax <= 1.8 && windMax < 35;
    case "trolling":    return waveMax <= 1.0 && windMax < 25;   // יציאה בסירה — ים נוח
    case "jigging":     return waveMax <= 1.2 && windMax < 25;
    case "lrf":         return waveMax <= 0.6 && (spotType === "marina" || spotType === "port");
    case "float":       return spotType === "marina" || (spotType === "port" && waveMax <= 1.2);
    case "bottom":      return (spotType === "port" || spotType === "marina") && waveMax <= 1.8;
    case "livebait":    return waveMax <= 1.8;
    default: return false;
  }
}

// חודשי שיא לבובות + תנאים מיוחדים
function lureRecommended(lure, month, waveMax) {
  if (lure.name.startsWith("פופר") || lure.name.startsWith("סטיקבייט")) return [9,10,11,12].includes(month);
  if (lure.name.startsWith("מינו")) return [11,12,1,2,3].includes(month);
  if (lure.name.startsWith("כף")) return [10,11,12,1].includes(month);
  if (lure.name.startsWith("שור")) return [9,10,11,12,1].includes(month);
  if (lure.name.startsWith("וויברציה")) return waveMax >= 1.0;  // מים עכורים
  return false;
}

function renderGuide() {
  const month = new Date().getMonth() + 1;
  const waveMax = marineData ? marineData.daily.wave_height_max[0] : 0;
  const windMax = weatherData.daily.wind_speed_10m_max[0];

  $("guide-hint").textContent = isFreshwater()
    ? 'שיטות עם סימון "✓ מתאים עכשיו" נבחרו לפי הרוח והעונה באגם. במים מתוקים המצוף והתחתית הם המלכים.'
    : 'שיטות עם סימון "✓ מתאים עכשיו" נבחרו לפי הגלים, הרוח והעונה בנקודה שבחרת. שיטות סירה (🚤) דורשות יציאה מהמרינה.';

  $("methods-panel").innerHTML = METHODS.map(m => {
    const rec = methodRecommended(m, waveMax, windMax, month, currentSpot.type);
    return `<div class="method-card${rec ? " recommended" : ""}">
      <h3>${m.emoji} ${m.name}
        ${rec ? '<span class="badge">✓ מתאים עכשיו</span>' : ""}
        ${m.where === "boat" ? '<span class="badge boat">🚤 מסירה/קיאק</span>' : ""}
        ${m.where === "both" ? '<span class="badge boat">חוף + סירה</span>' : ""}
      </h3>
      <p>${m.desc}<br>
      <strong>ציוד:</strong> ${m.gear}<br>
      <strong>פיתיון:</strong> ${m.bait}<br>
      <strong>דגי מטרה:</strong> ${m.fish}<br>
      <strong>מתי ואיפה:</strong> ${m.when}</p>
    </div>`;
  }).join("");

  $("lures-panel").innerHTML = LURES.map(l => {
    const rec = lureRecommended(l, month, waveMax);
    return `<div class="method-card${rec ? " recommended" : ""}">
      <h3>${l.emoji} ${l.name}
        ${rec ? '<span class="badge">✓ בעונה עכשיו</span>' : ""}
        <span class="badge boat">${l.depth}</span>
      </h3>
      <p>${l.desc}<br>
      <strong>איך עובדים איתה:</strong> ${l.work}<br>
      <strong>דגי מטרה:</strong> ${l.fish}<br>
      <strong>טיפ:</strong> ${l.tip}</p>
    </div>`;
  }).join("");
}

function setupGuideTabs() {
  const show = which => {
    $("methods-panel").classList.toggle("hidden", which !== "methods");
    $("lures-panel").classList.toggle("hidden", which !== "lures");
    $("tab-methods").classList.toggle("active", which === "methods");
    $("tab-lures").classList.toggle("active", which === "lures");
  };
  $("tab-methods").onclick = () => show("methods");
  $("tab-lures").onclick = () => show("lures");
}

// ===== עצת דייג AI (דרך Proxy — המפתח נשאר בשרת) =====
function aiConfigured() {
  return typeof CONFIG !== "undefined" && CONFIG.AI_PROXY_URL;
}

async function askAI() {
  const btn = $("ai-button");
  const answerEl = $("ai-answer");
  btn.disabled = true;
  btn.textContent = "חושב... 🎣";

  const w = weatherData, m = marineData;
  const month = new Date().getMonth() + 1;
  const inSeason = FISH
    .filter(f => f.spots.includes(currentSpot.type) && f.months.includes(month))
    .map(f => f.name).join(", ");

  const waveLine = m
    ? `גלים עכשיו: ${m.current.wave_height} מ', תדירות ${m.current.wave_period} שנ', מקסימום היום: ${m.daily.wave_height_max[0]} מ'\nטמפ' מים: ${Math.round(m.current.sea_surface_temperature)}°\n`
    : "מקום דיג במים מתוקים (אגם/נהר) — אין נתוני גלים\n";
  const conditions =
    `מיקום: ${currentRegion.city} — ${currentSpot.name} (${currentSpot.note})\n` +
    waveLine +
    `רוח: ${Math.round(w.current.wind_speed_10m)} קמ"ש ${windDirText(w.current.wind_direction_10m)}, משבים ${Math.round(w.current.wind_gusts_10m)}\n` +
    `טמפ' אוויר: ${Math.round(w.current.temperature_2m)}°\n` +
    `לחץ: ${Math.round(w.current.surface_pressure)} hPa\n` +
    `זריחה: ${fmtTime(w.daily.sunrise[0])}, שקיעה: ${fmtTime(w.daily.sunset[0])}\n` +
    `דגים בעונה בנקודה זו: ${inSeason}`;

  try {
    const headers = { "Content-Type": "application/json" };
    if (CONFIG.AI_PROXY_TOKEN) headers["Authorization"] = `Bearer ${CONFIG.AI_PROXY_TOKEN}`;

    const res = await fetch(CONFIG.AI_PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: CONFIG.AI_MODEL,
        max_tokens: 1024,
        system: "אתה מדריך דיג ותיק בחופי הים התיכון של ישראל. ענה בעברית, קצר וממוקד: 1) האם כדאי לצאת היום ומתי (שעות), 2) איזה דג לכוון אליו, 3) שיטה ופיתיון מומלצים, 4) טיפ אחד לתנאים הספציפיים. בלי הקדמות.",
        messages: [{ role: "user", content: `אלה התנאים עכשיו:\n${conditions}\n\nמה עצתך להיום?` }]
      })
    });
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    answerEl.textContent = text || "לא התקבלה תשובה מהשרת.";
    answerEl.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    answerEl.textContent = "⚠️ לא הצלחנו לקבל עצה מהשרת. בדקו את הגדרות ה-Proxy ב-config.js ושה-CORS פתוח לדומיין הזה.";
    answerEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "קבל עצה לתנאים של היום";
  }
}

// ===== יומן תפיסות (localStorage + Supabase אם מוגדר) =====
const LOG_KEY = "fishing-catches";

function supabaseConfigured() {
  return typeof CONFIG !== "undefined" && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
}

function sbHeaders() {
  return {
    "apikey": CONFIG.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };
}

async function loadCatches() {
  if (supabaseConfigured()) {
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/catches?select=*&order=caught_at.desc&limit=50`, { headers: sbHeaders() });
      if (res.ok) return await res.json();
    } catch (e) { console.error("Supabase load failed, falling back to local", e); }
  }
  return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
}

async function saveCatch(entry) {
  if (supabaseConfigured()) {
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/catches`, {
        method: "POST",
        headers: sbHeaders(),
        body: JSON.stringify(entry)
      });
      if (res.ok) return true;
    } catch (e) { console.error("Supabase save failed, saving locally", e); }
  }
  const list = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  list.unshift({ ...entry, id: Date.now() });
  localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 200)));
  return true;
}

async function deleteCatch(id) {
  if (supabaseConfigured()) {
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/catches?id=eq.${id}`, {
        method: "DELETE",
        headers: sbHeaders()
      });
      if (res.ok) return;
    } catch (e) { console.error(e); }
  }
  const list = JSON.parse(localStorage.getItem(LOG_KEY) || "[]").filter(c => c.id !== id);
  localStorage.setItem(LOG_KEY, JSON.stringify(list));
}

async function renderCatchLog() {
  $("log-storage-note").textContent = supabaseConfigured()
    ? "☁️ היומן מסונכרן לענן (Supabase) — זמין מכל מכשיר."
    : "💾 היומן נשמר בדפדפן במכשיר זה. להגדרת סנכרון ענן — ראו config.js.";

  const fishSelect = $("catch-fish");
  fishSelect.innerHTML = '<option value="">איזה דג? *</option>' +
    FISH.map(f => `<option>${f.name}</option>`).join("") +
    "<option>אחר</option>";

  const catches = await loadCatches();
  const listEl = $("catch-list");
  if (!catches.length) {
    listEl.innerHTML = '<div class="catch-empty">עדיין אין תפיסות ביומן — שהראשונה תגיע בקרוב! 🎣</div>';
    return;
  }
  listEl.innerHTML = catches.map(c => `
    <div class="catch-item">
      <div>
        <div class="c-main">🐟 ${c.fish}${c.weight ? ` · ${c.weight} ק"ג` : ""}</div>
        <div class="c-sub">${new Date(c.caught_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })} · ${c.spot}${c.method ? ` · ${c.method}` : ""}${c.notes ? `<br>${c.notes}` : ""}</div>
      </div>
      <button class="del-btn" data-id="${c.id}" title="מחק">🗑️</button>
    </div>`).join("");

  listEl.querySelectorAll(".del-btn").forEach(btn => {
    btn.onclick = async () => { await deleteCatch(btn.dataset.id); renderCatchLog(); };
  });
}

function setupCatchForm() {
  $("catch-form").onsubmit = async e => {
    e.preventDefault();
    const fish = $("catch-fish").value;
    if (!fish) return;
    await saveCatch({
      fish,
      weight: parseFloat($("catch-weight").value) || null,
      method: $("catch-method").value || null,
      notes: $("catch-notes").value || null,
      spot: `${currentRegion.city} — ${currentSpot.name}`,
      caught_at: new Date().toISOString()
    });
    e.target.reset();
    renderCatchLog();
  };
}

// ===== אתחול =====
let uiWired = false;

async function init() {
  renderLocationPicker();
  $("loading").classList.remove("hidden");
  $("error").classList.add("hidden");
  $("content").classList.add("hidden");
  try {
    await fetchAll(currentSpot);
    render();
    if (aiConfigured()) {
      $("ai-card").classList.remove("hidden");
      $("ai-answer").classList.add("hidden");
    }
    if (!uiWired) {
      uiWired = true;
      $("ai-button").onclick = askAI;
      setupCatchForm();
      setupGuideTabs();
    }
    renderGuide();
    renderCatchLog();
    $("loading").classList.add("hidden");
    $("content").classList.remove("hidden");
  } catch (e) {
    console.error(e);
    $("loading").classList.add("hidden");
    $("error").classList.remove("hidden");
  }
}

init();
