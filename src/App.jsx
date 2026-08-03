import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Radio, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Copy,
  Users, ArrowUp, ArrowDown, X, Check, RotateCcw, CalendarPlus, Loader2,
  MessageSquareText, BarChart3, CalendarDays, AlertTriangle, Sparkles, Ban,
  Cloud, HardDrive, ChevronUp, ChevronDown,
} from "lucide-react";
import { storage } from "./storage";

const TICKET_CAP = 10;
const WORKERS = ["지수", "재규", "현정", "지욱", "준선"];

// ---------- date helpers ----------
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nextSaturday = (from) => {
  const d = new Date(from);
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
};
const addWeeks = (dateKey, n) => {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return toKey(d);
};
const displayDate = (dateKey) => {
  const d = new Date(dateKey + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${days[d.getDay()]})`;
};
const monthKeyOf = (dateKey) => dateKey.slice(0, 7);
const monthLabel = (monthKey) => {
  const [y, m] = monthKey.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
};
const shiftMonth = (monthKey, n) => {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
// 오늘 날짜로부터 가장 가까운 주차를 찾는다 (미래/과거 포함, 가장 가까운 것)
// '이번 주'로 보여줄 주차를 정한다. 일요일부터는 그 다음 토요일이 "이번 주"가 된다
// (예: 8/1(토) 방송이 끝나고 8/2(일)이 되는 순간부터는 8/8(토)을 보여줌).
// 아직 그 날짜가 목록에 추가돼 있지 않다면, 그 날짜와 가장 가까운 기존 주차로 대체한다.
const currentShowWeek = (weekList) => {
  if (!weekList || weekList.length === 0) return null;
  const ideal = toKey(nextSaturday(new Date()));
  if (weekList.includes(ideal)) return ideal;
  const idealTime = new Date(ideal + "T00:00:00").getTime();
  let best = weekList[0];
  let bestDiff = Infinity;
  for (const w of weekList) {
    const diff = Math.abs(new Date(w + "T00:00:00").getTime() - idealTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = w;
    }
  }
  return best;
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- storage helpers ----------
async function loadWeeks() {
  try {
    const r = await storage.get("weeks-list", false);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}
async function saveWeeks(list) {
  try {
    await storage.set("weeks-list", JSON.stringify(list), false);
    return true;
  } catch (err) {
    console.error("[saveWeeks] 주차 목록 저장 실패:", err);
    return false;
  }
}
async function loadApps(weekKey) {
  try {
    const r = await storage.get(`week-apps:${weekKey}`, false);
    return r ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}
async function saveApps(weekKey, apps) {
  try {
    await storage.set(`week-apps:${weekKey}`, JSON.stringify(apps), false);
    return true;
  } catch {
    return false;
  }
}
function normalizeMeta(m) {
  if (!m) return { workers: ["", ""], cancelled: false };
  // migrate from the old single-worker shape
  if (m.workers == null && m.worker != null) {
    return { workers: [m.worker || "", ""], cancelled: !!m.cancelled };
  }
  return { workers: [m.workers?.[0] || "", m.workers?.[1] || ""], cancelled: !!m.cancelled };
}
async function loadMeta(weekKey) {
  try {
    const r = await storage.get(`week-meta:${weekKey}`, false);
    return r ? normalizeMeta(JSON.parse(r.value)) : { workers: ["", ""], cancelled: false };
  } catch {
    return { workers: ["", ""], cancelled: false };
  }
}
async function saveMeta(weekKey, meta) {
  try {
    await storage.set(`week-meta:${weekKey}`, JSON.stringify(meta), false);
  } catch (err) {
    console.error("[saveMeta] 근무자/결방 정보 저장 실패:", weekKey, err);
  }
}
async function getDismissFlag(todayKey) {
  try {
    const r = await storage.get(`wed-dismiss:${todayKey}`, false);
    return !!r;
  } catch {
    return false;
  }
}
async function setDismissFlag(todayKey) {
  try {
    await storage.set(`wed-dismiss:${todayKey}`, "1", false);
  } catch {}
}

// ---------- headcount / ticket logic ----------
// target headcount: explicit estimate if given, else however many visitors are already listed, else 1 (placeholder / 미정)
function targetCount(app) {
  if (app.headcount != null && app.headcount > 0) return app.headcount;
  if (app.visitors.length > 0) return app.visitors.length;
  return null; // completely unknown
}
function ticketCount(app) {
  const t = targetCount(app);
  return Math.max(t || 1, app.visitors.length);
}
function isShort(app) {
  const t = targetCount(app);
  if (t == null) return app.visitors.length === 0; // 아무 정보도 없음
  return app.visitors.length < t;
}
function splitConfirmWaitlist(apps) {
  let running = 0;
  const confirmed = [];
  const waitlist = [];
  for (const a of apps) {
    const c = ticketCount(a);
    if (running + c <= TICKET_CAP) {
      confirmed.push(a);
      running += c;
    } else {
      waitlist.push(a);
    }
  }
  return { confirmed, waitlist, used: running };
}

// ---------- kakao free-text participant parser (best effort) ----------
function parseParticipants(text) {
  const phoneRe = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  const hangulRe = /[가-힣]+/g;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [];
  let pendingName = null;
  for (const line of lines) {
    const phones = line.match(phoneRe);
    if (phones && phones.length) {
      const phone = phones[0].replace(/[.\s]/g, "-").replace(/-{2,}/g, "-");
      const rest = line.replace(phoneRe, "");
      // 이름은 한글만 인식 (예: "김다경-010-1234-1234" → "김다경")
      const hangulMatches = rest.match(hangulRe);
      const extractedName = hangulMatches ? hangulMatches.join("") : null;
      const name = extractedName || pendingName || `참가자${results.length + 1}`;
      results.push({ id: uid(), name, contact: phone });
      pendingName = null;
    } else {
      const hangulMatches = line.match(hangulRe);
      const cleaned = hangulMatches ? hangulMatches.join("") : "";
      if (cleaned && cleaned.length <= 12) {
        pendingName = cleaned;
      }
    }
  }
  return results;
}

// ---------- 최종 명단 (클립보드 복사용) ----------
function buildFinalRoster(apps) {
  const { confirmed } = splitConfirmWaitlist(apps);
  const blocks = confirmed.map((a) => {
    const lines = [a.applicantName];
    if (a.visitors.length === 0) {
      lines.push("미입력");
    } else {
      a.visitors.forEach((v) => lines.push(v.contact || "미입력"));
    }
    return lines.join("\n");
  });
  return blocks.join("\n\n");
}
function downloadTxt(filename, content) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function TicketConsole() {
  const [weeks, setWeeks] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [apps, setApps] = useState([]);
  const [meta, setMeta] = useState({ workers: ["", ""], cancelled: false });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("week"); // week | monthly | stats | offair

  // 결방(broadcast cancelled) tab
  const [offairRows, setOffairRows] = useState([]);
  const [offairOptions, setOffairOptions] = useState([]);
  const [offairLoading, setOffairLoading] = useState(false);
  const [offairPick, setOffairPick] = useState("");

  const [form, setForm] = useState({ name: "", headcount: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", headcount: "" });
  const [visitorDraft, setVisitorDraft] = useState({ name: "", contact: "" });
  const [confirmReset, setConfirmReset] = useState(false);

  // kakao import modal
  const [kakaoOpen, setKakaoOpen] = useState(false);
  const [kakaoName, setKakaoName] = useState("");
  const [kakaoText, setKakaoText] = useState("");
  const [kakaoPreview, setKakaoPreview] = useState(null);

  // wednesday nudge popup
  const [wedAlert, setWedAlert] = useState({ open: false, weekKey: null, names: [] });

  // monthly summary
  const [monthKey, setMonthKey] = useState(null);
  const [monthlyRows, setMonthlyRows] = useState([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyExpanded, setMonthlyExpanded] = useState(null); // weekKey | null
  const [monthlyDetail, setMonthlyDetail] = useState({}); // weekKey -> { confirmed, waitlist, loading }

  // stats
  const [statsRows, setStatsRows] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // ---------- initial load ----------
  useEffect(() => {
    (async () => {
      let list = await loadWeeks();
      if (!list || list.length === 0) {
        const wk = toKey(nextSaturday(new Date()));
        list = [wk];
        await saveWeeks(list);
      }
      setWeeks(list);
      const landing = currentShowWeek(list);
      setCurrentWeek(landing);
      setMonthKey(monthKeyOf(landing));
      setReady(true);
    })();
  }, []);

  // ---------- load apps + meta on week change ----------
  useEffect(() => {
    if (!currentWeek) return;
    (async () => {
      const [a, m] = await Promise.all([loadApps(currentWeek), loadMeta(currentWeek)]);
      setApps(a);
      setMeta(m);
    })();
  }, [currentWeek]);

  // ---------- wednesday nudge check (runs once weeks are known) ----------
  useEffect(() => {
    if (!ready || weeks.length === 0) return;
    (async () => {
      const today = new Date();
      if (today.getDay() !== 3) return; // only Wednesdays
      const todayKey = toKey(today);
      const dismissed = await getDismissFlag(todayKey);
      if (dismissed) return;
      const targetWeek = toKey(nextSaturday(today));
      if (!weeks.includes(targetWeek)) return;
      const wApps = await loadApps(targetWeek);
      const { confirmed } = splitConfirmWaitlist(wApps);
      const shortNames = confirmed.filter(isShort).map((a) => a.applicantName);
      if (shortNames.length > 0) {
        setWedAlert({ open: true, weekKey: targetWeek, names: shortNames });
      }
    })();
  }, [ready, weeks]);

  const persist = useCallback(
    async (next) => {
      setApps(next);
      setSaving(true);
      await saveApps(currentWeek, next);
      setSaving(false);
    },
    [currentWeek]
  );

  const persistMeta = useCallback(
    async (next) => {
      setMeta(next);
      await saveMeta(currentWeek, next);
    },
    [currentWeek]
  );

  const { confirmed, waitlist, used } = useMemo(() => splitConfirmWaitlist(apps), [apps]);
  const remaining = Math.max(0, TICKET_CAP - used);

  // ---------- week navigation ----------
  const goWeek = (dir) => {
    const idx = weeks.indexOf(currentWeek);
    const ni = idx + dir;
    if (ni >= 0 && ni < weeks.length) setCurrentWeek(weeks[ni]);
  };
  const openWeekTab = () => {
    setView("week");
    const nw = currentShowWeek(weeks);
    if (nw) setCurrentWeek(nw);
  };
  const addNextWeek = async () => {
    const last = weeks[weeks.length - 1];
    const nw = addWeeks(last, 1);
    if (weeks.includes(nw)) {
      setCurrentWeek(nw);
      return;
    }
    const list = [...weeks, nw];
    setWeeks(list);
    const ok = await saveWeeks(list);
    if (!ok) {
      alert("새 주차 저장에 실패했어요. 새로고침하면 사라질 수 있어요.\n브라우저 콘솔(개발자 도구)에서 에러 내용을 확인해주세요.");
    }
    setCurrentWeek(nw);
  };

  // ---------- applicant CRUD ----------
  const addApplicant = async () => {
    if (!form.name.trim()) return;
    const newApp = {
      id: uid(),
      applicantName: form.name.trim(),
      headcount: form.headcount ? parseInt(form.headcount, 10) : null,
      visitors: [],
      createdAt: Date.now(),
    };
    await persist([...apps, newApp]);
    setForm({ name: "", headcount: "" });
  };

  const removeApplicant = async (id) => {
    await persist(apps.filter((a) => a.id !== id));
  };

  const moveApplicant = async (id, dir) => {
    const idx = apps.findIndex((a) => a.id === id);
    const ni = idx + dir;
    if (ni < 0 || ni >= apps.length) return;
    const next = [...apps];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    await persist(next);
  };

  const startEdit = (app) => {
    setEditingId(app.id);
    setEditForm({
      name: app.applicantName,
      headcount: app.headcount != null ? String(app.headcount) : "",
    });
  };
  const saveEdit = async (id) => {
    const next = apps.map((a) =>
      a.id === id
        ? {
            ...a,
            applicantName: editForm.name.trim() || a.applicantName,
            headcount: editForm.headcount ? parseInt(editForm.headcount, 10) : null,
          }
        : a
    );
    await persist(next);
    setEditingId(null);
  };

  // ---------- visitor CRUD ----------
  const addVisitor = async (appId) => {
    if (!visitorDraft.name.trim()) return;
    const next = apps.map((a) =>
      a.id === appId
        ? {
            ...a,
            visitors: [
              ...a.visitors,
              { id: uid(), name: visitorDraft.name.trim(), contact: visitorDraft.contact.trim() },
            ],
          }
        : a
    );
    await persist(next);
    setVisitorDraft({ name: "", contact: "" });
  };
  const removeVisitor = async (appId, visitorId) => {
    const next = apps.map((a) =>
      a.id === appId ? { ...a, visitors: a.visitors.filter((v) => v.id !== visitorId) } : a
    );
    await persist(next);
  };

  const resetWeek = async () => {
    await persist([]);
    setConfirmReset(false);
  };

  // ---------- kakao import ----------
  const runExtract = () => {
    const found = parseParticipants(kakaoText);
    setKakaoPreview(found.length > 0 ? found : []);
  };
  const updatePreviewRow = (id, field, value) => {
    setKakaoPreview((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const removePreviewRow = (id) => {
    setKakaoPreview((prev) => prev.filter((r) => r.id !== id));
  };
  const addPreviewRow = () => {
    setKakaoPreview((prev) => [...(prev || []), { id: uid(), name: "", contact: "" }]);
  };
  const confirmKakaoImport = async () => {
    if (!kakaoName.trim() || !kakaoPreview || kakaoPreview.length === 0) return;
    const newApp = {
      id: uid(),
      applicantName: kakaoName.trim(),
      headcount: null,
      visitors: kakaoPreview
        .filter((r) => r.name.trim())
        .map((r) => ({ id: uid(), name: r.name.trim(), contact: r.contact.trim() })),
      createdAt: Date.now(),
    };
    await persist([...apps, newApp]);
    setKakaoOpen(false);
    setKakaoName("");
    setKakaoText("");
    setKakaoPreview(null);
  };

  // ---------- export ----------
  const [exportCopied, setExportCopied] = useState(false);
  const doExport = async () => {
    const text = buildFinalRoster(apps);
    if (!text) {
      alert("확정된 신청이 없어서 내보낼 명단이 없어요.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    } catch (err) {
      console.error("[doExport] 클립보드 복사 실패:", err);
      downloadTxt(`사내표명단_${currentWeek}.txt`, text);
      alert("클립보드 복사 권한이 없어서 대신 TXT 파일로 저장했어요.");
    }
  };

  // ---------- monthly summary ----------
  useEffect(() => {
    if (view !== "monthly" || !monthKey) return;
    (async () => {
      setMonthlyLoading(true);
      const weeksInMonth = weeks.filter((w) => monthKeyOf(w) === monthKey);
      const rows = [];
      for (const w of weeksInMonth) {
        const [a, m] = await Promise.all([loadApps(w), loadMeta(w)]);
        const { confirmed, used: u } = splitConfirmWaitlist(a);
        const workerLabel = m.workers.filter(Boolean).join(" · ") || "미지정";
        rows.push({
          weekKey: w,
          teams: confirmed.length,
          used: u,
          remaining: Math.max(0, TICKET_CAP - u),
          worker: workerLabel,
          cancelled: m.cancelled,
        });
      }
      setMonthlyRows(rows);
      setMonthlyLoading(false);
      setMonthlyExpanded(null);
    })();
  }, [view, monthKey, weeks]);

  const toggleMonthlyRow = async (weekKey) => {
    if (monthlyExpanded === weekKey) {
      setMonthlyExpanded(null);
      return;
    }
    setMonthlyExpanded(weekKey);
    if (monthlyDetail[weekKey]) return; // 이미 불러온 적 있으면 재사용
    setMonthlyDetail((prev) => ({ ...prev, [weekKey]: { loading: true } }));
    const a = await loadApps(weekKey);
    const { confirmed, waitlist } = splitConfirmWaitlist(a);
    setMonthlyDetail((prev) => ({ ...prev, [weekKey]: { confirmed, waitlist, loading: false } }));
  };

  // ---------- 결방(broadcast cancelled) tab ----------
  const loadOffairData = useCallback(async () => {
    setOffairLoading(true);
    const cancelled = [];
    const active = [];
    for (const w of weeks) {
      const m = await loadMeta(w);
      if (m.cancelled) {
        cancelled.push({ weekKey: w, workers: m.workers.filter(Boolean).join(" · ") || "미지정" });
      } else {
        active.push(w);
      }
    }
    cancelled.sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));
    setOffairRows(cancelled);
    setOffairOptions(active);
    setOffairLoading(false);
  }, [weeks]);

  useEffect(() => {
    if (view !== "offair") return;
    loadOffairData();
  }, [view, loadOffairData]);

  const markOffair = async (weekKey) => {
    if (!weekKey) return;
    const m = await loadMeta(weekKey);
    const next = { ...m, cancelled: true };
    await saveMeta(weekKey, next);
    if (weekKey === currentWeek) setMeta(next);
    setOffairPick("");
    loadOffairData();
  };
  const unmarkOffair = async (weekKey) => {
    const m = await loadMeta(weekKey);
    const next = { ...m, cancelled: false };
    await saveMeta(weekKey, next);
    if (weekKey === currentWeek) setMeta(next);
    loadOffairData();
  };

  // ---------- stats ----------
  useEffect(() => {
    if (view !== "stats") return;
    (async () => {
      setStatsLoading(true);
      const counts = new Map();
      for (const w of weeks) {
        const a = await loadApps(w);
        a.forEach((app) => {
          const key = app.applicantName.trim();
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + ticketCount(app));
        });
      }
      const rows = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      setStatsRows(rows);
      setStatsLoading(false);
    })();
  }, [view, weeks]);

  const dismissWedAlert = async () => {
    const todayKey = toKey(new Date());
    await setDismissFlag(todayKey);
    setWedAlert({ open: false, weekKey: null, names: [] });
  };

  if (!ready) {
    return (
      <div style={styles.loadingScreen}>
        <Loader2 className="spin" size={22} />
        <span style={{ marginLeft: 10 }}>불러오는 중…</span>
        <style>{baseCss}</style>
      </div>
    );
  }

  const weekIdx = weeks.indexOf(currentWeek);

  return (
    <div style={styles.app} className="tc-root">
      <style>{baseCss}</style>

      {/* ---------- header ---------- */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <Radio size={20} color="var(--amber)" />
          <div>
            <div style={styles.brandTitle}>ON-AIR TICKET DESK</div>
            <div style={styles.brandSub}>
              음악프로그램 사내표 예약 관리
              <span style={styles.syncBadge}>
                {storage.isCloudEnabled
                  ? (<><Cloud size={11} /> 클라우드 동기화 중 (기기 간 공유됨)</>)
                  : (<><HardDrive size={11} /> 이 기기에만 저장됨</>)}
              </span>
            </div>
          </div>
        </div>

        <nav style={styles.tabs}>
          <button className={`tabbtn ${view === "week" ? "active" : ""}`} onClick={openWeekTab}>
            이번 주
          </button>
          <button className={`tabbtn ${view === "monthly" ? "active" : ""}`} onClick={() => setView("monthly")}>
            <CalendarDays size={13} /> 월간 요약
          </button>
          <button className={`tabbtn ${view === "stats" ? "active" : ""}`} onClick={() => setView("stats")}>
            <BarChart3 size={13} /> 신청자 통계
          </button>
          <button className={`tabbtn ${view === "offair" ? "active" : ""}`} onClick={() => setView("offair")}>
            <Ban size={13} /> 결방
          </button>
        </nav>
      </header>

      {view === "week" && (
        <>
          <section style={styles.weekBar}>
            <div style={styles.weekNav}>
              <button className="iconbtn" onClick={() => goWeek(-1)} disabled={weekIdx <= 0}>
                <ChevronLeft size={16} />
              </button>
              <div style={styles.weekLabel}>
                {displayDate(currentWeek)}
                {meta.cancelled && <span style={styles.cancelledBadge}>결방</span>}
              </div>
              <button className="iconbtn" onClick={() => goWeek(1)} disabled={weekIdx >= weeks.length - 1}>
                <ChevronRight size={16} />
              </button>
              <button className="ghostbtn" onClick={addNextWeek}>
                <CalendarPlus size={14} />
                다음 주 추가
              </button>
            </div>
            <div style={styles.workerPicker}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>근무자</span>
              {[0, 1].map((i) => (
                <select
                  key={i}
                  style={styles.select}
                  value={meta.workers[i] || ""}
                  onChange={(e) => {
                    const workers = [...meta.workers];
                    workers[i] = e.target.value;
                    persistMeta({ ...meta, workers });
                  }}
                >
                  <option value="">선택 {i + 1}</option>
                  {WORKERS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              ))}
            </div>
          </section>

          {meta.cancelled && (
            <div style={styles.cancelBanner}>
              <Ban size={14} />
              이번 주는 결방으로 표시되어 있어요. 표 예약 내용은 그대로 남아있으니 필요하면 "결방" 탭에서 해제할 수 있어요.
            </div>
          )}

          {/* ---------- tally lights ---------- */}
          <section style={styles.gaugePanel}>
            <div style={styles.lights}>
              {Array.from({ length: TICKET_CAP }).map((_, i) => (
                <span key={i} className={`light ${i < used ? "lit" : ""}`} />
              ))}
            </div>
            <div style={styles.gaugeText}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 28, color: remaining === 0 ? "var(--red)" : "var(--amber)" }}>
                {remaining}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 13 }}> / {TICKET_CAP} 잔여</span>
              {waitlist.length > 0 && (
                <span style={{ marginLeft: 12, color: "var(--red)", fontSize: 12 }}>대기 {waitlist.length}팀</span>
              )}
            </div>
            <div style={{ flex: 1 }} />
            {saving && <span style={{ fontSize: 11, color: "var(--muted)" }}>저장 중…</span>}
            <button className="ghostbtn" onClick={() => setKakaoOpen(true)}>
              <MessageSquareText size={14} />
              카톡 붙여넣기로 등록
            </button>
            <button className="ghostbtn" onClick={doExport}>
              {exportCopied ? <Check size={14} /> : <Copy size={14} />}
              {exportCopied ? "복사됨!" : "최종 명단 추출"}
            </button>
            {!confirmReset ? (
              <button className="ghostbtn danger" onClick={() => setConfirmReset(true)}>
                <RotateCcw size={14} />
                이번 주 초기화
              </button>
            ) : (
              <span style={styles.confirmRow}>
                정말 삭제할까요?
                <button className="ghostbtn danger" onClick={resetWeek}>네</button>
                <button className="ghostbtn" onClick={() => setConfirmReset(false)}>아니오</button>
              </span>
            )}
          </section>

          {/* ---------- body ---------- */}
          <main style={styles.grid} className="tc-grid">
            <section style={styles.formPanel}>
              <div style={styles.panelTitle}>수동 등록</div>
              <label style={styles.label}>신청자 성함</label>
              <input style={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
              <label style={styles.label}>인원 (모르면 비워두세요)</label>
              <input style={styles.input} type="number" min="1" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} placeholder="예: 2" />
              <button style={styles.primaryBtn} onClick={addApplicant}>
                <Plus size={15} />
                신청 등록
              </button>
              <p style={styles.hint}>
                등록 순서대로 {TICKET_CAP}장까지 자동으로 <b style={{ color: "var(--green)" }}>확정</b>되고,
                초과분은 <b style={{ color: "var(--red)" }}>대기</b>로 표시돼요. 방문자 성함·연락처는
                <Users size={11} style={{ verticalAlign: -1, margin: "0 2px" }} /> 버튼으로 나중에 추가하면 인원수가 자동 계산돼요.
              </p>
            </section>

            <section style={styles.listCol}>
              <ListBlock
                title={`확정 명단 (${confirmed.length}팀 · ${used}석)`}
                color="var(--green)"
                apps={confirmed}
                expandedId={expandedId} setExpandedId={setExpandedId}
                editingId={editingId} editForm={editForm} setEditForm={setEditForm}
                startEdit={startEdit} saveEdit={saveEdit} cancelEdit={() => setEditingId(null)}
                remove={removeApplicant} move={moveApplicant}
                visitorDraft={visitorDraft} setVisitorDraft={setVisitorDraft}
                addVisitor={addVisitor} removeVisitor={removeVisitor}
              />
              <ListBlock
                title={`대기 명단 (${waitlist.length}팀)`}
                color="var(--red)"
                apps={waitlist}
                expandedId={expandedId} setExpandedId={setExpandedId}
                editingId={editingId} editForm={editForm} setEditForm={setEditForm}
                startEdit={startEdit} saveEdit={saveEdit} cancelEdit={() => setEditingId(null)}
                remove={removeApplicant} move={moveApplicant}
                visitorDraft={visitorDraft} setVisitorDraft={setVisitorDraft}
                addVisitor={addVisitor} removeVisitor={removeVisitor}
              />
            </section>
          </main>
        </>
      )}

      {view === "monthly" && (
        <section style={styles.panelBlock}>
          <div style={styles.monthNav}>
            <button className="iconbtn" onClick={() => setMonthKey(shiftMonth(monthKey, -1))}><ChevronLeft size={16} /></button>
            <div style={styles.weekLabel}>{monthLabel(monthKey)}</div>
            <button className="iconbtn" onClick={() => setMonthKey(shiftMonth(monthKey, 1))}><ChevronRight size={16} /></button>
          </div>
          {monthlyLoading ? (
            <div style={styles.emptyState}><Loader2 className="spin" size={14} style={{ marginRight: 6 }} />불러오는 중…</div>
          ) : monthlyRows.length === 0 ? (
            <div style={styles.emptyState}>이 달에는 등록된 주차가 없어요.</div>
          ) : (
            <table style={styles.dataTable}>
              <thead>
                <tr>
                  <th style={styles.th}>일자</th>
                  <th style={styles.th}>신청수량(석)</th>
                  <th style={styles.th}>잔여수량(석)</th>
                  <th style={styles.th}>근무자</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((r) => {
                  const isOpen = monthlyExpanded === r.weekKey;
                  const detail = monthlyDetail[r.weekKey];
                  return (
                    <React.Fragment key={r.weekKey}>
                      <tr className="clickable-row" onClick={() => toggleMonthlyRow(r.weekKey)}>
                        <td style={styles.td}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {displayDate(r.weekKey)}
                          </span>
                          {r.cancelled && <span style={styles.cancelledBadge}>결방</span>}
                        </td>
                        {r.cancelled ? (
                          <td style={styles.td} colSpan={2}><span style={{ color: "var(--muted)" }}>결방으로 예약 없음</span></td>
                        ) : (
                          <>
                            <td style={styles.td}>{r.used} <span style={{ color: "var(--muted)", fontSize: 11 }}>({r.teams}팀)</span></td>
                            <td style={styles.td}>{r.remaining}</td>
                          </>
                        )}
                        <td style={styles.td}>{r.worker}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td style={styles.tdDetail} colSpan={4}>
                            {!detail || detail.loading ? (
                              <div style={styles.emptyState}><Loader2 className="spin" size={13} style={{ marginRight: 6 }} />불러오는 중…</div>
                            ) : detail.confirmed.length === 0 && detail.waitlist.length === 0 ? (
                              <div style={styles.emptyState}>이 주는 신청이 없어요.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {detail.confirmed.length > 0 && (
                                  <div>
                                    <div style={styles.detailLabel}>확정 ({detail.confirmed.length}팀)</div>
                                    <div style={styles.detailChips}>
                                      {detail.confirmed.map((a) => (
                                        <span key={a.id} style={styles.chip}>{a.applicantName} · {ticketCount(a)}명</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {detail.waitlist.length > 0 && (
                                  <div>
                                    <div style={{ ...styles.detailLabel, color: "var(--red)" }}>대기 ({detail.waitlist.length}팀)</div>
                                    <div style={styles.detailChips}>
                                      {detail.waitlist.map((a) => (
                                        <span key={a.id} style={{ ...styles.chip, borderColor: "var(--red)" }}>{a.applicantName} · {ticketCount(a)}명</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {view === "stats" && (
        <section style={styles.panelBlock}>
          <div style={styles.panelTitle}>신청자 통계 — 누적 방문 인원순 (전체 기간)</div>
          {statsLoading ? (
            <div style={styles.emptyState}><Loader2 className="spin" size={14} style={{ marginRight: 6 }} />불러오는 중…</div>
          ) : statsRows.length === 0 ? (
            <div style={styles.emptyState}>아직 신청 기록이 없어요.</div>
          ) : (
            <table style={styles.dataTable}>
              <thead>
                <tr>
                  <th style={styles.th}>신청자</th>
                  <th style={styles.th}>누적 방문 인원</th>
                </tr>
              </thead>
              <tbody>
                {statsRows.map((r) => (
                  <tr key={r.name}>
                    <td style={styles.td}>{r.name}</td>
                    <td style={{ ...styles.td, fontFamily: "var(--mono)" }}>{r.count}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {view === "offair" && (
        <section style={styles.panelBlock}>
          <div style={styles.panelTitle}>결방 등록</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <select style={styles.select} value={offairPick} onChange={(e) => setOffairPick(e.target.value)}>
              <option value="">결방으로 표시할 주차 선택</option>
              {offairOptions.map((w) => (
                <option key={w} value={w}>{displayDate(w)}</option>
              ))}
            </select>
            <button className="ghostbtn" onClick={() => markOffair(offairPick)} disabled={!offairPick}>
              <Ban size={13} /> 결방으로 등록
            </button>
          </div>

          <div style={styles.panelTitle}>결방 기록</div>
          {offairLoading ? (
            <div style={styles.emptyState}><Loader2 className="spin" size={14} style={{ marginRight: 6 }} />불러오는 중…</div>
          ) : offairRows.length === 0 ? (
            <div style={styles.emptyState}>결방으로 등록된 주차가 없어요.</div>
          ) : (
            <table style={styles.dataTable}>
              <thead>
                <tr>
                  <th style={styles.th}>일자</th>
                  <th style={styles.th}>근무자</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {offairRows.map((r) => (
                  <tr key={r.weekKey}>
                    <td style={styles.td}>{displayDate(r.weekKey)}</td>
                    <td style={styles.td}>{r.workers}</td>
                    <td style={styles.td}>
                      <button className="ghostbtn" onClick={() => unmarkOffair(r.weekKey)}>해제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ---------- kakao import modal ---------- */}
      {kakaoOpen && (
        <div style={styles.overlay} onClick={() => setKakaoOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span style={styles.panelTitle}><Sparkles size={14} style={{ verticalAlign: -2 }} /> 카톡 붙여넣기로 등록</span>
              <button className="iconbtn" onClick={() => setKakaoOpen(false)}><X size={14} /></button>
            </div>
            <label style={styles.label}>신청자 성함</label>
            <input style={styles.input} value={kakaoName} onChange={(e) => setKakaoName(e.target.value)} placeholder="카톡으로 신청한 사람 이름" />
            <label style={styles.label}>카톡 내용 붙여넣기</label>
            <textarea
              style={styles.textarea}
              rows={5}
              value={kakaoText}
              onChange={(e) => setKakaoText(e.target.value)}
              placeholder={"예)\n홍길동 010-1234-5678\n김철수 010-2222-3333"}
            />
            <button style={styles.primaryBtn} onClick={runExtract}>
              <Sparkles size={14} />
              참여 명단 추출하기
            </button>

            {kakaoPreview && (
              <div style={styles.previewBox}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  추출된 {kakaoPreview.length}명 — 등록 전에 확인·수정하세요
                </div>
                {kakaoPreview.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 6 }}>
                    자동으로 찾지 못했어요. 아래에서 직접 추가해주세요.
                  </div>
                )}
                {kakaoPreview.map((r) => (
                  <div key={r.id} style={styles.visitorAdd}>
                    <input style={styles.inlineInput} value={r.name} onChange={(e) => updatePreviewRow(r.id, "name", e.target.value)} placeholder="성함" />
                    <input style={styles.inlineInput} value={r.contact} onChange={(e) => updatePreviewRow(r.id, "contact", e.target.value)} placeholder="연락처" />
                    <button className="iconbtn tiny danger" onClick={() => removePreviewRow(r.id)}><X size={11} /></button>
                  </div>
                ))}
                <button className="ghostbtn" onClick={addPreviewRow} style={{ marginTop: 4 }}>
                  <Plus size={12} /> 줄 추가
                </button>
                <button style={{ ...styles.primaryBtn, marginTop: 12 }} onClick={confirmKakaoImport}>
                  <Check size={14} /> 이 명단으로 신청 등록
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- wednesday nudge popup ---------- */}
      {wedAlert.open && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHead}>
              <span style={styles.panelTitle}><AlertTriangle size={14} color="var(--red)" style={{ verticalAlign: -2 }} /> 수요일 명단 확인 알림</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              {displayDate(wedAlert.weekKey)} 확정자 중 방문자 명단(성함·연락처)이 부족한 분들이 있어요.
              카톡으로 안내해주세요:
            </p>
            <ul style={styles.nudgeList}>
              {wedAlert.names.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <button style={styles.primaryBtn} onClick={dismissWedAlert}>
              <Check size={14} /> 확인했어요 (오늘은 그만 보기)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- sub component ----------
function ListBlock({
  title, color, apps, expandedId, setExpandedId,
  editingId, editForm, setEditForm, startEdit, saveEdit, cancelEdit,
  remove, move, visitorDraft, setVisitorDraft, addVisitor, removeVisitor,
}) {
  return (
    <div style={styles.listPanel}>
      <div style={{ ...styles.panelTitle, color }}>{title}</div>
      {apps.length === 0 && <div style={styles.emptyState}>아직 신청이 없어요.</div>}
      {apps.map((a) => {
        const isEditing = editingId === a.id;
        const isExpanded = expandedId === a.id;
        const count = ticketCount(a);
        const short = isShort(a);
        return (
          <div key={a.id} style={styles.row}>
            <div style={styles.rowMain}>
              <div style={styles.moveCol}>
                <button className="iconbtn tiny" onClick={() => move(a.id, -1)}><ArrowUp size={12} /></button>
                <button className="iconbtn tiny" onClick={() => move(a.id, 1)}><ArrowDown size={12} /></button>
              </div>

              {!isEditing ? (
                <div style={{ flex: 1 }}>
                  <div style={styles.rowName}>
                    {a.applicantName}
                    <span style={styles.countBadge}>{count}명</span>
                    {short && <span style={styles.shortBadge}>명단 미완료</span>}
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input style={styles.inlineInput} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <input style={{ ...styles.inlineInput, width: 60 }} type="number" value={editForm.headcount} onChange={(e) => setEditForm({ ...editForm, headcount: e.target.value })} placeholder="인원" />
                </div>
              )}

              <div style={styles.rowActions}>
                {!isEditing ? (
                  <>
                    <button className="iconbtn" onClick={() => setExpandedId(isExpanded ? null : a.id)} title="방문자 명단">
                      <Users size={14} />
                    </button>
                    <button className="iconbtn" onClick={() => startEdit(a)} title="수정"><Pencil size={14} /></button>
                    <button className="iconbtn danger" onClick={() => remove(a.id)} title="삭제"><Trash2 size={14} /></button>
                  </>
                ) : (
                  <>
                    <button className="iconbtn" onClick={() => saveEdit(a.id)} title="저장"><Check size={14} /></button>
                    <button className="iconbtn" onClick={cancelEdit} title="취소"><X size={14} /></button>
                  </>
                )}
              </div>
            </div>

            {isExpanded && (
              <div style={styles.visitorBox}>
                {a.visitors.map((v) => (
                  <div key={v.id} style={styles.visitorRow}>
                    <span style={{ fontFamily: "var(--mono)" }}>{v.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{v.contact || "연락처 미입력"}</span>
                    <button className="iconbtn tiny danger" onClick={() => removeVisitor(a.id, v.id)}><X size={11} /></button>
                  </div>
                ))}
                <div style={styles.visitorAdd}>
                  <input style={styles.inlineInput} placeholder="방문자 성함" value={visitorDraft.name} onChange={(e) => setVisitorDraft({ ...visitorDraft, name: e.target.value })} />
                  <input style={styles.inlineInput} placeholder="방문자 연락처" value={visitorDraft.contact} onChange={(e) => setVisitorDraft({ ...visitorDraft, contact: e.target.value })} />
                  <button className="ghostbtn" onClick={() => addVisitor(a.id)}><Plus size={13} />추가</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- styles ----------
const styles = {
  loadingScreen: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: 300, color: "var(--muted)", fontFamily: "var(--body)",
    background: "var(--bg)",
  },
  app: {
    fontFamily: "var(--body)", background: "var(--bg)", color: "var(--text)",
    minHeight: "100%", padding: "20px", borderRadius: 12,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap", gap: 12, marginBottom: 14,
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandTitle: { fontFamily: "var(--display)", fontSize: 17, fontWeight: 700, letterSpacing: "0.02em" },
  brandSub: { fontSize: 12, color: "var(--muted)" },
  syncBadge: {
    display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8,
    fontSize: 10.5, color: "var(--muted)", verticalAlign: "middle",
  },
  tabs: { display: "flex", gap: 6 },
  weekBar: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  weekNav: { display: "flex", alignItems: "center", gap: 8 },
  workerPicker: { display: "flex", alignItems: "center", gap: 8 },
  select: {
    background: "var(--panel-alt)", border: "1px solid var(--border)", color: "var(--text)",
    borderRadius: 6, padding: "6px 8px", fontSize: 16,
  },
  weekLabel: { fontFamily: "var(--mono)", fontSize: 14, minWidth: 120, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  cancelledBadge: {
    fontFamily: "var(--body)", fontSize: 10, color: "var(--red)", border: "1px solid var(--red)",
    borderRadius: 4, padding: "1px 6px",
  },
  cancelBanner: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--red)",
    background: "var(--amber-dim)", border: "1px solid var(--red)", borderRadius: 8,
    padding: "9px 12px", marginBottom: 12,
  },
  gaugePanel: {
    display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10,
    padding: "14px 16px", marginBottom: 16,
  },
  lights: { display: "flex", gap: 5 },
  gaugeText: { display: "flex", alignItems: "baseline" },
  confirmRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" },
  grid: { display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" },
  formPanel: {
    background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 16,
    position: "sticky", top: 16,
  },
  listCol: { display: "flex", flexDirection: "column", gap: 16 },
  listPanel: { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 },
  panelBlock: { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 },
  panelTitle: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, marginBottom: 10, letterSpacing: "0.02em" },
  monthNav: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  label: { display: "block", fontSize: 11, color: "var(--muted)", marginTop: 10, marginBottom: 4 },
  input: {
    width: "100%", background: "var(--panel-alt)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "8px 9px", color: "var(--text)", fontSize: 16, boxSizing: "border-box",
  },
  textarea: {
    width: "100%", background: "var(--panel-alt)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "8px 9px", color: "var(--text)", fontSize: 16, boxSizing: "border-box",
    fontFamily: "var(--mono)", resize: "vertical",
  },
  inlineInput: {
    background: "var(--panel-alt)", border: "1px solid var(--border)", borderRadius: 5,
    padding: "5px 7px", color: "var(--text)", fontSize: 16, flex: 1, minWidth: 90,
  },
  primaryBtn: {
    marginTop: 14, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "var(--amber)", color: "#1B1D21", border: "none", borderRadius: 7,
    padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer",
  },
  hint: { fontSize: 11, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 },
  emptyState: { fontSize: 12, color: "var(--muted)", padding: "6px 0", display: "flex", alignItems: "center" },
  row: { borderTop: "1px solid var(--border)", padding: "10px 0" },
  rowMain: { display: "flex", alignItems: "center", gap: 8 },
  moveCol: { display: "flex", flexDirection: "column", gap: 2 },
  rowName: { fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  countBadge: {
    fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--amber)",
    background: "var(--amber-dim)", borderRadius: 4, padding: "1px 6px",
  },
  shortBadge: {
    fontSize: 10, color: "var(--red)", border: "1px solid var(--red)", borderRadius: 4, padding: "1px 6px",
  },
  rowActions: { display: "flex", gap: 2 },
  visitorBox: {
    marginTop: 8, marginLeft: 26, padding: "8px 10px", background: "var(--panel-alt)",
    borderRadius: 7, display: "flex", flexDirection: "column", gap: 6,
  },
  visitorRow: { display: "flex", alignItems: "center", gap: 10 },
  visitorAdd: { display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" },
  dataTable: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", borderBottom: "1px solid var(--border)", padding: "6px 8px", fontSize: 11.5, color: "var(--muted)" },
  td: { borderBottom: "1px solid var(--border)", padding: "8px 8px", fontSize: 13 },
  tdDetail: { borderBottom: "1px solid var(--border)", padding: "10px 8px 14px 26px", background: "var(--panel-alt)" },
  detailLabel: { fontSize: 11, color: "var(--green)", marginBottom: 6, fontWeight: 700 },
  detailChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    fontSize: 11.5, border: "1px solid var(--border)", borderRadius: 999,
    padding: "3px 10px", color: "var(--text)", fontFamily: "var(--mono)",
  },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12,
    padding: 18, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto",
  },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  previewBox: { marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10 },
  nudgeList: { fontSize: 13, lineHeight: 1.9, paddingLeft: 18, color: "var(--amber)" },
};

const baseCss = `
  :root {
    --bg: #1B1D21;
    --panel: #232629;
    --panel-alt: #2A2E33;
    --border: #34383E;
    --text: #ECEDEF;
    --muted: #9098A0;
    --amber: #E8A33D;
    --amber-dim: #4A3F2A;
    --green: #5FA777;
    --red: #D96C4D;
    --display: 'Space Grotesk', 'Inter', sans-serif;
    --body: 'Inter', system-ui, sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, monospace;
  }
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');

  .iconbtn {
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--panel-alt); border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; width: 26px; height: 26px; cursor: pointer;
  }
  .iconbtn:hover { border-color: var(--amber); }
  .iconbtn:disabled { opacity: 0.3; cursor: default; }
  .iconbtn.tiny { width: 18px; height: 18px; }
  .iconbtn.danger:hover { border-color: var(--red); color: var(--red); }

  .ghostbtn {
    display: inline-flex; align-items: center; gap: 5px;
    background: transparent; border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer;
  }
  .ghostbtn:hover { border-color: var(--amber); color: var(--amber); }
  .ghostbtn.danger:hover { border-color: var(--red); color: var(--red); }

  .tabbtn {
    display: inline-flex; align-items: center; gap: 5px;
    background: transparent; border: 1px solid var(--border); color: var(--muted);
    border-radius: 6px; padding: 6px 11px; font-size: 12.5px; cursor: pointer;
  }
  .tabbtn:hover { color: var(--text); }
  .tabbtn.active { color: #1B1D21; background: var(--amber); border-color: var(--amber); font-weight: 700; }

  .clickable-row { cursor: pointer; }
  .clickable-row:hover td { background: var(--panel-alt); }

  .light {
    width: 14px; height: 14px; border-radius: 50%;
    background: #3A3E44; border: 1px solid var(--border);
    transition: background 0.2s;
  }
  .light.lit { background: var(--amber); box-shadow: 0 0 6px var(--amber); border-color: var(--amber); }

  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--amber) !important; }

  @media (max-width: 720px) {
    .tc-grid { grid-template-columns: 1fr !important; }
    input, select, textarea { font-size: 16px !important; }
  }
`;
