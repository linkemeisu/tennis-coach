/* ================================================================
   网球排课 App — 数据层 / 解析器 / 语音 / 日历 / UI
   ================================================================ */

// ==================== DATA LAYER ====================

const STORAGE_KEY = 'tennis_data';

let appData = { students: [], lessons: [] };

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { appData = JSON.parse(raw); } catch (e) { /* ignore */ }
  }
  // First-time: load demo data so the app isn't empty
  if (appData.students.length === 0) {
    appData = getDemoData();
    saveData();
  }
}

function getDemoData() {
  var t = todayStr();
  var y = offsetDate(-1);
  var d1 = { students: [], lessons: [] };

  // Demo students
  var s1 = { id: 'demo1', name: '张三', createdAt: t };
  var s2 = { id: 'demo2', name: '李四', createdAt: t };
  var s3 = { id: 'demo3', name: '王五', createdAt: t };
  d1.students = [s1, s2, s3];

  function mkLesson(s, date, start, durMin, status) {
    var sh = start.split(':')[0], sm = start.split(':')[1];
    var eh = parseInt(sh), em = parseInt(sm) + durMin;
    eh += Math.floor(em / 60); em = em % 60;
    var end = eh.toString().padStart(2,'0') + ':' + em.toString().padStart(2,'0');
    return {
      id: 'demo' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      studentId: s.id, studentName: s.name,
      date: date, startTime: start, endTime: end,
      duration: durMin, status: status || 'upcoming',
      calendarAdded: false, createdAt: new Date().toISOString()
    };
  }

  // Today's lessons
  d1.lessons.push(mkLesson(s1, t, '09:00', 60));
  d1.lessons.push(mkLesson(s2, t, '14:00', 90));
  d1.lessons.push(mkLesson(s3, t, '16:00', 60));

  // Upcoming
  d1.lessons.push(mkLesson(s1, offsetDate(1), '10:00', 60));
  d1.lessons.push(mkLesson(s2, offsetDate(2), '09:00', 60));
  d1.lessons.push(mkLesson(s3, offsetDate(3), '15:00', 120));
  d1.lessons.push(mkLesson(s1, offsetDate(5), '08:00', 60));

  // Completed (past)
  d1.lessons.push(mkLesson(s2, y, '10:00', 60, 'completed'));
  d1.lessons.push(mkLesson(s3, y, '14:00', 60, 'completed'));
  d1.lessons.push(mkLesson(s1, offsetDate(-2), '09:00', 90, 'completed'));
  d1.lessons.push(mkLesson(s2, offsetDate(-3), '15:00', 60, 'completed'));
  d1.lessons.push(mkLesson(s3, offsetDate(-4), '11:00', 60, 'completed'));

  return d1;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  autoPushOnChange();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getStudents() { return appData.students; }

function addStudent(name) {
  name = name.trim();
  if (!name) return null;
  const existing = appData.students.find(s => s.name === name);
  if (existing) return existing;
  const s = { id: uid(), name, createdAt: todayStr() };
  appData.students.push(s);
  saveData();
  return s;
}

function deleteStudent(id) {
  appData.students = appData.students.filter(s => s.id !== id);
  appData.lessons = appData.lessons.filter(l => l.studentId !== id);
  saveData();
}

function findOrCreateStudent(name) {
  const existing = appData.students.find(s => s.name === name.trim());
  if (existing) return existing;
  return addStudent(name.trim());
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function nowTimeStr() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function getLessons(status) {
  let filtered = status ? appData.lessons.filter(l => l.status === status) : [...appData.lessons];
  filtered.sort((a, b) => {
    const da = a.date + 'T' + a.startTime;
    const db = b.date + 'T' + b.startTime;
    return status === 'completed' ? db.localeCompare(da) : da.localeCompare(db);
  });
  return filtered;
}

function getUpcomingLessons() { return getLessons('upcoming'); }

function getCompletedLessons() { return getLessons('completed'); }

function getTodayLessons() {
  const today = todayStr();
  return appData.lessons.filter(l => l.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function addLesson(lesson) {
  lesson.id = uid();
  lesson.createdAt = new Date().toISOString();
  lesson.calendarAdded = false;
  appData.lessons.push(lesson);
  saveData();
  return lesson;
}

function updateLesson(id, updates) {
  const lesson = appData.lessons.find(l => l.id === id);
  if (lesson) Object.assign(lesson, updates);
  saveData();
}

function deleteLesson(id) {
  appData.lessons = appData.lessons.filter(l => l.id !== id);
  saveData();
}

function archiveCompletedLessons() {
  const now = new Date();
  const today = todayStr();
  const nowTime = nowTimeStr();
  let changed = false;
  appData.lessons.forEach(l => {
    if (l.status === 'upcoming') {
      if (l.date < today || (l.date === today && l.endTime <= nowTime)) {
        l.status = 'completed';
        changed = true;
      }
    }
  });
  if (changed) saveData();
}

function getStudentLessonCount(studentId) {
  return appData.lessons.filter(l => l.studentId === studentId && l.status === 'completed').length;
}

function getStudentMonthCount(studentId) {
  const m = todayStr().slice(0, 7);
  return appData.lessons.filter(l => l.studentId === studentId && l.status === 'completed' && l.date.startsWith(m)).length;
}

// ==================== CHINESE PARSER ====================

const DATE_PATTERNS = [
  { re: /今天/, fn: () => todayStr() },
  { re: /明天/, fn: () => offsetDate(1) },
  { re: /后天/, fn: () => offsetDate(2) },
  { re: /大后天/, fn: () => offsetDate(3) },
  { re: /下周([一二三四五六日天])/, fn: (m) => nextWeekday(m[1]) },
  { re: /(\d{1,2})月(\d{1,2})[号日]/, fn: (m) => dateStr(parseInt(m[1]), parseInt(m[2])) },
  { re: /(\d{1,2})[号日]/, fn: (m) => dateStr(undefined, parseInt(m[1])) },
];

const TIME_PATTERNS = [
  { re: /(早上|上午|中午|下午|晚上|傍晚)?(\d{1,2})[点:：](\d{1,2})[分]?/, fn: (m) => parseTime(m[1], m[2], m[3]) },
  { re: /(早上|上午|中午|下午|晚上|傍晚)?(\d{1,2})[点:：]半/, fn: (m) => parseTime(m[1], m[2], '30') },
  { re: /(早上|上午|中午|下午|晚上|傍晚)?(\d{1,2})[点:：]/, fn: (m) => parseTime(m[1], m[2], '00') },
];

const DURATION_PATTERNS = [
  { re: /(\d{1,2})[个]?半[小]?时/, fn: (m) => parseInt(m[1]) * 60 + 30 },
  { re: /(\d{1,2})[个]?[小]?时/, fn: (m) => parseInt(m[1]) * 60 },
  { re: /半[个]?[小]?时/, fn: () => 30 },
];

const ENDTIME_PATTERN = /到(\d{1,2})[点:：](\d{0,2})?/;

function offsetDate(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateStr(month, day) {
  const y = new Date().getFullYear();
  const m = (month || new Date().getMonth() + 1).toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextWeekday(ch) {
  const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
  const target = map[ch] !== undefined ? map[ch] : 0;
  const today = new Date();
  const todayDay = today.getDay();
  let diff = target - todayDay;
  if (diff <= 0) diff += 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function parseTime(period, hour, min) {
  let h = parseInt(hour);
  const m = parseInt(min) || 0;
  if (period) {
    if (period.includes('下午') || period.includes('晚上') || period.includes('傍晚')) {
      if (h !== 12) h += 12;
    } else if (period.includes('中午') && h < 12) {
      h += 12;
    } else if ((period.includes('早上') || period.includes('上午')) && h === 12) {
      h = 0;
    }
  }
  return { hour: h, min: m, str: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}` };
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${nh.toString().padStart(2,'0')}:${nm.toString().padStart(2,'0')}`;
}

function parseVoiceInput(text) {
  const original = text.trim();
  let remaining = original;

  // Extract date
  let date = null;
  let dateMatchStr = '';
  for (const p of DATE_PATTERNS) {
    const m = remaining.match(p.re);
    if (m) {
      date = p.fn(m);
      dateMatchStr = m[0];
      remaining = remaining.replace(m[0], ' ');
      break;
    }
  }
  if (!date) date = todayStr();

  // Extract end time first (before start time, to avoid confusion)
  let endTime = null;
  const endMatch = remaining.match(ENDTIME_PATTERN);
  if (endMatch) {
    const h = parseInt(endMatch[1]);
    const m = endMatch[2] ? parseInt(endMatch[2]) : 0;
    // Guess period from context (simplified: if hour <= 7 or 12+ it's PM)
    // Actually, use a simple heuristic: if start time found later is PM, end is PM too
    endTime = { hour: h, min: m };
    remaining = remaining.replace(endMatch[0], ' ');
  }

  // Extract start time
  let startTime = null;
  let timeMatchStr = '';
  for (const p of TIME_PATTERNS) {
    const m = remaining.match(p.re);
    if (m) {
      startTime = p.fn(m);
      timeMatchStr = m[0];
      remaining = remaining.replace(m[0], ' ');
      break;
    }
  }

  // If end time matched but without period, adjust based on start time
  if (endTime && startTime) {
    let eh = endTime.hour;
    // If end hour < start hour (in 24h), likely PM continuation
    if (eh < startTime.hour) eh += 12;
    // If start is PM and end hour seems small, add 12
    if (startTime.hour >= 12 && eh < 12) eh += 12;
    endTime = `${eh.toString().padStart(2,'0')}:${endTime.min.toString().padStart(2,'0')}`;
  } else {
    endTime = null;
  }

  // Extract duration
  let durationMins = null;
  for (const p of DURATION_PATTERNS) {
    const m = remaining.match(p.re);
    if (m) {
      durationMins = p.fn(m);
      remaining = remaining.replace(m[0], ' ');
      break;
    }
  }

  // Extract student name (everything before the first matched pattern, or all remaining)
  let studentName = '';
  if (dateMatchStr || timeMatchStr) {
    // Find the earliest match position
    let firstIdx = Infinity;
    if (dateMatchStr) firstIdx = Math.min(firstIdx, original.indexOf(dateMatchStr));
    if (timeMatchStr) firstIdx = Math.min(firstIdx, original.indexOf(timeMatchStr));
    studentName = original.slice(0, firstIdx).trim();
  } else {
    studentName = remaining.trim();
  }

  // If no explicit time found, leave blank for user to fill
  if (!startTime) startTime = null;

  // Calculate endTime from duration if not explicitly set
  if (!endTime && startTime && durationMins) {
    endTime = addMinutes(startTime.str, durationMins);
  } else if (!endTime && startTime) {
    endTime = addMinutes(startTime.str, 60); // default 1 hour
  }

  // If name is empty, try to use remaining text
  if (!studentName) {
    studentName = remaining.replace(/[，,。.\s]/g, '').trim();
  }

  return {
    studentName: studentName || '',
    date: date,
    startTime: startTime ? startTime.str : '',
    endTime: endTime || '',
    durationMins: durationMins || 60,
  };
}

// ==================== SPEECH ====================

function startVoiceInput(callback) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('语音识别需要 iOS Safari 浏览器。请在 Safari 中打开此页面。');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = function (event) {
    const text = event.results[0][0].transcript;
    // iOS sometimes adds punctuation — normalize
    const clean = text.replace(/[，。！？、,\.!\?]/g, ' ').replace(/\s+/g, ' ').trim();
    callback(clean);
  };

  recognition.onerror = function (event) {
    if (event.error === 'not-allowed') {
      alert('请允许麦克风权限才能使用语音输入。\n设置 > Safari > 麦克风');
    } else if (event.error !== 'aborted') {
      alert('语音识别失败：' + event.error + '\n请重试。');
    }
  };

  recognition.start();
  return recognition;
}

// ==================== CALENDAR ====================

function generateICS(lesson) {
  const dtStart = lesson.date.replace(/-/g, '') + 'T' + lesson.startTime.replace(/:/g, '') + '00';
  const dtEnd = lesson.date.replace(/-/g, '') + 'T' + lesson.endTime.replace(/:/g, '') + '00';
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tennis Coach//ZH',
    'BEGIN:VEVENT',
    'DTSTART:' + dtStart,
    'DTEND:' + dtEnd,
    'SUMMARY:' + lesson.studentName + ' 网球课',
    'DESCRIPTION:网球课 - ' + lesson.studentName,
    'DTSTAMP:' + now,
    'BEGIN:VALARM',
    'TRIGGER:-PT3H',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + lesson.studentName + '的网球课将在3小时后开始',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function addToCalendar(lesson, onSuccess) {
  const ics = generateICS(lesson);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = lesson.studentName + '_网球课.ics';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);

  updateLesson(lesson.id, { calendarAdded: true });
  if (onSuccess) onSuccess();
}

// ==================== UI RENDERING ====================

let currentTab = 'home';
let currentLessonFilter = 'upcoming';

// Cache DOM refs
const $ = function (sel) { return document.querySelector(sel); };
const $$ = function (sel) { return document.querySelectorAll(sel); };

function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
}

function renderAll() {
  archiveCompletedLessons();
  switch (currentTab) {
    case 'home': renderHome(); break;
    case 'lessons': renderLessonList(); break;
    case 'students': renderStudentList(); break;
  }
}

// ---- HOME ----

function renderHome() {
  const main = $('main');
  const today = todayStr();
  const todayLessons = getTodayLessons();
  const upcoming = getUpcomingLessons();
  const completed = getCompletedLessons();
  const monthStr = today.slice(0, 7);
  const monthLessons = completed.filter(function (l) { return l.date.startsWith(monthStr); });

  let html = '';

  // Stats
  html += '<div class="stats-row">';
  html += '<div class="stat-card"><div class="num">' + upcoming.length + '</div><div class="label">即将上课</div></div>';
  html += '<div class="stat-card"><div class="num">' + monthLessons.length + '</div><div class="label">本月已完成</div></div>';
  html += '<div class="stat-card"><div class="num">' + appData.students.length + '</div><div class="label">学生人数</div></div>';
  html += '</div>';

  // Batch calendar for unsynced upcoming
  var unsyncedUpcoming = upcoming.filter(function (l) { return !l.calendarAdded; });
  if (unsyncedUpcoming.length > 0) {
    html += '<div class="batch-bar">';
    html += '<button id="btn-batch-calendar">全部添加到日历（' + unsyncedUpcoming.length + '节）</button>';
    html += '</div>';
  }

  // Today — collapsed by default, show 5 max with "more" hint
  var todayCount = todayLessons.length;
  var collapsedLimit = todayCount <= 4 ? 4 : 5;
  var hasMore = todayCount > collapsedLimit;
  var collapsedItems = todayLessons.slice(0, collapsedLimit);

  html += '<div class="section-title" id="today-toggle" style="cursor:pointer;display:flex;align-items:center;gap:4px">';
  html += '今日 <span id="today-arrow" class="toggle-arrow collapsed">&#9654;</span>';
  if (todayCount > 0) html += '<span style="font-weight:400;color:var(--text-tertiary);font-size:12px;margin-left:4px">' + todayCount + '节</span>';
  html += '</div>';

  // Collapsed view
  html += '<div id="today-collapsed">';
  if (todayCount === 0) {
    html += '<div class="card"><div class="empty" style="padding:20px"><p>今天没有课程</p></div></div>';
  } else {
    html += '<div class="card">';
    collapsedItems.forEach(function (l) { html += lessonItemHTML(l); });
    if (hasMore) {
      html += '<div style="text-align:center;padding:10px;font-size:12px;color:var(--text-tertiary);opacity:0.5;border-top:1px solid var(--border)">还有 ' + (todayCount - collapsedLimit) + ' 节...</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Expanded view (hidden by default)
  html += '<div id="today-expanded" style="display:none">';
  if (todayCount > 0) {
    html += '<div class="card">';
    todayLessons.forEach(function (l) { html += lessonItemHTML(l); });
    html += '</div>';
  }
  html += '</div>';

  // Upcoming — group by date, Apple Calendar style
  const future = upcoming.filter(function (l) { return l.date > today; });
  if (future.length > 0) {
    var grouped = {};
    future.forEach(function (l) {
      if (!grouped[l.date]) grouped[l.date] = [];
      grouped[l.date].push(l);
    });
    var dates = Object.keys(grouped).sort().slice(0, 6);

    html += '<div class="section-title">即将到来</div>';
    dates.forEach(function (date) {
      var d = new Date(date + 'T00:00:00');
      var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      var md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      var label = md + ' ' + weekdays[d.getDay()];
      if (date === offsetDate(1)) label = '明天 ' + weekdays[d.getDay()] + ' · ' + md;
      if (date === offsetDate(2)) label = '后天 ' + weekdays[d.getDay()] + ' · ' + md;

      html += '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:14px 0 6px 2px">' + label + '</div>';
      html += '<div class="card">';
      grouped[date].forEach(function (l) { html += lessonItemHTML(l); });
      html += '</div>';
    });
  }

  main.innerHTML = html;

  // Today toggle
  var todayToggle = $('#today-toggle');
  if (todayToggle) {
    var collapsed = true;
    todayToggle.addEventListener('click', function () {
      collapsed = !collapsed;
      var collapsedEl = $('#today-collapsed');
      var expandedEl = $('#today-expanded');
      var arrow = $('#today-arrow');
      if (collapsed) {
        collapsedEl.style.display = 'block';
        expandedEl.style.display = 'none';
        arrow.classList.add('collapsed');
        arrow.innerHTML = '&#9654;';
      } else {
        collapsedEl.style.display = 'none';
        expandedEl.style.display = 'block';
        arrow.classList.remove('collapsed');
        arrow.innerHTML = '&#9660;';
      }
    });
  }

  bindLessonActions();
}

// ---- LESSON LIST ----

function renderLessonList() {
  const main = $('main');
  const lessons = currentLessonFilter === 'upcoming' ? getUpcomingLessons() : getCompletedLessons();

  let html = '';
  html += '<div class="seg-tabs">';
  html += '<button class="' + (currentLessonFilter === 'upcoming' ? 'active' : '') + '" data-filter="upcoming">未上课</button>';
  html += '<button class="' + (currentLessonFilter === 'completed' ? 'active' : '') + '" data-filter="completed">已上课</button>';
  html += '</div>';

  // Batch calendar for upcoming
  if (currentLessonFilter === 'upcoming' && lessons.length > 0) {
    var unsynced = lessons.filter(function (l) { return !l.calendarAdded; });
    if (unsynced.length > 0) {
      html += '<div class="batch-bar">';
      html += '<button id="btn-batch-calendar">全部添加到日历（' + unsynced.length + '节）</button>';
      html += '</div>';
    }
  }

  if (lessons.length === 0) {
    html += '<div class="empty"><p>' +
      (currentLessonFilter === 'upcoming' ? '暂无未上课程' : '暂无已完成课程') +
      '</p></div>';
  } else {
    html += '<div class="card">';
    lessons.forEach(function (l) { html += lessonItemHTML(l); });
    html += '</div>';
  }

  main.innerHTML = html;

  // Bind segment tab clicks
  $$('.seg-tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentLessonFilter = btn.dataset.filter;
      renderLessonList();
    });
  });

  bindLessonActions();
}

// ---- STUDENT LIST ----

function renderStudentList() {
  const main = $('main');
  const students = getStudents();

  let html = '<div class="section-title">学生</div>';

  if (students.length === 0) {
    html += '<div class="empty"><p>还没有学生<br>添加课程时会自动创建学生档案</p></div>';
  } else {
    html += '<div class="card">';
    students.sort(function (a, b) { return getStudentLessonCount(b.id) - getStudentLessonCount(a.id); });
    students.forEach(function (s) {
      const total = getStudentLessonCount(s.id);
      const month = getStudentMonthCount(s.id);
      html += '<div class="student-item" data-sid="' + s.id + '">';
      html += '<div class="avatar">' + s.name.charAt(0) + '</div>';
      html += '<div class="info"><div class="name">' + s.name + '</div>';
      html += '<div class="meta">本月 ' + month + ' 节 · 共 ' + total + ' 节</div></div>';
      html += '<div class="count">' + total + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Add student button
  html += '<div style="margin-top:16px">';
  html += '<button class="btn btn-secondary" id="btn-add-student">+ 添加学生</button>';
  html += '</div>';

  // Inline add form (hidden by default)
  html += '<div id="inline-add-student" class="card" style="display:none;margin-top:8px;padding:12px">';
  html += '<div class="inline-form">';
  html += '<input type="text" id="new-student-name" placeholder="输入学生姓名">';
  html += '<button id="btn-save-student">添加</button>';
  html += '</div>';
  html += '</div>';

  // Sync section
  html += '<div class="card" style="margin-top:12px;padding:12px 16px">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">云同步</div>';
  html += '<div id="sync-status" style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">未设置同步</div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<input type="password" id="sync-token" placeholder="粘贴 GitHub Token" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#FAFAFA">';
  html += '<button class="btn btn-primary" id="btn-sync-save" style="width:auto;padding:8px 14px;font-size:12px">保存</button>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:8px">';
  html += '<button class="btn btn-secondary" id="btn-sync-push" style="flex:1;font-size:12px;padding:8px">上传到云端</button>';
  html += '<button class="btn btn-secondary" id="btn-sync-pull" style="flex:1;font-size:12px;padding:8px">从云端下载</button>';
  html += '</div>';
  html += '</div>';

  main.innerHTML = html;

  // Bind student clicks
  $$('.student-item').forEach(function (el) {
    el.addEventListener('click', function () {
      showStudentDetail(el.dataset.sid);
    });
  });

  // Bind add student — toggle inline form
  $('#btn-add-student').addEventListener('click', function () {
    var inline = $('#inline-add-student');
    inline.style.display = inline.style.display === 'none' ? 'block' : 'none';
    if (inline.style.display === 'block') {
      setTimeout(function () { $('#new-student-name').focus(); }, 100);
    }
  });

  // Save new student
  $('#btn-save-student').addEventListener('click', function () {
    var input = $('#new-student-name');
    var name = input.value.trim();
    if (!name) { alert('请输入学生姓名'); return; }
    addStudent(name);
    input.value = '';
    $('#inline-add-student').style.display = 'none';
    showToast('已添加：' + name);
    renderStudentList();
  });

  $('#new-student-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#btn-save-student').click();
  });

  // Sync: save token
  $('#btn-sync-save').addEventListener('click', function () {
    var token = $('#sync-token').value.trim();
    if (!token) { alert('请粘贴 GitHub Token'); return; }
    localStorage.setItem('gh_sync_token', token);
    $('#sync-token').value = '';
    $('#sync-status').textContent = '已配置，自动同步中...';
    testSync(token);
  });

  // Sync: push
  $('#btn-sync-push').addEventListener('click', function () {
    var token = localStorage.getItem('gh_sync_token');
    if (!token) { alert('请先配置 GitHub Token'); return; }
    $('#sync-status').textContent = '正在上传...';
    pushToGitHub(token, function (ok) {
      $('#sync-status').textContent = ok ? '已上传到云端' : '上传失败，请检查网络';
    });
  });

  // Sync: pull
  $('#btn-sync-pull').addEventListener('click', function () {
    var token = localStorage.getItem('gh_sync_token');
    if (!token) { alert('请先配置 GitHub Token'); return; }
    $('#sync-status').textContent = '正在下载...';
    pullFromGitHub(token, function (ok) {
      if (ok) {
        $('#sync-status').textContent = '已从云端同步';
        renderAll();
      } else {
        $('#sync-status').textContent = '下载失败或云端无数据';
      }
    });
  });

  // Restore saved token indicator
  var savedToken = localStorage.getItem('gh_sync_token');
  if (savedToken) {
    $('#sync-status').textContent = '已配置自动同步';
  }
}

// ==================== GITHUB SYNC ====================

function pushToGitHub(token, cb) {
  var json = JSON.stringify(appData, null, 2);
  var content = btoa(unescape(encodeURIComponent(json)));
  var api = 'https://api.github.com/repos/linkemeisu/tennis-coach/contents/data.json';

  // Get current SHA
  fetch(api, { headers: { Authorization: 'token ' + token } }).then(function (r) {
    return r.json();
  }).then(function (info) {
    var body = { message: 'sync data', content: content, branch: 'main' };
    if (info.sha) body.sha = info.sha;
    return fetch(api, {
      method: 'PUT',
      headers: { Authorization: 'token ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }).then(function (r) {
    cb(r.ok);
  }).catch(function () { cb(false); });
}

function pullFromGitHub(token, cb) {
  fetch('https://api.github.com/repos/linkemeisu/tennis-coach/contents/data.json', {
    headers: { Authorization: 'token ' + token, 'Cache-Control': 'no-cache' }
  }).then(function (r) {
    if (!r.ok) { cb(false); return; }
    return r.json();
  }).then(function (info) {
    if (!info || !info.content) { cb(false); return; }
    var json = decodeURIComponent(escape(atob(info.content)));
    var data = JSON.parse(json);
    if (data.students && data.lessons) {
      appData = data;
      saveData();
      cb(true);
    } else {
      cb(false);
    }
  }).catch(function () { cb(false); });
}

function testSync(token) {
  pushToGitHub(token, function (ok) {
    if (ok) {
      $('#sync-status').textContent = '云端同步已就绪';
    } else {
      $('#sync-status').textContent = '连接失败，请检查 Token 和网络';
    }
  });
}

function autoPullOnStart() {
  var token = localStorage.getItem('gh_sync_token');
  if (!token) return;
  pullFromGitHub(token, function (ok) {
    if (ok) {
      renderAll();
      console.log('Auto-synced from cloud');
    }
  });
}

function autoPushOnChange() {
  var token = localStorage.getItem('gh_sync_token');
  if (!token) return;
  pushToGitHub(token, function () {});
}

// ---- LESSON ITEM HTML (minimal) ----

function lessonItemHTML(l) {
  var dur = calcDuration(l.startTime, l.endTime);

  var html = '<div class="lesson-row" data-lid="' + l.id + '">';

  // Time column
  html += '<div class="time-col">';
  html += '<div class="start">' + l.startTime + '</div>';
  html += '<div class="end">' + l.endTime + '</div>';
  html += '</div>';

  // Info column
  html += '<div class="info-col">';
  html += '<div class="name">' + l.studentName + '</div>';
  html += '<div class="meta">' + dur + '小时</div>';
  html += '</div>';

  // Actions
  html += '<div class="act-col">';
  if (l.status === 'upcoming') {
    if (!l.calendarAdded) {
      html += '<button class="btn-cal" data-lid="' + l.id + '">添加到日历</button>';
    } else {
      html += '<span class="cal-ok">已提醒</span>';
    }
  }
  html += '<button class="btn-del" data-lid="' + l.id + '" data-del="1" aria-label="删除">&times;</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

function bindLessonActions() {
  // Calendar button
  $$('.btn-cal').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var lid = btn.dataset.lid;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (lesson) {
        addToCalendar(lesson, function () {
          showToast('已添加到日历');
          renderAll();
        });
      }
    });
  });

  // Delete button
  $$('.btn-del').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var lid = btn.dataset.lid;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (!lesson) return;
      var msg = '删除 ' + lesson.studentName + ' ' + lesson.date + ' ' + lesson.startTime + ' 的课程？';
      if (lesson.calendarAdded && lesson.status === 'upcoming') {
        msg += '\n\n已在日历中，请手动从日历删除此事件。';
      }
      if (confirm(msg)) {
        deleteLesson(lid);
        showToast('已删除');
        renderAll();
      }
    });
  });

  // Row click — open edit modal (Apple-style: tap to edit)
  $$('.lesson-row').forEach(function (el) {
    el.addEventListener('click', function () {
      var lid = el.dataset.lid;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (!lesson) return;
      showEditLessonModal(lesson, function () { renderAll(); });
    });
  });

  // Batch calendar button
  var batchBtn = $('#btn-batch-calendar');
  if (batchBtn) {
    batchBtn.addEventListener('click', function () {
      var unsynced = appData.lessons.filter(function (l) {
        return l.status === 'upcoming' && !l.calendarAdded;
      });
      if (unsynced.length === 0) {
        alert('所有未上课程已同步到日历');
        return;
      }
      if (confirm('将 ' + unsynced.length + ' 节未同步课程全部添加到日历？')) {
        addAllToCalendar(unsynced);
      }
    });
  }
}

// ---- BATCH CALENDAR ----

function addAllToCalendar(lessons) {
  if (lessons.length === 0) return;
  var all = lessons.map(function (l) { return generateICS(l); }).join('');
  var blob = new Blob([all], { type: 'text/calendar;charset=utf-8' });
  var url = URL.createObjectURL(blob);

  var a = document.createElement('a');
  a.href = url;
  a.download = 'tennis_batch.ics';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);

  lessons.forEach(function (l) {
    updateLesson(l.id, { calendarAdded: true });
  });
  showToast('已批量添加 ' + lessons.length + ' 节到日历');
  renderAll();
}

// ---- QUICK COMPLETED LESSON HELPERS ----

function quickAddCompleted(studentId, studentName, date) {
  var d = date || todayStr();
  var lesson = {
    studentId: studentId,
    studentName: studentName,
    date: d,
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    status: 'completed',
    calendarAdded: false,
  };
  return addLesson(lesson);
}

// ---- STUDENT DETAIL (Apple Notes checklist style) ----

function showStudentDetail(sid) {
  var s = appData.students.find(function (st) { return st.id === sid; });
  if (!s) return;
  var total = getStudentLessonCount(s.id);
  var month = getStudentMonthCount(s.id);
  var lessons = appData.lessons
    .filter(function (l) { return l.studentId === sid; })
    .sort(function (a, b) { return (b.date + b.startTime).localeCompare(a.date + a.startTime); });

  var upcomingLessons = lessons.filter(function (l) { return l.status === 'upcoming'; });
  var completedLessons = lessons.filter(function (l) { return l.status === 'completed'; });

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'detail-modal';

  // Track lessons added during this session (for undo)
  var sessionIds = [];

  var html = '<div class="modal-sheet" style="padding-bottom:20px">';

  // Header
  html += '<div class="detail-header">';
  html += '<div class="avatar-lg">' + s.name.charAt(0) + '</div>';
  html += '<div class="name-lg">' + s.name + '</div>';
  html += '<div class="stats-sm">共 ' + total + ' 节课 · 本月 ' + month + ' 节</div>';
  html += '</div>';

  // Quick counter for completed lessons
  html += '<div class="quick-counter card" style="margin-bottom:12px;text-align:center;padding:12px 16px">';
  html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">快速补录已上课时（不计日期，只加次数）</div>';
  html += '<div style="display:flex;align-items:center;justify-content:center;gap:10px">';
  html += '<button class="counter-btn minus" id="btn-qminus">−1</button>';
  html += '<span id="quick-count" style="font-size:26px;font-weight:700;min-width:36px;text-align:center;color:var(--green)">0</span>';
  html += '<button class="counter-btn plus" id="btn-qplus1">+1</button>';
  html += '<button class="counter-btn plus" id="btn-qplus5">+5</button>';
  html += '</div>';
  html += '</div>';

  // Quick actions
  html += '<div style="display:flex;gap:8px;margin-bottom:16px">';
  html += '<button class="btn btn-primary" style="flex:1;font-size:14px;padding:10px" id="btn-detail-add">+ 添加课时（含日期）</button>';
  html += '<button class="btn btn-secondary" style="flex:1;font-size:14px;padding:10px" id="btn-close-detail">关闭</button>';
  html += '</div>';

  // Lesson list
  html += '<div id="detail-lesson-list">';
  html += renderDetailLessonList(upcomingLessons, completedLessons);
  html += '</div>';

  // Delete student
  html += '<button class="btn btn-danger" id="btn-delete-student" data-sid="' + s.id + '" style="margin-top:16px">删除学生及所有记录</button>';
  html += '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeDetail();
  });

  $('#btn-close-detail').addEventListener('click', closeDetail);

  $('#btn-detail-add').addEventListener('click', function () {
    closeDetail();
    showAddModalForStudent(s);
  });

  // Quick counter handlers
  var countEl = $('#quick-count');

  function updateCount() {
    countEl.textContent = sessionIds.length;
    // Update header stats
    var total = getStudentLessonCount(s.id);
    var month = getStudentMonthCount(s.id);
    var statsEl = $('#detail-modal .stats-sm');
    if (statsEl) statsEl.textContent = '共 ' + total + ' 节课 · 本月 ' + month + ' 节';
    // Refresh lesson list
    refreshDetailList(s);
  }

  var yesterday = offsetDate(-1);

  $('#btn-qplus1').addEventListener('click', function () {
    var lesson = quickAddCompleted(s.id, s.name, yesterday);
    sessionIds.push(lesson.id);
    updateCount();
  });

  $('#btn-qplus5').addEventListener('click', function () {
    for (var i = 0; i < 5; i++) {
      var lesson = quickAddCompleted(s.id, s.name, yesterday);
      sessionIds.push(lesson.id);
    }
    updateCount();
  });

  $('#btn-qminus').addEventListener('click', function () {
    if (sessionIds.length === 0) return;
    var lastId = sessionIds.pop();
    deleteLesson(lastId);
    updateCount();
  });

  $('#btn-delete-student').addEventListener('click', function () {
    if (confirm('确定删除「' + s.name + '」及其所有课程记录吗？此操作不可恢复。')) {
      deleteStudent(s.id);
      closeDetail();
      renderAll();
      showToast('已删除学生：' + s.name);
    }
  });

  // Bind checklist item events
  bindDetailLessonEvents(s);

  function closeDetail() {
    var m = $('#detail-modal');
    if (m) document.body.removeChild(m);
    renderAll();
  }
}

function renderDetailLessonList(upcoming, completed) {
  var html = '';

  if (upcoming.length > 0) {
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;margin-top:4px">未上课</div>';
    upcoming.forEach(function (l) {
      html += detailLessonItemHTML(l);
    });
  }

  if (completed.length > 0) {
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;margin-top:12px">已上课</div>';
    completed.forEach(function (l) {
      html += detailLessonItemHTML(l);
    });
  }

  if (upcoming.length === 0 && completed.length === 0) {
    html += '<div class="empty" style="padding:20px"><p>还没有课时记录</p></div>';
  }

  return html;
}

function detailLessonItemHTML(l) {
  var d = new Date(l.date + 'T00:00:00');
  var mon = (d.getMonth() + 1);
  var day = d.getDate();
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  var wd = '周' + weekdays[d.getDay()];
  var dur = calcDuration(l.startTime, l.endTime);

  var isCompleted = l.status === 'completed';
  var circleClass = isCompleted ? 'check-circle checked' : 'check-circle';
  var circleInner = isCompleted ? '●' : '○';

  var html = '<div class="checklist-item" data-lid="' + l.id + '">';
  html += '<span class="' + circleClass + '" data-toggle="' + l.id + '">' + circleInner + '</span>';
  html += '<div class="checklist-info" data-edit="' + l.id + '">';
  html += '<span class="checklist-title">' + l.date + ' · ' + l.startTime + '-' + l.endTime + '</span>';
  html += '<span class="checklist-meta">' + wd + ' · ' + dur + '小时' + '</span>';
  html += '</div>';
  html += '<span class="checklist-delete" data-delete="' + l.id + '" style="cursor:pointer;padding:4px 8px;color:var(--red);font-size:13px">删除</span>';
  html += '</div>';

  return html;
}

function calcDuration(start, end) {
  var sh = parseInt(start.split(':')[0]), sm = parseInt(start.split(':')[1]);
  var eh = parseInt(end.split(':')[0]), em = parseInt(end.split(':')[1]);
  var mins = (eh * 60 + em) - (sh * 60 + sm);
  var hrs = Math.round(mins / 60 * 10) / 10;
  return hrs;
}

function bindDetailLessonEvents(s) {
  // Toggle completed/upcoming
  $$('#detail-modal .check-circle[data-toggle]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var lid = el.dataset.toggle;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (!lesson) return;
      var newStatus = lesson.status === 'completed' ? 'upcoming' : 'completed';
      updateLesson(lid, { status: newStatus });
      showToast(newStatus === 'completed' ? '已标记为已上 ✓' : '已标记为未上');
      refreshDetailList(s);
    });
  });

  // Edit lesson
  $$('#detail-modal .checklist-info[data-edit]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var lid = el.dataset.edit;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (!lesson) return;
      showEditLessonModal(lesson, function () {
        refreshDetailList(s);
        renderAll();
      });
    });
  });

  // Delete lesson
  $$('#detail-modal .checklist-delete[data-delete]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var lid = el.dataset.delete;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (!lesson) return;
      if (confirm('删除「' + lesson.studentName + '」' + lesson.date + ' ' + lesson.startTime + ' 的课时？')) {
        deleteLesson(lid);
        showToast('已删除课时');
        refreshDetailList(s);
        renderAll();
      }
    });
  });
}

function refreshDetailList(s) {
  var container = $('#detail-lesson-list');
  if (!container) return;
  var lessons = appData.lessons
    .filter(function (l) { return l.studentId === s.id; })
    .sort(function (a, b) { return (b.date + b.startTime).localeCompare(a.date + a.startTime); });
  var upcoming = lessons.filter(function (l) { return l.status === 'upcoming'; });
  var completed = lessons.filter(function (l) { return l.status === 'completed'; });
  container.innerHTML = renderDetailLessonList(upcoming, completed);

  // Update header stats
  var total = getStudentLessonCount(s.id);
  var month = getStudentMonthCount(s.id);
  var statsEl = $('#detail-modal .stats-sm');
  if (statsEl) statsEl.textContent = '共 ' + total + ' 节课 · 本月 ' + month + ' 节';

  bindDetailLessonEvents(s);
}

// ---- ADD LESSON FOR SPECIFIC STUDENT ----

function showAddModalForStudent(s) {
  showAddModal();
  setTimeout(function () {
    var sel = $('#add-student');
    if (sel && sel.tagName === 'SELECT') {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === s.name) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change'));
          break;
        }
      }
    }
  }, 100);
}

function showAddModalNewStudent() {
  showAddModal();
  setTimeout(function () {
    var sel = $('#add-student');
    if (sel && sel.tagName === 'SELECT') {
      sel.value = '__new__';
      sel.dispatchEvent(new Event('change'));
      // Turn on "已上完" toggle, show quick counter, set date to yesterday
      var cb = $('#add-completed');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
      setTimeout(function () { $('#add-student-new').focus(); }, 150);
    } else if (sel) {
      sel.focus();
    }
  }, 100);
}

// ---- EDIT LESSON MODAL ----

function showEditLessonModal(lesson, onSaved) {
  if ($('#edit-lesson-modal')) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'edit-lesson-modal';

  var durMins = calcDuration(lesson.startTime, lesson.endTime) * 60;

  var html = '<div class="modal-sheet">';
  html += '<h2>编辑课时</h2>';

  html += '<div class="form-group">';
  html += '<label>学生</label>';
  html += '<input type="text" value="' + lesson.studentName + '" disabled style="opacity:0.7">';
  html += '</div>';

  html += '<div class="form-group">';
  html += '<label>日期</label>';
  html += '<input type="date" id="edit-date" value="' + lesson.date + '">';
  html += '</div>';

  html += '<div class="form-group">';
  html += '<label>开始时间</label>';
  html += '<input type="time" id="edit-start" value="' + lesson.startTime + '">';
  html += '</div>';

  html += '<div class="form-group">';
  html += '<label>时长（小时）</label>';
  html += '<select id="edit-duration">';
  [0.5, 1, 1.5, 2, 2.5, 3].forEach(function (h) {
    var sel = Math.abs(h * 60 - durMins) < 10 ? ' selected' : '';
    html += '<option value="' + (h * 60) + '"' + sel + '>' + h + ' 小时</option>';
  });
  html += '</select>';
  html += '</div>';

  // Status toggle
  html += '<div class="form-group" style="display:flex;align-items:center;justify-content:space-between">';
  html += '<label style="margin-bottom:0">已上完</label>';
  html += '<label class="toggle-switch"><input type="checkbox" id="edit-completed"' + (lesson.status === 'completed' ? ' checked' : '') + '><span class="toggle-track"></span></label>';
  html += '</div>';

  html += '<button class="btn btn-primary" id="btn-edit-save">保存修改</button>';
  html += '<button class="btn btn-secondary" id="btn-edit-cancel">取消</button>';
  html += '<button class="btn btn-danger" id="btn-edit-delete">删除此课时</button>';
  html += '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeEditModal();
  });

  $('#btn-edit-cancel').addEventListener('click', closeEditModal);

  $('#btn-edit-save').addEventListener('click', function () {
    var date = $('#edit-date').value;
    var startTime = $('#edit-start').value;
    var durationMins = parseInt($('#edit-duration').value);
    var isCompleted = $('#edit-completed').checked;

    if (!date || !startTime) { alert('请填写日期和时间'); return; }

    var endTime = addMinutes(startTime, durationMins);
    var changed = (date !== lesson.date || startTime !== lesson.startTime || durationMins !== (calcDuration(lesson.startTime, lesson.endTime) * 60));
    updateLesson(lesson.id, {
      date: date,
      startTime: startTime,
      endTime: endTime,
      duration: durationMins,
      status: isCompleted ? 'completed' : 'upcoming',
      calendarAdded: (isCompleted || !changed) ? lesson.calendarAdded : false,
    });

    closeEditModal();
    showToast('课时已更新 ✓');
    if (onSaved) onSaved();
  });

  $('#btn-edit-delete').addEventListener('click', function () {
    if (confirm('确定删除这个课时记录吗？')) {
      deleteLesson(lesson.id);
      closeEditModal();
      showToast('已删除课时');
      if (onSaved) onSaved();
    }
  });

  function closeEditModal() {
    var m = $('#edit-lesson-modal');
    if (m) document.body.removeChild(m);
  }
}

// ==================== ADD LESSON MODAL ====================

function showAddModal() {
  // Prevent duplicate modals
  if ($('#add-modal')) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'add-modal';

  var students = getStudents();
  var today = todayStr();
  var defaultTime = (function () {
    var h = new Date().getHours() + 1;
    if (h > 21) h = 9;
    return h.toString().padStart(2, '0') + ':00';
  })();

  var html = '<div class="modal-sheet">';
  html += '<h2>添加课程</h2>';

  // Voice button
  html += '<button class="voice-btn" id="btn-voice">';
  html += '语音输入排课</button>';

  html += '<div class="divider-text">或手动填写</div>';

  // Student
  html += '<div class="form-group">';
  html += '<label>学生</label>';
  if (students.length > 0) {
    html += '<select id="add-student">';
    html += '<option value="" selected>选择学生</option>';
    students.forEach(function (s) {
      html += '<option value="' + s.name + '">' + s.name + '</option>';
    });
    html += '<option value="__new__">+ 新学生</option>';
    html += '</select>';
  } else {
    html += '<input type="text" id="add-student" placeholder="学生姓名">';
  }
  html += '<div id="new-student-wrap" style="display:none;margin-top:8px">';
  html += '<div style="display:flex;gap:8px">';
  html += '<input type="text" id="add-student-new" placeholder="输入新学生姓名" style="flex:1;padding:12px;border:1px solid #E0E0E0;border-radius:10px;font-size:16px;background:#F9F9F9">';
  html += '<button id="btn-confirm-student" style="width:44px;border:1px solid var(--green);border-radius:10px;background:var(--green);color:#fff;font-size:20px;cursor:pointer;flex-shrink:0">&#10003;</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // Date
  html += '<div class="form-group">';
  html += '<label>日期</label>';
  html += '<input type="date" id="add-date" value="' + today + '">';
  html += '</div>';

  // Start time
  html += '<div class="form-group">';
  html += '<label>开始时间</label>';
  html += '<input type="time" id="add-start" value="' + defaultTime + '">';
  html += '</div>';

  // Duration
  html += '<div class="form-group">';
  html += '<label>时长（小时）</label>';
  html += '<select id="add-duration">';
  [0.5, 1, 1.5, 2, 2.5, 3].forEach(function (h) {
    html += '<option value="' + (h * 60) + '"' + (h === 1 ? ' selected' : '') + '>' + h + ' 小时</option>';
  });
  html += '</select>';
  html += '</div>';

  // Already completed toggle
  html += '<div class="form-group" style="display:flex;align-items:center;justify-content:space-between">';
  html += '<label style="margin-bottom:0">这节课已经上完了</label>';
  html += '<label class="toggle-switch"><input type="checkbox" id="add-completed"><span class="toggle-track"></span></label>';
  html += '</div>';

  // Quick counter (hidden until "已上完" is toggled)
  html += '<div id="add-quick-counter" class="quick-counter card" style="display:none;margin-bottom:12px;text-align:center;padding:12px 16px">';
  html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">批量添加已上课时（只加次数，不计日期）</div>';
  html += '<div style="display:flex;align-items:center;justify-content:center;gap:10px">';
  html += '<button class="counter-btn minus" id="add-qminus">−1</button>';
  html += '<span id="add-quick-count" style="font-size:26px;font-weight:700;min-width:36px;text-align:center;color:var(--green)">0</span>';
  html += '<button class="counter-btn plus" id="add-qplus1">+1</button>';
  html += '<button class="counter-btn plus" id="add-qplus5">+5</button>';
  html += '</div>';
  html += '</div>';

  // Buttons
  html += '<button class="btn btn-primary" id="btn-save-lesson">保存课程</button>';
  html += '<button class="btn btn-secondary" id="btn-close-modal">取消</button>';
  html += '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeAddModal();
  });

  $('#btn-close-modal').addEventListener('click', closeAddModal);

  // Confirm student name only (without adding lesson)
  $('#btn-confirm-student').addEventListener('click', function () {
    var name = getAddStudentName();
    if (!name) { alert('请输入学生姓名'); return; }
    findOrCreateStudent(name);
    showToast('已添加学生：' + name);
    closeAddModal();
    renderAll();
  });

  // Voice input
  $('#btn-voice').addEventListener('click', function () {
    var btn = $('#btn-voice');
    btn.classList.add('listening');
    btn.innerHTML = '正在聆听...';

    var recognition = startVoiceInput(function (text) {
      btn.classList.remove('listening');
      btn.innerHTML = '语音输入排课';

      if (!text) {
        alert('没有识别到语音，请重试。');
        return;
      }

      var parsed = parseVoiceInput(text);
      var preSelected = getAddStudentName();
      // If a student is already selected, don't guess name from voice
      if (preSelected && preSelected !== '__new__') {
        parsed.studentName = preSelected;
      }
      showConfirmModal(parsed, function () { closeAddModal(); });
    });

    // Timeout after 10 seconds
    setTimeout(function () {
      if (btn.classList.contains('listening')) {
        recognition.stop();
        btn.classList.remove('listening');
        btn.innerHTML = '语音输入排课';
      }
    }, 10000);
  });

  // Track quick-counter additions in this session
  var sessionIds = [];

  // Student select toggle
  var studentSelect = $('#add-student');
  if (studentSelect.tagName === 'SELECT') {
    studentSelect.addEventListener('change', function () {
      var wrap = $('#new-student-wrap');
      if (studentSelect.value === '__new__') {
        wrap.style.display = 'block';
        setTimeout(function () { $('#add-student-new').focus(); }, 50);
      } else {
        wrap.style.display = 'none';
      }
    });
  }

  // Toggle quick counter visibility when "已上完" is checked
  var completedCheckbox = $('#add-completed');
  completedCheckbox.addEventListener('change', function () {
    var counter = $('#add-quick-counter');
    counter.style.display = completedCheckbox.checked ? 'block' : 'none';
    // Auto-set date to yesterday for completed lessons
    if (completedCheckbox.checked) {
      $('#add-date').value = offsetDate(-1);
    } else {
      $('#add-date').value = today;
    }
  });

  // Quick counter handlers (in add modal)
  var qCountEl = $('#add-quick-count');
  function updateQCount() { qCountEl.textContent = sessionIds.length; }
  function getAddStudentName() {
    if (studentSelect.tagName === 'SELECT') {
      if (studentSelect.value === '__new__') return $('#add-student-new').value.trim();
      return studentSelect.value;
    }
    return studentSelect.value.trim();
  }

  $('#add-qplus1').addEventListener('click', function () {
    var name = getAddStudentName();
    if (!name) { alert('请先选择学生'); return; }
    var s = findOrCreateStudent(name);
    var lesson = quickAddCompleted(s.id, s.name, $('#add-date').value);
    sessionIds.push(lesson.id);
    updateQCount();
  });

  $('#add-qplus5').addEventListener('click', function () {
    var name = getAddStudentName();
    if (!name) { alert('请先选择学生'); return; }
    var s = findOrCreateStudent(name);
    for (var i = 0; i < 5; i++) {
      var lesson = quickAddCompleted(s.id, s.name, $('#add-date').value);
      sessionIds.push(lesson.id);
    }
    updateQCount();
  });

  $('#add-qminus').addEventListener('click', function () {
    if (sessionIds.length === 0) return;
    var lastId = sessionIds.pop();
    deleteLesson(lastId);
    updateQCount();
  });

  // Save lesson
  $('#btn-save-lesson').addEventListener('click', function () {
    var studentName = getAddStudentName();
    if (!studentName) { alert('请选择或输入学生姓名'); return; }

    var isCompleted = completedCheckbox.checked;

    // If quick counter was used, just close (lessons already saved)
    if (isCompleted && sessionIds.length > 0) {
      closeAddModal();
      showToast('已添加 ' + sessionIds.length + ' 节已上课时 ✓');
      renderAll();
      return;
    }

    var date = $('#add-date').value;
    var startTime = $('#add-start').value;
    var durationMins = parseInt($('#add-duration').value);

    if (!date) { alert('请选择日期'); return; }
    if (!startTime) { alert('请选择时间'); return; }

    var endTime = addMinutes(startTime, durationMins);
    var student = findOrCreateStudent(studentName);

    var lesson = {
      studentId: student.id,
      studentName: student.name,
      date: date,
      startTime: startTime,
      endTime: endTime,
      duration: durationMins,
      status: isCompleted ? 'completed' : 'upcoming',
    };

    addLesson(lesson);
    closeAddModal();
    if (isCompleted) {
      showToast('已添加历史课时 ✓');
    } else {
      showToast('课程已保存，点击添加到日历即可设置提醒');
    }
    renderAll();
  });

  function closeAddModal() {
    // If a new student name was typed but no lesson saved, still create the student
    var newInput = $('#add-student-new');
    if (newInput && newInput.value.trim()) {
      findOrCreateStudent(newInput.value.trim());
    }
    var m = $('#add-modal');
    if (m) document.body.removeChild(m);
    renderAll();
  }
}

// ---- CONFIRM MODAL (after voice parsing) ----

function showConfirmModal(parsed, onSuccess) {
  // Prevent duplicate modals
  if ($('#confirm-modal')) return;

  // Save pending new student name, then close add modal
  var newInput = $('#add-student-new');
  if (newInput && newInput.value.trim()) {
    findOrCreateStudent(newInput.value.trim());
  }
  var addModal = $('#add-modal');
  if (addModal) document.body.removeChild(addModal);

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'confirm-modal';

  var html = '<div class="modal-sheet">';
  html += '<h2>确认课程信息</h2>';

  html += '<div class="parsed-result">';
  html += '<div class="field"><span class="key">学生</span><span class="val">' + (effectiveName || parsed.studentName || '（未识别）') + '</span></div>';
  html += '<div class="field"><span class="key">日期</span><span class="val">' + parsed.date + '</span></div>';
  html += '<div class="field"><span class="key">时间</span><span class="val">' + (parsed.startTime || '（未识别）') + '</span></div>';
  html += '<div class="field"><span class="key">时长</span><span class="val">' + (parsed.durationMins / 60) + ' 小时</span></div>';
  html += '</div>';

  html += '<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin-bottom:12px">如果有误，请点下方修改后保存</p>';

  // Editable fields
  var students = getStudents();
  // If voice didn't match a known student, use the pre-selected student from add modal
  var effectiveName = parsed.studentName;
  var studentExists = students.some(function (s) { return s.name === effectiveName; });
  if (!studentExists && parsed._preSelected) {
    effectiveName = parsed._preSelected;
    studentExists = students.some(function (s) { return s.name === effectiveName; });
  }
  html += '<div class="form-group"><label>学生</label>';
  if (students.length > 0) {
    html += '<select id="cfm-student">';
    students.forEach(function (s) {
      var sel = s.name === effectiveName ? ' selected' : '';
      html += '<option value="' + s.name + '"' + sel + '>' + s.name + '</option>';
    });
    var newSel = (!studentExists && effectiveName) ? ' selected' : '';
    html += '<option value="__new__"' + newSel + '>+ 新学生</option>';
    html += '</select>';
    var wrapStyle = (!studentExists && effectiveName) ? 'display:block' : 'display:none';
    var newVal = (!studentExists && effectiveName) ? effectiveName : '';
    html += '<div id="cfm-new-student-wrap" style="' + wrapStyle + ';margin-top:8px">';
    html += '<input type="text" id="cfm-student-new" placeholder="输入新学生姓名" value="' + newVal + '" style="width:100%;padding:12px;border:1px solid #E0E0E0;border-radius:10px;font-size:16px;background:#F9F9F9">';
    html += '</div>';
  } else {
    html += '<input type="text" id="cfm-student" value="' + effectiveName + '">';
  }
  html += '</div>';

  html += '<div class="form-group"><label>日期</label><input type="date" id="cfm-date" value="' + parsed.date + '"></div>';
  html += '<div class="form-group"><label>开始时间</label><input type="time" id="cfm-start" value="' + parsed.startTime + '"></div>';
  html += '<div class="form-group"><label>时长（小时）</label><select id="cfm-duration">';
  [0.5, 1, 1.5, 2, 2.5, 3].forEach(function (h) {
    var sel = (h * 60) === parsed.durationMins ? ' selected' : '';
    html += '<option value="' + (h * 60) + '"' + sel + '>' + h + ' 小时</option>';
  });
  html += '</select></div>';

  // Completed toggle
  html += '<div class="form-group" style="display:flex;align-items:center;justify-content:space-between">';
  html += '<label style="margin-bottom:0">这节课已经上完了</label>';
  html += '<label class="toggle-switch"><input type="checkbox" id="cfm-completed"><span class="toggle-track"></span></label>';
  html += '</div>';

  html += '<button class="btn btn-primary" id="btn-cfm-save">确认保存</button>';
  html += '<button class="btn btn-secondary" id="btn-cfm-cancel">取消</button>';
  html += '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
      renderAll();
    }
  });

  $('#btn-cfm-cancel').addEventListener('click', function () {
    document.body.removeChild(overlay);
    renderAll();
  });

  // Student select for confirm modal
  var cfmSelect = $('#cfm-student');
  if (cfmSelect && cfmSelect.tagName === 'SELECT') {
    cfmSelect.addEventListener('change', function () {
      var wrap = $('#cfm-new-student-wrap');
      if (cfmSelect.value === '__new__') {
        wrap.style.display = 'block';
        setTimeout(function () { $('#cfm-student-new').focus(); }, 50);
      } else {
        wrap.style.display = 'none';
      }
    });
  }

  $('#btn-cfm-save').addEventListener('click', function () {
    var studentName;
    if (cfmSelect && cfmSelect.tagName === 'SELECT') {
      if (cfmSelect.value === '__new__') {
        studentName = $('#cfm-student-new').value.trim();
      } else {
        studentName = cfmSelect.value;
      }
    } else {
      studentName = $('#cfm-student').value.trim();
    }

    if (!studentName) { alert('请选择或输入学生姓名'); return; }

    var date = $('#cfm-date').value;
    var startTime = $('#cfm-start').value;
    var durationMins = parseInt($('#cfm-duration').value);

    if (!date || !startTime) { alert('请填写日期和时间'); return; }

    var endTime = addMinutes(startTime, durationMins);
    var student = findOrCreateStudent(studentName);
    var isCompleted = $('#cfm-completed').checked;

    var lesson = {
      studentId: student.id,
      studentName: student.name,
      date: date,
      startTime: startTime,
      endTime: endTime,
      duration: durationMins,
      status: isCompleted ? 'completed' : 'upcoming',
    };

    addLesson(lesson);
    document.body.removeChild(overlay);
    if (isCompleted) {
      showToast('已添加历史课时 ✓');
    } else {
      showToast('课程已保存，点击添加到日历即可设置提醒');
    }
    renderAll();

    if (onSuccess) onSuccess();
  });
}

// ==================== TAB SWITCHING ====================

function switchTab(tab) {
  currentTab = tab;
  $$('nav.tab-bar button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderAll();
}

// ==================== INIT ====================

function init() {
  loadData();
  archiveCompletedLessons();
  // Auto-pull from cloud if sync is set up
  autoPullOnStart();

  // Bind tab buttons
  $$('nav.tab-bar button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.dataset.tab);
    });
  });

  // Bind FAB
  $('#fab').addEventListener('click', function () {
    showAddModal();
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
