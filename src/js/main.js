import { CONFIG } from './config.js';
import { applyAssetFallbacks, prepareAssets } from './assets.js';

const stage = document.querySelector('#scene-content');
const audio = document.querySelector('#audio');
const sceneCount = CONFIG.scenes.length;
const storyTotal = sceneCount + 1;
let currentScene = 0;
let letterPage = 0;
let letterOpened = false;
let galleryIndex = 0;
let titleInterval;
let typeTimer;
let savedState = {};
let letterReturnPending = false;
let currentTrack = 0;
let reducedMotion = false;

const safeStorage = {
  read() { try { return JSON.parse(localStorage.getItem('renad-state') || '{}'); } catch { return {}; } },
  write(value) { try { localStorage.setItem('renad-state', JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ } },
};
savedState = safeStorage.read();
let quality = ['cinematic', 'balanced', 'light'].includes(savedState.quality) ? savedState.quality : 'balanced';
reducedMotion = typeof savedState.reducedMotion === 'boolean' ? savedState.reducedMotion : window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const storyNumber = (index) => index < 12 ? index + 1 : index + 2;
const dateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, Number(value)]));
};
function cairoWallTimeToUTC({ y, m, d, hh = 0, mm = 0, ss = 0 }) {
  const target = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const local = dateParts(new Date(guess));
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    guess += target - represented;
  }
  return guess;
}
const pad = (value) => String(value).padStart(2, '0');
function durationParts(milliseconds) {
  let seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return { days, hours, minutes, seconds };
}
function countdown(target) { return durationParts(target - Date.now()); }
function elapsedSince(target) { return durationParts(Date.now() - target); }
function engagementDuration(target) {
  const future = Date.now() < target;
  return { values: future ? countdown(target) : elapsedSince(target), future };
}
function nextBirthdayTarget() {
  const today = dateParts();
  let year = today.year;
  const birthdayPassed = today.month > CONFIG.dates.birthday.m || (today.month === CONFIG.dates.birthday.m && today.day > CONFIG.dates.birthday.d);
  if (birthdayPassed || (today.month === CONFIG.dates.birthday.m && today.day === CONFIG.dates.birthday.d && today.hour > 0)) year += 1;
  return cairoWallTimeToUTC({ y: year, m: CONFIG.dates.birthday.m, d: CONFIG.dates.birthday.d });
}
function metricsMarkup(values, className = '') {
  return `<div class="metric-grid ${className}" aria-live="off">${[['days','يوم'],['hours','ساعة'],['minutes','دقيقة'],['seconds','ثانية']].map(([key,label]) => `<div class="metric"><strong data-unit="${key}">${pad(values[key])}</strong><span>${label}</span></div>`).join('')}</div>`;
}
function formatDateTime() {
  return new Intl.DateTimeFormat('ar-EG', { timeZone: CONFIG.timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
}
function saveProgress() { savedState = { ...savedState, scene: currentScene, reducedMotion }; safeStorage.write(savedState); }
function setPlayerExpanded(expanded) {
  const dock = document.querySelector('#player-dock'); const toggle = document.querySelector('#player-expand');
  const before = dock.getBoundingClientRect();
  dock.dataset.expanded = String(expanded); toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-label', expanded ? 'تصغير مشغل الموسيقى' : 'تكبير مشغل الموسيقى');
  toggle.title = expanded ? 'تصغير مشغل الموسيقى' : 'تكبير مشغل الموسيقى';
  if (!reducedMotion) {
    const after = dock.getBoundingClientRect();
    dock.animate([
      { transform: `scale(${before.width / after.width}, ${before.height / after.height})` },
      { transform: 'scale(1, 1)' },
    ], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

const sceneViews = [
  () => `<img class="hero-logo" src="${CONFIG.assets.logo}" alt="Renad — A Universe Made for You" width="512" height="512" fetchpriority="high"/><div class="portal-orbit" aria-hidden="true"><span class="floating-title">✦ ريناد ✦</span><span class="floating-title">Renad ♡</span><span class="floating-title">رِيـنَـاد</span><span class="portal-heart">♥</span></div><p class="eyebrow">A UNIVERSE MADE FOR YOU</p><h1 class="scene-title">ريناد <span class="latin">RENAD</span></h1><p class="scene-copy">في عالم واسع مليان حكايات، في حكاية واحدة ليها مكان مختلف… حكايتك يا ريناد، يا بنوتي.</p><div class="button-row"><button class="primary-button" data-action="next">ابدئي رحلتك</button><button class="secondary-button" data-action="music">اسمعي الأغنية</button></div>`,
  () => `<p class="eyebrow">SCENE 02 · HER UNIVERSE</p><h1 class="scene-title">عالم ريناد</h1><div class="portal-orbit" aria-hidden="true"><span class="floating-title">${escapeHTML(CONFIG.decorNames[12])}</span><span class="floating-title">${escapeHTML(CONFIG.decorNames[4])}</span><span class="floating-title">${escapeHTML(CONFIG.decorNames[13])}</span><span class="portal-heart">✦</span></div><p class="rotating-title" aria-live="polite"></p><p class="scene-copy">✧ العالم كله مليان نجوم، وإنتِ أحلى نجمة فيهم ✧</p><button class="primary-button" data-action="next">نكمل الحكاية</button>`,
  () => { const target = cairoWallTimeToUTC({ ...CONFIG.dates.firstTalk }); return `<p class="eyebrow">SCENE 03 · FIRST SPARK</p><h1 class="scene-title">بداية الحكاية</h1><div class="date-stamp">01 OCTOBER 2026</div><p class="scene-copy">كل حكاية ليها لحظة بداية، حتى لو وقتها ماكنّاش عارفين قد إيه اللحظة دي هتبقى مميزة.</p>${metricsMarkup(elapsedSince(target), 'first-talk-timer')}<p class="time-note">من بداية يوم 1 أكتوبر تقريبًا.</p><button class="primary-button" data-action="next">لما القلبين اتقابلوا</button>`; },
  () => { const target = cairoWallTimeToUTC(CONFIG.dates.engagement); const timer = engagementDuration(target); return `<p class="eyebrow">SCENE 04 · ORBIT OF TWO HEARTS</p><h1 class="scene-title">من يوم ما قلبي دق</h1><div class="date-stamp">21 OCTOBER 2026 · 6:21 PM</div><p class="scene-copy">ومن يومها، بقت الحكاية ليها معنى تاني.</p><p class="time-note" id="engagement-count-label">${timer.future ? 'العدّ التنازلي ليوم الارتباط' : 'من يوم الارتباط'}</p>${metricsMarkup(timer.values)}<p class="time-note">ساعة الحكاية دلوقتي: <span id="cairo-clock">${formatDateTime()}</span> · بتوقيت القاهرة</p><button class="primary-button" data-action="next">نفتح مجرة الذكريات</button>`; },
  () => `<p class="eyebrow">SCENE 05 · MEMORY GALAXY</p><h1 class="scene-title">مجرة الذكريات</h1><p class="scene-copy">في حاجات صغيرة بتفضل كبيرة في القلب، وكل ذكرى ليها مكانها.</p><div class="memory-grid">${CONFIG.assets.memories.map((item, index) => `<article class="memory-card"><img src="${escapeHTML(item.file)}" alt="${escapeHTML(item.alt)}" width="720" height="1280" loading="lazy"/><button type="button" data-gallery="${index}">افتحي ${escapeHTML(item.caption)}</button></article>`).join('')}</div><p class="time-note">صور القمر بتاعي، صور بنوتي، صور تحفتي، وصورة نور عيني.</p><button class="primary-button" data-action="next">نسمع حكاية القمر</button>`,
  () => `<p class="eyebrow">SCENE 06 · MOON SONG</p><h1 class="scene-title">أغنية القمر</h1><p class="scene-copy">الأغنية جاهزة، وتشغيلها بإيدك. خدي وقتك واسمعيها وإنتِ بتكمّلي الرحلة.</p><div class="song-card glass-panel"><img src="${CONFIG.assets.songCover}" alt="غلاف أغنية حلف القمر" width="500" height="500" loading="lazy"/><div><strong>حلف القمر</strong><span>الأغنية الافتراضية</span><div class="meter-line"><span id="song-progress"></span></div><div class="button-row"><button class="primary-button" data-action="music">تشغيل / إيقاف</button></div></div></div><p class="time-note" id="song-message" role="status">مفيش تشغيل تلقائي — شغّليها وقت ما تحبي.</p><button class="secondary-button" data-action="next">نكمل من غير موسيقى</button>`,
  () => { const target = nextBirthdayTarget(); const p = dateParts(); const isBirthday = p.month === 2 && p.day === 25; return `<p class="eyebrow">SCENE 07 · BIRTHDAY CONSTELLATION</p><h1 class="scene-title">نجوم عيد الميلاد</h1><div class="date-stamp">25 FEBRUARY 2010</div><p class="scene-copy">يوم ميلاد أحسن البشر 🌙 — اليوم اللي الدنيا نورت فيه بوجودك يا ريناد، يا حبيبتي.</p>${isBirthday ? '<div class="glass-panel capsule-lock"><strong>كل سنة وإنتِ طيبة يا ريناد ♥</strong><p>يومك النهارده، وكل سنة وإنتِ منوّرة الدنيا.</p></div>' : metricsMarkup(countdown(target))}<button class="primary-button" data-action="next">جزيرتك العايمة مستنياكي</button>`; },
  () => `<p class="eyebrow">SCENE 08 · FLOATING ISLAND</p><h1 class="scene-title">جزيرة عايمة</h1><p class="scene-copy">وردة صغيرة وقلب منوّر… اضغطي عليهم وكل مرة هتلاقي جملة مختلفة.</p><button class="secret-star" aria-label="اكشفي عبارة لطيفة" data-action="kind-note">✿</button><p class="promise-text" id="kind-note" aria-live="polite">لمسة صغيرة تكفي.</p><button class="primary-button" data-action="next">نشوف الوعود</button>`,
  () => `<p class="eyebrow">SCENE 09 · PROMISE GARDEN</p><h1 class="scene-title">حديقة الوعود</h1><p class="scene-copy">كل زهرة فيها وعد صغير، افتحيها واحدة واحدة.</p><div class="promise-grid">${CONFIG.promises.map((_, index) => `<button class="promise" type="button" data-promise="${index}" aria-expanded="false" aria-label="افتحي الوعد ${index + 1}">✿<span class="sr-only">الوعد ${index + 1}</span></button>`).join('')}</div><p class="promise-text" id="promise-text" aria-live="polite">اختاري زهرة.</p><button class="primary-button" data-action="next">اسمك مرسوم بالنجوم</button>`,
  () => `<p class="eyebrow">SCENE 10 · CONSTELLATION OF HER NAME</p><h1 class="scene-title">اسمك في السما</h1><p class="scene-copy">حرّكي المؤشر أو لمسي النجوم… واسمك هيفضل راجع لمكانه.</p><div class="constellation-card glass-panel"><canvas id="name-stars" aria-label="نجوم ترسم اسم ريناد"></canvas></div><button class="primary-button" data-action="next">نفتح كبسولة الوقت</button>`,
  () => { const target = nextBirthdayTarget(); return `<p class="eyebrow">SCENE 11 · TIME CAPSULE</p><h1 class="scene-title">كبسولة الوقت</h1><div class="capsule-lock glass-panel"><div class="lock-icon" aria-hidden="true">♙</div><p class="scene-copy">رسالة مقفولة لحد عيد ميلادك الجاي.</p>${countdown(target).days === 0 ? `<p>${escapeHTML(CONFIG.capsule)}</p>` : `<div class="capsule-counter">${metricsMarkup(countdown(target))}</div><p class="time-note">هتتفتح يوم عيد ميلادك الجاي بتوقيت القاهرة.</p>`}</div><button class="primary-button" data-action="next">ندور على نجمتك</button>`; },
  () => { const found = Boolean(savedState.secretStar); return `<p class="eyebrow">SCENE 12 · SECRET STAR</p><h1 class="scene-title">نجمتك السرية</h1><p class="scene-copy">في نجمة مستخبية هنا… لمسة واحدة وتبقى ليكي.</p><button class="secret-star" data-action="secret-star" aria-label="المسي النجمة السرية">${found ? '✦' : '·'}</button><p id="secret-message" class="promise-text" aria-live="polite">${found ? 'لقيتي نجمتك السرية ✨' : 'دوري عليها واضغطي.'}</p><button class="primary-button" data-action="next">الرسالة مستنياكي</button>`; },
  () => `<p class="eyebrow">SCENE 14 · FINAL ENVELOPE</p><h1 class="scene-title">رسالة لرونشتي</h1><p class="scene-copy">في كلام اتجمع في قلبي، وكل ظرف جواه رسالة خاصة. افتحي اللي تحبيه واحدة واحدة.</p><div class="letter-card glass-panel"><div class="letter-envelope-grid">${CONFIG.letter.pages.map((_, index) => `<button class="letter-envelope" type="button" data-letter-envelope="${index}" aria-label="افتحي الظرف ${index + 1}"><img class="envelope-icon" src="${CONFIG.assets.envelope}" alt="" width="512" height="512" loading="lazy"/><span>ظرف ${new Intl.NumberFormat('ar-EG').format(index + 1)}</span></button>`).join('')}</div><div id="letter-area" class="letter-open-area" hidden></div></div><button class="primary-button" data-action="next">لكلام من قلبي</button>`,
  () => `<p class="eyebrow">SCENE 15 · JUST FOR YOU</p><h1 class="scene-title">علشانك</h1><div class="portal-orbit" aria-hidden="true"><span class="floating-title">يوسف</span><span class="floating-title">القمر بتاعي</span><span class="floating-title">بحبك أوي</span><span class="portal-heart">♥</span></div><p class="scene-copy">أنا عامل كل ده علشانك، علشان القمر بتاعي، وعلشان بحبك. ممكن تقبليها مني؟</p><p class="letter-signature">يوسف بحبك أوي ♡</p><div class="button-row"><button class="primary-button" data-action="next">لآخر ضوء</button><button class="secondary-button" data-action="previous">المشهد اللي فات</button></div>`,
  () => `<p class="eyebrow">SCENE 16 · LAST LIGHT</p><h1 class="scene-title">آخر ضوء <span class="latin">✦ RENAD ✦</span></h1><div class="portal-orbit" aria-hidden="true"><span class="floating-title">${escapeHTML(CONFIG.decorNames[0])}</span><span class="floating-title">${escapeHTML(CONFIG.decorNames[3])}</span><span class="floating-title">${escapeHTML(CONFIG.decorNames[14])}</span><span class="portal-heart">♥</span></div><p class="rotating-title" aria-live="polite"></p><p class="scene-copy">ودي كانت رحلتك في عالم معمول مخصوص ليكي… يا بنوتي، يا طفلتي، يا روحي، يا نور عيني، يا قلبي. إنتِ أغلى حاجة عندي، وأكتر حاجة بحبها.</p><div class="button-row"><button class="primary-button" data-action="restart">إعادة الرحلة</button><button class="secondary-button" data-action="previous">المشهد اللي فات</button><button class="soft-button" data-action="music">الموسيقى</button></div>`,
];

function renderScene(index, { save = true } = {}) {
  currentScene = Math.max(0, Math.min(sceneCount - 1, index));
  stage.dataset.scene = String(currentScene);
  clearInterval(titleInterval); clearTimeout(typeTimer); letterOpened = false;
  const view = sceneViews[currentScene];
  stage.innerHTML = `<div class="scene-content">${view()}</div>`;
  applyAssetFallbacks(stage);
  document.querySelector('#scene-counter').textContent = `${String(storyNumber(currentScene)).padStart(2, '0')} / ${storyTotal}`;
  document.querySelector('#scene-name').textContent = CONFIG.scenes[currentScene];
  document.querySelector('#progress-fill').style.setProperty('--progress', String(storyNumber(currentScene) / storyTotal));
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(storyNumber(currentScene)));
  document.querySelector('.progress-track').setAttribute('aria-valuemax', String(storyTotal));
  document.querySelector('#scene-links').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', i === currentScene ? 'step' : 'false'));
  if (save) saveProgress();
  stage.focus({ preventScroll: true });
  if (currentScene === 1 || currentScene === 14) startTitleRotation();
  if (currentScene === 9) drawNameConstellation();
  if (letterReturnPending && currentScene !== 12) {
    const returnButton = document.createElement('button'); returnButton.className = 'soft-button letter-return'; returnButton.textContent = 'العودة لصفحة الرسالة'; returnButton.dataset.action = 'return-letter'; stage.querySelector('.scene-content').append(returnButton);
  }
  updateTimers();
}
function startTitleRotation() {
  let i = 0; const target = stage.querySelector('.rotating-title');
  if (!target) return;
  const show = () => { if (target.isConnected) target.textContent = CONFIG.titles[i++ % CONFIG.titles.length]; };
  show(); titleInterval = setInterval(show, 2400);
}
function sceneMenu() {
  const links = document.querySelector('#scene-links');
  links.textContent = '';
  CONFIG.scenes.forEach((name, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'scene-link'; button.textContent = `${String(storyNumber(index)).padStart(2, '0')} · ${name}`;
    button.addEventListener('click', () => { renderScene(index); closeMenu(); }); links.append(button);
  });
}
function closeMenu() { const menu = document.querySelector('#scene-menu'); menu.hidden = true; document.querySelector('#scene-menu-toggle').setAttribute('aria-expanded', 'false'); }
function openGallery(index) {
  galleryIndex = index; const item = CONFIG.assets.memories[galleryIndex];
  document.querySelector('#gallery-image').src = item.file; document.querySelector('#gallery-image').alt = item.alt;
  document.querySelector('#gallery-caption').textContent = item.caption;
  document.querySelector('#gallery-dialog').showModal();
}
function changeGallery(delta) { galleryIndex = (galleryIndex + delta + CONFIG.assets.memories.length) % CONFIG.assets.memories.length; openGallery(galleryIndex); }
function typeLetter() {
  const page = CONFIG.letter.pages[letterPage];
  const area = document.querySelector('#letter-area'); if (!area) return;
  area.hidden = false;
  const text = page.text; let index = 0;
  area.innerHTML = `<div class="letter-open-heading"><p class="page-count">رسالة ${new Intl.NumberFormat('ar-EG').format(letterPage + 1)} من ${new Intl.NumberFormat('ar-EG').format(CONFIG.letter.pages.length)}</p><button class="soft-button" data-action="close-letter">إغلاق الظرف</button></div><p class="letter-text" id="typed-letter" aria-live="polite"></p><button class="secondary-button" data-action="letter-destination">${escapeHTML(page.linkLabel)}</button><p class="letter-signature" id="letter-signature" hidden>${escapeHTML(CONFIG.letter.signature)}</p>`;
  const output = area.querySelector('#typed-letter');
  const next = () => { if (index < text.length) { output.textContent += text[index++]; typeTimer = setTimeout(next, 36); } else area.querySelector('#letter-signature').hidden = false; };
  next();
}
function finishTyping() { clearTimeout(typeTimer); const output = document.querySelector('#typed-letter'); if (output) output.textContent = CONFIG.letter.pages[letterPage].text; const sig = document.querySelector('#letter-signature'); if (sig) sig.hidden = false; }
function drawNameConstellation(pointer = null) {
  const canvas = document.querySelector('#name-stars'); if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2); const width = canvas.clientWidth; const height = canvas.clientHeight;
  canvas.width = width * ratio; canvas.height = height * ratio; ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height); ctx.font = `700 ${Math.min(56, width / 7)}px Cairo`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const text = 'ريناد'; const measure = ctx.measureText(text).width; const startX = (width - measure) / 2; const y = height / 2;
  const points = [];
  for (let x = 0; x < measure; x += 7) { const px = startX + x; const py = y + Math.sin(x * .08) * 3; points.push([px, py]); }
  ctx.beginPath(); points.forEach(([x, py], i) => i ? ctx.lineTo(x, py) : ctx.moveTo(x, py)); ctx.strokeStyle = 'rgba(189,164,255,.55)'; ctx.lineWidth = 1; ctx.stroke();
  points.forEach(([x, py], i) => {
    const baseY = py + Math.sin(i * 1.7) * 9; const dx = pointer ? x - pointer.x : 0; const dy = pointer ? baseY - pointer.y : 0;
    const distance = Math.hypot(dx, dy); const pull = distance < 46 ? (46 - distance) / 46 * 8 : 0;
    ctx.beginPath(); ctx.arc(x + (distance ? dx / distance * pull : 0), baseY + (distance ? dy / distance * pull : 0), (i % 5 === 0 ? 2 : 1.2) + (distance < 24 ? 1.1 : 0), 0, Math.PI * 2);
    ctx.fillStyle = i % 4 === 0 || distance < 24 ? '#ff8fcb' : '#fff8fc'; ctx.shadowColor = '#bda4ff'; ctx.shadowBlur = distance < 36 ? 13 : 7; ctx.fill();
  });
  if (!canvas.dataset.interactive) {
    canvas.dataset.interactive = 'true';
    canvas.addEventListener('pointermove', (event) => { const rect = canvas.getBoundingClientRect(); drawNameConstellation({ x: event.clientX - rect.left, y: event.clientY - rect.top }); });
    canvas.addEventListener('pointerleave', () => drawNameConstellation());
    canvas.addEventListener('pointerdown', (event) => { const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const spark = document.createElement('span'); spark.className = 'constellation-spark'; spark.textContent = '✦'; spark.style.left = `${event.clientX}px`; spark.style.top = `${event.clientY}px`; document.body.append(spark); setTimeout(() => spark.remove(), 700); drawNameConstellation({ x, y }); });
  }
}

stage.addEventListener('click', (event) => {
  const galleryButton = event.target.closest('[data-gallery]'); if (galleryButton) { openGallery(Number(galleryButton.dataset.gallery)); return; }
  const envelopeButton = event.target.closest('[data-letter-envelope]'); if (envelopeButton) { letterPage = Number(envelopeButton.dataset.letterEnvelope); letterOpened = true; typeLetter(); document.querySelector('#letter-area')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' }); return; }
  const promise = event.target.closest('[data-promise]'); if (promise) { const i = Number(promise.dataset.promise); promise.setAttribute('aria-expanded', 'true'); document.querySelector('#promise-text').textContent = CONFIG.promises[i]; return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'next') renderScene(currentScene + 1);
  if (action === 'previous') renderScene(currentScene - 1);
  if (action === 'return-letter') { letterReturnPending = false; renderScene(12, { save: false }); typeLetter(); }
  if (action === 'music') toggleAudio();
  if (action === 'restart') { savedState.scene = 0; renderScene(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (action === 'kind-note') { const lines = ['وجودك بيفرق.', 'في تفاصيل صغيرة بتخلّي اليوم أحلى.', 'كل حكاية حلوة بتبدأ بخطوة.']; const note = document.querySelector('#kind-note'); const previous = Number(note.dataset.index || -1); const next = (previous + 1) % lines.length; note.dataset.index = String(next); note.textContent = lines[next]; }
  if (action === 'secret-star') { savedState.secretStar = true; safeStorage.write(savedState); document.querySelector('#secret-message').textContent = 'لقيتي نجمتك السرية ✨'; event.target.textContent = '✦'; }
  if (action === 'close-letter') { clearTimeout(typeTimer); const area = document.querySelector('#letter-area'); if (area) { area.hidden = true; area.replaceChildren(); } letterOpened = false; }
  if (action === 'letter-destination') { finishTyping(); letterReturnPending = true; renderScene(CONFIG.letter.pages[letterPage].linkScene - 1, { save: false }); }
});

document.querySelector('#scene-menu-toggle').addEventListener('click', (event) => { const menu = document.querySelector('#scene-menu'); menu.hidden = !menu.hidden; event.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); });
document.querySelector('#menu-close').addEventListener('click', closeMenu);
document.querySelector('#home-button').addEventListener('click', () => renderScene(0));
document.querySelectorAll('[data-close-gallery]').forEach((button) => button.addEventListener('click', () => document.querySelector('#gallery-dialog').close()));
document.querySelector('.gallery-prev').addEventListener('click', () => changeGallery(-1));
document.querySelector('.gallery-next').addEventListener('click', () => changeGallery(1));
document.querySelector('#gallery-dialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
let galleryTouchStart = null;
document.querySelector('#gallery-dialog').addEventListener('touchstart', (event) => { galleryTouchStart = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
document.querySelector('#gallery-dialog').addEventListener('touchend', (event) => {
  if (galleryTouchStart === null) return;
  const delta = event.changedTouches[0].clientX - galleryTouchStart; galleryTouchStart = null;
  if (Math.abs(delta) > 45) changeGallery(delta < 0 ? 1 : -1);
}, { passive: true });
document.querySelector('#audio-toggle').addEventListener('click', toggleAudio);
document.querySelector('#play-button').addEventListener('click', toggleAudio);
document.querySelector('#player-expand').addEventListener('click', () => setPlayerExpanded(document.querySelector('#player-dock').dataset.expanded !== 'true'));
document.querySelector('#volume').addEventListener('input', (event) => { audio.volume = Number(event.currentTarget.value); savedState.volume = audio.volume; safeStorage.write(savedState); });
function updateMuteButton() {
  const button = document.querySelector('#mute-button');
  button.textContent = audio.muted || audio.volume === 0 ? '◖×' : '◖))';
  button.setAttribute('aria-label', audio.muted || audio.volume === 0 ? 'إلغاء كتم الصوت' : 'كتم الصوت');
  button.title = button.getAttribute('aria-label');
}
document.querySelector('#mute-button').addEventListener('click', () => {
  audio.muted = !audio.muted; savedState.muted = audio.muted; safeStorage.write(savedState); updateMuteButton();
});
document.querySelector('#seek').addEventListener('input', (event) => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.currentTarget.value) / 100 * audio.duration; });
document.querySelector('#track-previous').addEventListener('click', () => changeTrack(-1));
document.querySelector('#track-next').addEventListener('click', () => changeTrack(1));
document.querySelector('#motion-toggle').addEventListener('click', (event) => { reducedMotion = !reducedMotion; document.body.classList.toggle('reduce-motion', reducedMotion); event.currentTarget.setAttribute('aria-pressed', String(reducedMotion)); savedState.reducedMotion = reducedMotion; safeStorage.write(savedState); if (!reducedMotion && !starsScheduled) { starsScheduled = true; animateStars(); } });
audio.src = CONFIG.assets.songs[0].file; audio.volume = Number.isFinite(savedState.volume) ? savedState.volume : .75; document.querySelector('#volume').value = String(audio.volume);
audio.muted = Boolean(savedState.muted); updateMuteButton();
const qualitySelect = document.querySelector('#quality-select');
qualitySelect.value = quality; document.body.dataset.quality = quality;
qualitySelect.addEventListener('change', () => {
  quality = qualitySelect.value; document.body.dataset.quality = quality;
  savedState.quality = quality; safeStorage.write(savedState); resizeStars();
});
function changeTrack(delta) {
  currentTrack = (currentTrack + delta + CONFIG.assets.songs.length) % CONFIG.assets.songs.length;
  const song = CONFIG.assets.songs[currentTrack]; audio.pause(); audio.src = song.file; audio.currentTime = 0;
  document.querySelector('#track-title').textContent = song.title; document.querySelector('#track-state').textContent = 'جاهزة لما تحبي تسمعيها'; document.querySelector('#player-dock > img').src = song.cover;
  document.querySelector('#play-button').textContent = '▶';
}
function toggleAudio() {
  if (audio.paused) { setPlayerExpanded(true); audio.play().then(() => { document.querySelector('#track-state').textContent = 'بتتعزف دلوقتي'; document.querySelector('#play-button').textContent = 'Ⅱ'; document.querySelector('#play-button').setAttribute('aria-label', 'إيقاف الأغنية'); document.querySelector('#audio-toggle').setAttribute('aria-label', 'إيقاف الموسيقى'); }).catch(() => { document.querySelector('#track-state').textContent = 'ملف الأغنية مش متاح دلوقتي'; document.querySelector('#song-message')?.replaceChildren(document.createTextNode('ملف الأغنية مش متاح، والرحلة هتكمل عادي.')); }); }
  else { audio.pause(); document.querySelector('#track-state').textContent = 'متوقفة'; document.querySelector('#play-button').textContent = '▶'; document.querySelector('#play-button').setAttribute('aria-label', 'تشغيل حلف القمر'); document.querySelector('#audio-toggle').setAttribute('aria-label', 'تشغيل الموسيقى'); }
}
function mediaTime(seconds) { return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}` : '--:--'; }
audio.addEventListener('loadedmetadata', () => { document.querySelector('#track-time').style.display = 'block'; document.querySelector('#track-time').textContent = `0:00 / ${mediaTime(audio.duration)}`; });
audio.addEventListener('timeupdate', () => { if (audio.duration) { const progress = audio.currentTime / audio.duration * 100; document.querySelector('#song-progress')?.style.setProperty('width', `${progress}%`); document.querySelector('#seek').value = String(progress); document.querySelector('#track-time').textContent = `${mediaTime(audio.currentTime)} / ${mediaTime(audio.duration)}`; } });
audio.addEventListener('ended', () => { document.querySelector('#track-state').textContent = 'خلصت الأغنية'; document.querySelector('#play-button').textContent = '▶'; });
audio.addEventListener('error', () => { document.querySelector('#track-state').textContent = 'الأغنية مش متاحة'; document.querySelector('#song-message')?.replaceChildren(document.createTextNode('ملف الأغنية مش متاح، تقدري تكملي الرحلة من غيره.')); });

const stars = document.querySelector('#stars'); const starContext = stars.getContext('2d'); let starDots = []; let starsScheduled = false;
function resizeStars() { const ratio = Math.min(window.devicePixelRatio || 1, quality === 'cinematic' ? 2 : 1.5); stars.width = innerWidth * ratio; stars.height = innerHeight * ratio; stars.style.width = `${innerWidth}px`; stars.style.height = `${innerHeight}px`; starContext.setTransform(ratio, 0, 0, ratio, 0, 0); const divisor = quality === 'cinematic' ? 7 : quality === 'light' ? 22 : 12; const limit = quality === 'cinematic' ? 180 : quality === 'light' ? 42 : 90; starDots = Array.from({ length: Math.min(limit, Math.floor(innerWidth / divisor)) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.4 + .25, a: Math.random() * .6 + .2, d: Math.random() * .005 + .001, vx: (Math.random() - .5) * .075, vy: -.025 - Math.random() * .06 })); }
function animateStars() { if (!starContext) return; starContext.clearRect(0, 0, innerWidth, innerHeight); for (const star of starDots) { star.a += star.d; star.x += star.vx; star.y += star.vy; if (star.a > .8 || star.a < .15) star.d *= -1; if (star.x < -2) star.x = innerWidth + 2; if (star.x > innerWidth + 2) star.x = -2; if (star.y < -2) star.y = innerHeight + 2; starContext.beginPath(); starContext.arc(star.x, star.y, star.r, 0, Math.PI * 2); starContext.fillStyle = `rgba(239,221,255,${star.a})`; starContext.fill(); } if (!reducedMotion) requestAnimationFrame(animateStars); else starsScheduled = false; }
window.addEventListener('resize', () => { resizeStars(); if (currentScene === 9) drawNameConstellation(); });
function setTimerDigit(node, value) {
  const nextValue = pad(value);
  if (node.textContent === nextValue) return;
  node.textContent = nextValue;
  if (reducedMotion || typeof node.animate !== 'function') return;
  node.getAnimations().forEach((animation) => animation.cancel());
  node.animate([
    { transform: 'perspective(520px) rotateX(-82deg) rotateY(-8deg)', opacity: 0.18 },
    { transform: 'perspective(520px) rotateX(0deg) rotateY(0deg)', opacity: 1 },
  ], { duration: 460, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'none' });
}
function updateTimers() {
  stage.querySelectorAll('[data-unit]').forEach((node) => {
    const units = node.closest('.scene-content')?.querySelectorAll('[data-unit]'); if (!units?.length) return;
    if (currentScene === 2) {
      const target = cairoWallTimeToUTC(CONFIG.dates.firstTalk); const elapsed = elapsedSince(target);
      setTimerDigit(node, elapsed[node.dataset.unit]);
    }
    else if (currentScene === 3) {
      const timer = engagementDuration(cairoWallTimeToUTC(CONFIG.dates.engagement));
      setTimerDigit(node, timer.values[node.dataset.unit]);
      const label = document.querySelector('#engagement-count-label');
      if (label) label.textContent = timer.future ? 'العدّ التنازلي ليوم الارتباط' : 'من يوم الارتباط';
    } else { const time = countdown(nextBirthdayTarget()); setTimerDigit(node, time[node.dataset.unit]); }
  });
  const clock = document.querySelector('#cairo-clock'); if (clock) clock.textContent = formatDateTime();
}
setInterval(updateTimers, 1000);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeMenu(); if (document.querySelector('#gallery-dialog').open) document.querySelector('#gallery-dialog').close(); }
  if (document.querySelector('#gallery-dialog').open && event.key === 'ArrowRight') changeGallery(1);
  if (document.querySelector('#gallery-dialog').open && event.key === 'ArrowLeft') changeGallery(-1);
});

function initBirthdayMode() {
  const today = dateParts();
  if (today.month !== 2 || today.day !== 25 || savedState.birthdayDismissed === `${today.year}-02-25`) return;
  const banner = document.createElement('div'); banner.className = 'birthday-banner'; banner.innerHTML = '<section class="glass-panel letter-card" role="dialog" aria-modal="true" aria-labelledby="birthday-title"><p class="eyebrow">A LITTLE CELEBRATION</p><h2 id="birthday-title" class="scene-title">كل سنة وإنتِ طيبة يا ريناد ♥</h2><p class="scene-copy">يوم ميلاد أحسن البشر 🌙 — اليوم اللي الدنيا نورت فيه بوجودك يا حبيبتي.</p><button class="primary-button" data-dismiss-birthday>كمّلي الرحلة</button></section>';
  document.body.append(banner); banner.querySelector('[data-dismiss-birthday]').focus(); banner.querySelector('[data-dismiss-birthday]').addEventListener('click', () => { savedState.birthdayDismissed = `${today.year}-02-25`; safeStorage.write(savedState); banner.remove(); });
}
sceneMenu(); resizeStars(); if (!reducedMotion) { starsScheduled = true; animateStars(); }
document.querySelector('#motion-toggle').setAttribute('aria-pressed', String(reducedMotion)); if (reducedMotion) document.body.classList.add('reduce-motion');
document.querySelector('#loading-note').remove();
const resumeIndex = Number.isInteger(savedState.scene) ? Math.max(0, Math.min(sceneCount - 1, savedState.scene)) : 0;
if (resumeIndex > 0 && savedState.scene !== undefined) {
  stage.innerHTML = `<div class="scene-content glass-panel letter-card"><p class="eyebrow">WELCOME BACK</p><h1 class="scene-title">نكمّل من آخر مكان؟</h1><p class="scene-copy">آخر مرة وقفنا عند: ${escapeHTML(CONFIG.scenes[resumeIndex])}</p><div class="button-row"><button class="primary-button" id="resume-journey">كمّلي الرحلة</button><button class="secondary-button" id="restart-journey">ابدئي من الأول</button></div></div>`;
  document.querySelector('#resume-journey').addEventListener('click', () => renderScene(resumeIndex));
  document.querySelector('#restart-journey').addEventListener('click', () => renderScene(0));
} else renderScene(0);
initBirthdayMode();
prepareAssets(CONFIG.assets);
