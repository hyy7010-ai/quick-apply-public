const jobs = [
  { id:"productOps", title:"产品运营实习生", company:"小红书", logo:"RED", color:"orange", location:"上海 · 实习 · 2027 届", score:89, deadline:"截止 8/27", status:"待官网注册", application:true, reason:"你的用户研究与活动复盘经历，覆盖了岗位的 7/8 项核心要求。", detail:["用户研究负责人经历，与内容洞察要求高度相关","具备活动漏斗分析基础，可迁移至增长与运营场景","需要在官网完成首次注册与身份验证"] },
  { id:"growth", title:"增长运营实习生", company:"Keep", logo:"K", color:"purple", location:"北京 / 上海 · 实习", score:84, deadline:"截止 8/30", status:"准备中", application:true, reason:"你的数据分析证书和校园增长项目，能直接支持岗位需要的转化分析能力。", detail:["数据分析证书与岗位的数据要求匹配","已有增长项目经验，可突出漏斗分析结果","投递前请确认每周实习时间安排"] },
  { id:"market", title:"用户研究助理", company:"得物", logo:"DW", color:"green", location:"上海 · 实习 · 可转正", score:78, deadline:"截止 9/03", status:"已投递", application:true, reason:"研究方法和访谈经历是优势，但需要补充对潮流消费领域的理解。", detail:["已有 30+ 用户访谈经验，可作为核心申请证据","行业动机需要根据岗位补充真实表达","通过企业官网申请，暂未发现限投限制"] },
  { id:"strategy", title:"商业分析实习生", company:"美团", logo:"M", color:"orange", location:"上海 · 实习", score:73, deadline:"截止 9/08", status:"", application:false, reason:"数据基础匹配，但岗位偏商业策略；建议先确认 Excel 与 SQL 的硬性要求。", detail:["数据分析证书是正向匹配证据","工作内容偏策略分析，建议先确认兴趣","可强调校园项目中的决策建议"] },
  { id:"community", title:"社区运营实习生", company:"Bilibili", logo:"B", color:"purple", location:"上海 · 实习", score:70, deadline:"截止 9/12", status:"", application:false, reason:"用户洞察能力有基础，岗位更看重社区内容感知和创作经验。", detail:["已具备用户研究基础","建议补充对社区产品的长期观察","需要上传内容运营定制简历"] }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const activeStages = ["流程中", "测评与笔试", "面试"];
const resultStages = ["Offer", "未通过", "已撤回"];
let applications = safelyRead("fastresume-applications", jobs.filter(job => job.application).map(job => ({...job})));
let toastTimer;

function safelyRead(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function logo(job) { return `<span class="company-logo ${job.color}">${job.logo}</span>`; }
function findJob(id) { return jobs.find(job => job.id === id) || applications.find(job => job.id === id); }
function persistApplications() { localStorage.setItem("fastresume-applications", JSON.stringify(applications)); }

function jobMarkup(job) {
  return `<article class="job-card">${logo(job)}<div class="job-main"><h3>${job.title}</h3><p>${job.company} · ${job.location}</p><div class="job-reason">${job.reason}</div><div class="job-location">官网岗位路径 · ${job.deadline}</div></div><div class="job-side"><span class="match-score">${job.score}%</span><button class="job-arrow" data-job="${job.id}" aria-label="查看 ${job.title}">→</button></div></article>`;
}

function renderJobs() {
  const full = $("#allJobList");
  if (full) full.innerHTML = jobs.map(jobMarkup).join("");
}

function taskAction(status) {
  if (status === "准备中") return "开始官网投递";
  if (status === "待官网注册") return "我已完成注册";
  if (status === "待官网提交") return "我已在官网提交";
  if (activeStages.includes(status)) return "更新流程结果";
  return "查看投递记录";
}

function applicationCard(job) {
  const tag = ["待官网注册", "待官网提交"].includes(job.status) ? "pending" : activeStages.includes(job.status) ? "process" : resultStages.includes(job.status) ? "result" : "";
  return `<article class="application-card"><div class="card-top">${logo(job)}<span class="task-status ${tag}">${job.status}</span></div><h3>${job.title}</h3><p>${job.company}</p><footer><span class="deadline">${job.deadline}</span><span class="match-score">${job.score}%</span></footer><button data-job="${job.id}">${taskAction(job.status)}</button></article>`;
}

function renderApplications() {
  const columns = [
    { selector:'[data-status="准备中"]', statuses:["准备中"] },
    { selector:'[data-status-group="待官网操作"]', statuses:["待官网注册", "待官网提交"] },
    { selector:'[data-status="已投递"]', statuses:["已投递"] },
    { selector:'[data-status-group="流程中"]', statuses:activeStages },
    { selector:'[data-status-group="结果"]', statuses:resultStages }
  ];
  columns.forEach(({selector, statuses}) => {
    const container = $(selector);
    if (!container) return;
    const list = applications.filter(item => statuses.includes(item.status));
    container.innerHTML = list.length ? list.map(applicationCard).join("") : '<p class="empty-column">暂时没有任务</p>';
  });
  const counts = {
    applicationCount: applications.length,
    prepCount: applications.filter(item => item.status === "准备中").length,
    registerCount: applications.filter(item => ["待官网注册", "待官网提交"].includes(item.status)).length,
    appliedCount: applications.filter(item => item.status === "已投递").length,
    processCount: applications.filter(item => activeStages.includes(item.status)).length,
    resultCount: applications.filter(item => resultStages.includes(item.status)).length
  };
  Object.entries(counts).forEach(([id, value]) => { const element = $(`#${id}`); if (element) element.textContent = value; });
  persistApplications();
  renderOverviewTasks();
}

function stageClass(status) {
  if (status === "已投递") return "green";
  if (activeStages.includes(status)) return "violet";
  return "";
}

function nextStep(status) {
  const copy = { "准备中":"准备申请包", "待官网注册":"完成官网注册", "待官网提交":"在官网最终提交", "已投递":"等待回执或测评", "测评与笔试":"完成本轮测评", "面试":"准备下一轮面试", "Offer":"核对 Offer 条款", "未通过":"复盘材料", "已撤回":"归档记录" };
  return copy[status] || "查看记录";
}

function renderOverviewTasks() {
  const root = $("#overviewTaskRows");
  if (!root) return;
  root.innerHTML = applications.slice(0, 3).map(job => `<div class="overview-row"><div><b>${job.company} · ${job.title}</b><small>${job.deadline}</small></div><span><i class="mini-stage ${stageClass(job.status)}">${job.status}</i></span><small>${nextStep(job.status)}</small></div>`).join("");
}

function openJobModal(id) {
  const job = findJob(id);
  if (!job) return;
  const application = applications.find(item => item.id === id);
  const primary = !application || application.status === "准备中" ? "创建官网投递任务" : application.status === "待官网注册" ? "我已完成官网注册" : application.status === "待官网提交" ? "我已在官网提交" : "查看投递记录";
  const stageUpdate = application && !["准备中", "待官网注册", "待官网提交"].includes(application.status)
    ? `<div class="modal-section progress-update"><h3>更新当前流程</h3><p>只有你确认后才会改变记录状态。</p><div class="progress-controls"><select id="stageSelect" aria-label="当前投递进度"><option value="已投递" ${application.status === "已投递" ? "selected" : ""}>已投递（等待结果）</option><option value="测评与笔试" ${application.status === "测评与笔试" ? "selected" : ""}>测评与笔试</option><option value="面试" ${application.status === "面试" || application.status === "流程中" ? "selected" : ""}>面试</option><option value="Offer" ${application.status === "Offer" ? "selected" : ""}>收到 Offer</option><option value="未通过" ${application.status === "未通过" ? "selected" : ""}>未通过</option><option value="已撤回" ${application.status === "已撤回" ? "selected" : ""}>已撤回</option></select><button class="outline-button" id="saveStage">保存进度</button></div></div>`
    : "";
  $("#modalContent").innerHTML = `<div class="modal-company">${logo(job)}<div><strong>${job.company}</strong><p>企业官网岗位 · 演示数据</p></div></div><h2 id="modalTitle">${job.title}</h2><p class="modal-location">${job.location} · ${job.deadline}</p><div class="modal-score"><b>${job.score}%</b><span><strong>Strong Match</strong><br />这是岗位要求匹配度，不是录取概率。</span></div><div class="modal-section"><h3>为什么建议你看这个岗位</h3><ul>${job.detail.map(point => `<li>${point}</li>`).join("")}</ul></div><div class="modal-section"><h3>官方投递路径</h3><div class="apply-path"><span class="num">1</span>打开企业官网具体岗位链接</div><div class="apply-path"><span class="num">2</span>在自己的浏览器完成注册、登录和验证码</div><div class="apply-path"><span class="num">3</span>由你在官网最终提交；系统不会因打开链接误记为已投递</div></div>${stageUpdate}<div class="modal-actions"><button class="outline-button" id="saveJob">${application ? "已加入任务" : "先加入任务"}</button><button class="primary-button" id="applyJob">${primary} <span>→</span></button></div>`;
  $("#jobModal").classList.add("open");
  $("#jobModal").setAttribute("aria-hidden", "false");
  $("#saveJob").addEventListener("click", () => saveJob(job));
  $("#applyJob").addEventListener("click", () => advanceApply(job));
  const saveStage = $("#saveStage");
  if (saveStage) saveStage.addEventListener("click", () => updateStage(job.id, $("#stageSelect").value));
}

function closeModal() { $("#jobModal").classList.remove("open"); $("#jobModal").setAttribute("aria-hidden", "true"); }

function saveJob(job) {
  if (applications.some(item => item.id === job.id)) { showToast("这个岗位已经在投递任务中。"); return; }
  applications.push({...job, status:"准备中"});
  renderApplications();
  showToast("已加入投递任务。先准备申请材料。");
}

function advanceApply(job) {
  const application = applications.find(item => item.id === job.id);
  if (!application) {
    applications.push({...job, status:"待官网注册"});
    showToast("已创建官网投递任务。请在官网完成注册后回来确认。");
  } else if (application.status === "准备中") {
    application.status = "待官网注册";
    showToast("已记录为待官网注册。请在官方页面完成注册。");
  } else if (application.status === "待官网注册") {
    application.status = "待官网提交";
    showToast("已记录注册完成。请核对材料并在官网最终提交。");
  } else if (application.status === "待官网提交") {
    application.status = "已投递";
    showToast("已按你的确认标记为“已投递”。");
  } else showToast("该任务已在追踪中，可更新后续进展。");
  renderApplications();
  closeModal();
}

function updateStage(id, status) {
  const application = applications.find(item => item.id === id);
  if (!application) return;
  application.status = status;
  application.updatedAt = new Date().toISOString();
  renderApplications();
  closeModal();
  showToast(`已按你的确认更新为“${status}”。`);
}

function saveProfile() {
  const form = $("#profileForm");
  if (!form) return;
  localStorage.setItem("fastresume-profile", JSON.stringify(Object.fromEntries(new FormData(form).entries())));
  showToast("档案已保存在当前浏览器。演示版请勿填写真实敏感信息。");
}

function restoreProfile() {
  const form = $("#profileForm");
  if (!form) return;
  const saved = safelyRead("fastresume-profile", {});
  Object.entries(saved).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field && typeof value === "string") field.value = value; });
}

function switchView(id) {
  $$(".view").forEach(view => view.classList.toggle("active-view", view.id === id));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === id));
  const labels = {home:"今天是 8 月 24 日，星期一", jobs:"岗位机会", applications:"投递任务", profile:"职业档案"};
  const breadcrumb = $("#breadcrumb");
  if (breadcrumb) breadcrumb.textContent = labels[id] || "FastResume";
  window.scrollTo({top:0, behavior:"smooth"});
  $(".sidebar").classList.remove("open");
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem("fastresume-theme", theme);
  $$('[data-theme-choice]').forEach(button => button.classList.toggle("active", button.dataset.themeChoice === theme));
}

function setupTheme() {
  const legacyThemes = { professional:"minimal", dark:"business", soft:"cute" };
  const storedTheme = localStorage.getItem("fastresume-theme");
  const theme = legacyThemes[storedTheme] || storedTheme || "minimal";
  applyTheme(theme);
  $("#themeTrigger").addEventListener("click", event => { event.stopPropagation(); const menu = $("#themeMenu"); menu.hidden = !menu.hidden; $("#themeTrigger").setAttribute("aria-expanded", String(!menu.hidden)); });
  $$('[data-theme-choice]').forEach(button => button.addEventListener("click", () => { applyTheme(button.dataset.themeChoice); $("#themeMenu").hidden = true; showToast("主题已切换并保存在当前浏览器。"); }));
}

function setupCheckin() {
  const button = $("#checkinButton");
  const title = $("#checkinTitle");
  if (!button || !title) return;
  const render = () => { const isDone = localStorage.getItem("fastresume-checkin") === "done"; button.textContent = isDone ? "今日已打卡 ✓" : "完成筛选并打卡"; button.classList.toggle("complete", isDone); if (isDone) title.textContent = "今天已完成有效筛选"; };
  render();
  button.addEventListener("click", () => {
    if (localStorage.getItem("fastresume-checkin") === "done") { openCelebration(); return; }
    localStorage.setItem("fastresume-checkin", "done");
    button.animate([{transform:"scale(1)"},{transform:"scale(1.08)",boxShadow:"0 0 0 7px rgba(51,140,85,.16)"},{transform:"scale(1)"}], {duration:520, easing:"ease-out"});
    render();
    setTimeout(openCelebration, 260);
  });
}

function openCelebration() {
  const modal = $("#celebrationModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeCelebration() {
  const modal = $("#celebrationModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function bindEvents() {
  document.addEventListener("click", event => {
    if (!event.target.closest(".theme-menu") && !event.target.closest("#themeTrigger")) $("#themeMenu").hidden = true;
    const view = event.target.closest("[data-view]");
    if (view) switchView(view.dataset.view);
    const job = event.target.closest("[data-job]");
    if (job && !job.closest("#jobModal")) openJobModal(job.dataset.job);
    const toast = event.target.closest("[data-toast]");
    if (toast) showToast(toast.dataset.toast);
  });
  $("#closeModal").addEventListener("click", closeModal);
  $("#jobModal").addEventListener("click", event => { if (event.target === $("#jobModal")) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { closeModal(); closeCelebration(); } });
  $("#menuButton").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  $("#saveProfile").addEventListener("click", saveProfile);
  $("#saveProfileBottom").addEventListener("click", saveProfile);
  $("#editProfile").addEventListener("click", () => { $("[name=role]").focus(); showToast("从求职目标开始完善，会让推荐更准确。"); });
  $("#closeCelebration").addEventListener("click", closeCelebration);
  $("#celebrationContinue").addEventListener("click", closeCelebration);
  $("#celebrationModal").addEventListener("click", event => { if (event.target === $("#celebrationModal")) closeCelebration(); });
  $$(".filter-chip").forEach(chip => chip.addEventListener("click", () => { $$(".filter-chip").forEach(item => item.classList.remove("selected")); chip.classList.add("selected"); }));
}

renderJobs();
renderApplications();
restoreProfile();
setupTheme();
setupCheckin();
bindEvents();
