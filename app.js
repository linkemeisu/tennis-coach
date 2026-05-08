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
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
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

  // Today's lessons
  html += '<div class="section-title">📅 今日课程</div>';
  if (todayLessons.length === 0) {
    html += '<div class="card"><div class="empty" style="padding:20px"><p>今天没有课程</p></div></div>';
  } else {
    html += '<div class="card">';
    todayLessons.forEach(function (l) {
      html += lessonItemHTML(l);
    });
    html += '</div>';
  }

  // Upcoming (next few)
  const nextUpcoming = upcoming.filter(function (l) { return l.date > today; }).slice(0, 5);
  if (nextUpcoming.length > 0) {
    html += '<div class="section-title">⏰ 即将到来</div>';
    html += '<div class="card">';
    nextUpcoming.forEach(function (l) {
      html += lessonItemHTML(l);
    });
    html += '</div>';
  }

  main.innerHTML = html;
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

  if (lessons.length === 0) {
    html += '<div class="empty"><div class="icon">📋</div><p>' +
      (currentLessonFilter === 'upcoming' ? '暂无未上课程' : '暂无已完成课程') +
      '</p></div>';
  } else {
    html += '<div class="card">';
    lessons.forEach(function (l) {
      html += lessonItemHTML(l);
    });
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

  let html = '<div class="section-title">👥 学生列表</div>';

  if (students.length === 0) {
    html += '<div class="empty"><div class="icon">👤</div><p>还没有学生<br>添加课程时会自动创建学生档案</p></div>';
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
  html += '<div id="inline-add-student" class="card" style="display:none;margin-top:10px">';
  html += '<div class="inline-form">';
  html += '<input type="text" id="new-student-name" placeholder="输入学生姓名">';
  html += '<button id="btn-save-student">添加</button>';
  html += '</div>';
  html += '</div>';

  main.innerHTML = html;

  // Bind student clicks
  $$('.student-item').forEach(function (el) {
    el.addEventListener('click', function () {
      showStudentDetail(el.dataset.sid);
    });
  });

  // Bind add student
  $('#btn-add-student').addEventListener('click', function () {
    var inline = $('#inline-add-student');
    inline.style.display = inline.style.display === 'none' ? 'block' : 'none';
    if (inline.style.display === 'block') {
      setTimeout(function () { $('#new-student-name').focus(); }, 100);
    }
  });

  $('#btn-save-student').addEventListener('click', function () {
    var input = $('#new-student-name');
    var name = input.value.trim();
    if (!name) { alert('请输入学生姓名'); return; }
    addStudent(name);
    showToast('已添加学生：' + name);
    renderStudentList();
  });

  $('#new-student-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#btn-save-student').click();
  });
}

// ---- LESSON ITEM HTML ----

function lessonItemHTML(l) {
  const d = new Date(l.date + 'T00:00:00');
  const mon = (d.getMonth() + 1) + '月';
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const wd = '周' + weekdays[d.getDay()];
  const timeRange = l.startTime + ' - ' + l.endTime;
  const dur = Math.round((function () {
    const [sh, sm] = l.startTime.split(':').map(Number);
    const [eh, em] = l.endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }()) / 60 * 10) / 10;
  const durText = dur + '小时';

  var html = '<div class="lesson-item" data-lid="' + l.id + '">';
  html += '<div class="date-badge"><span class="day">' + day + '</span><span class="mon">' + mon + '</span></div>';
  html += '<div class="info">';
  html += '<div class="name">' + l.studentName + '</div>';
  html += '<div class="time">' + timeRange + '（' + durText + '）</div>';
  html += '<div class="detail">' + wd + ' · ' + l.date + '</div>';
  html += '</div>';

  if (l.status === 'upcoming') {
    html += '<div class="actions">';
    if (!l.calendarAdded) {
      html += '<button class="btn-calendar" data-lid="' + l.id + '">📅 加到日历</button>';
    } else {
      html += '<span style="font-size:12px;color:var(--green)">✓ 已添加提醒</span>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function bindLessonActions() {
  $$('.btn-calendar').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var lid = btn.dataset.lid;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (lesson) {
        addToCalendar(lesson, function () {
          showToast('已添加到日历 ✓');
          renderAll();
        });
      }
    });
  });

  // Swipe-to-delete (simple long press)
  $$('.lesson-item').forEach(function (el) {
    el.addEventListener('click', function () {
      var lid = el.dataset.lid;
      var lesson = appData.lessons.find(function (l) { return l.id === lid; });
      if (!lesson) return;
      var action = confirm(
        lesson.studentName + ' ' + lesson.date + ' ' + lesson.startTime + '\n\n' +
        (lesson.status === 'upcoming' ? '标记为已完成？\n(点"取消"则为删除)' : '删除这条记录？')
      );
      if (action) {
        if (lesson.status === 'upcoming') {
          updateLesson(lid, { status: 'completed' });
          showToast('已标记为完成 ✓');
        }
      } else {
        if (confirm('确定要删除这条课程记录吗？')) {
          deleteLesson(lid);
          showToast('已删除');
        }
      }
      renderAll();
    });
  });
}

// ---- STUDENT DETAIL ----

function showStudentDetail(sid) {
  var s = appData.students.find(function (st) { return st.id === sid; });
  if (!s) return;
  var total = getStudentLessonCount(s.id);
  var month = getStudentMonthCount(s.id);
  var lessons = appData.lessons
    .filter(function (l) { return l.studentId === sid; })
    .sort(function (a, b) { return (b.date + b.startTime).localeCompare(a.date + a.startTime); });

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'detail-modal';

  var html = '<div class="modal-sheet">';
  html += '<div class="detail-header">';
  html += '<div class="avatar-lg">' + s.name.charAt(0) + '</div>';
  html += '<div class="name-lg">' + s.name + '</div>';
  html += '<div class="stats-sm">共 ' + total + ' 节课 · 本月 ' + month + ' 节</div>';
  html += '</div>';

  if (lessons.length === 0) {
    html += '<div class="empty" style="padding:16px"><p>暂无上课记录</p></div>';
  } else {
    html += '<div class="card">';
    lessons.forEach(function (l) {
      var statusTag = l.status === 'completed' ? '✅' : l.status === 'upcoming' ? '⏰' : '❌';
      html += '<div class="lesson-item">';
      html += '<div class="info"><span style="font-size:14px;font-weight:500">' + l.date + ' ' + l.startTime + '-' + l.endTime + '</span>';
      html += '<span style="margin-left:8px;font-size:12px;color:var(--text-secondary)">' + statusTag + '</span></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<button class="btn btn-secondary" style="margin-top:12px" id="btn-close-detail">关闭</button>';
  html += '<button class="btn btn-danger" id="btn-delete-student" data-sid="' + s.id + '">删除学生及所有记录</button>';
  html += '</div>';
  overlay.innerHTML = html;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeDetail();
  });

  $('#btn-close-detail').addEventListener('click', closeDetail);

  $('#btn-delete-student').addEventListener('click', function () {
    if (confirm('确定删除「' + s.name + '」及其所有课程记录吗？此操作不可恢复。')) {
      deleteStudent(s.id);
      closeDetail();
      renderAll();
      showToast('已删除学生：' + s.name);
    }
  });

  function closeDetail() {
    var m = $('#detail-modal');
    if (m) document.body.removeChild(m);
  }
}

// ==================== ADD LESSON MODAL ====================

function showAddModal() {
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
  html += '<span class="mic">🎤</span> 语音输入排课</button>';

  html += '<div class="divider-text">或手动填写</div>';

  // Student
  html += '<div class="form-group">';
  html += '<label>学生</label>';
  if (students.length > 0) {
    html += '<select id="add-student">';
    html += '<option value="">选择学生</option>';
    students.forEach(function (s) {
      html += '<option value="' + s.name + '">' + s.name + '</option>';
    });
    html += '<option value="__new__">+ 新学生</option>';
    html += '</select>';
  } else {
    html += '<input type="text" id="add-student" placeholder="学生姓名">';
  }
  html += '<div id="new-student-wrap" style="display:none;margin-top:8px">';
  html += '<input type="text" id="add-student-new" placeholder="输入新学生姓名" style="width:100%;padding:12px;border:1px solid #E0E0E0;border-radius:10px;font-size:16px;background:#F9F9F9">';
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

  // Voice input
  $('#btn-voice').addEventListener('click', function () {
    var btn = $('#btn-voice');
    btn.classList.add('listening');
    btn.innerHTML = '<span class="mic">🎤</span> 正在聆听...';

    var recognition = startVoiceInput(function (text) {
      btn.classList.remove('listening');
      btn.innerHTML = '<span class="mic">🎤</span> 语音输入排课';

      if (!text) {
        alert('没有识别到语音，请重试。');
        return;
      }

      var parsed = parseVoiceInput(text);
      showConfirmModal(parsed, function () { closeAddModal(); });
    });

    // Timeout after 10 seconds
    setTimeout(function () {
      if (btn.classList.contains('listening')) {
        recognition.stop();
        btn.classList.remove('listening');
        btn.innerHTML = '<span class="mic">🎤</span> 语音输入排课';
      }
    }, 10000);
  });

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

  // Save lesson
  $('#btn-save-lesson').addEventListener('click', function () {
    var studentName;
    if (studentSelect.tagName === 'SELECT') {
      if (studentSelect.value === '__new__') {
        studentName = $('#add-student-new').value.trim();
      } else {
        studentName = studentSelect.value;
      }
    } else {
      studentName = studentSelect.value.trim();
    }

    if (!studentName) { alert('请选择或输入学生姓名'); return; }

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
      status: 'upcoming',
    };

    addLesson(lesson);
    closeAddModal();
    showToast('课程已保存，点击课程旁的按钮添加到日历 📅');
    renderAll();
  });

  function closeAddModal() {
    var m = $('#add-modal');
    if (m) document.body.removeChild(m);
  }
}

// ---- CONFIRM MODAL (after voice parsing) ----

function showConfirmModal(parsed, onSuccess) {
  // Close add modal first
  var addModal = $('#add-modal');
  if (addModal) document.body.removeChild(addModal);

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'confirm-modal';

  var html = '<div class="modal-sheet">';
  html += '<h2>确认课程信息</h2>';

  html += '<div class="parsed-result">';
  html += '<div class="field"><span class="key">学生</span><span class="val">' + (parsed.studentName || '（未识别）') + '</span></div>';
  html += '<div class="field"><span class="key">日期</span><span class="val">' + parsed.date + '</span></div>';
  html += '<div class="field"><span class="key">时间</span><span class="val">' + (parsed.startTime || '（未识别）') + '</span></div>';
  html += '<div class="field"><span class="key">时长</span><span class="val">' + (parsed.durationMins / 60) + ' 小时</span></div>';
  html += '</div>';

  html += '<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin-bottom:12px">如果有误，请点下方修改后保存</p>';

  // Editable fields
  var students = getStudents();
  html += '<div class="form-group"><label>学生</label>';
  if (students.length > 0) {
    html += '<select id="cfm-student">';
    students.forEach(function (s) {
      var sel = s.name === parsed.studentName ? ' selected' : '';
      html += '<option value="' + s.name + '"' + sel + '>' + s.name + '</option>';
    });
    html += '<option value="__new__">+ 新学生</option>';
    html += '</select>';
    html += '<div id="cfm-new-student-wrap" style="display:none;margin-top:8px">';
    html += '<input type="text" id="cfm-student-new" placeholder="输入新学生姓名" style="width:100%;padding:12px;border:1px solid #E0E0E0;border-radius:10px;font-size:16px;background:#F9F9F9">';
    html += '</div>';
  } else {
    html += '<input type="text" id="cfm-student" value="' + parsed.studentName + '">';
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

  html += '<button class="btn btn-primary" id="btn-cfm-save">确认保存</button>';
  html += '<button class="btn btn-secondary" id="btn-cfm-cancel">取消</button>';
  html += '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  $('#btn-cfm-cancel').addEventListener('click', function () {
    document.body.removeChild(overlay);
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

    var lesson = {
      studentId: student.id,
      studentName: student.name,
      date: date,
      startTime: startTime,
      endTime: endTime,
      duration: durationMins,
      status: 'upcoming',
    };

    addLesson(lesson);
    document.body.removeChild(overlay);
    showToast('课程已保存，点击课程旁的按钮添加到日历 📅');
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
