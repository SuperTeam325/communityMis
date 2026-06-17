(function () {
  const routeId = document.body?.dataset.routeId || document.documentElement?.dataset.routeId;
  if (routeId === "ai-assistant" || window.__NEIGHBOR_ROUTE__) {
    return;
  }
  if (document.body?.dataset.staticAiAssistantBound === "true") {
    return;
  }
  document.body.dataset.staticAiAssistantBound = "true";

  let currentScene = "all";
  let isProcessing = false;

  const gearIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  const userIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  const aiResponses = {
    "我想找一个信用高、今天发布的电脑维修需求": {
      text: "根据你的需求，我为你筛选了以下条件：",
      type: "filter",
      tags: ["关键词=电脑维修", "信用分>=4.5", "发布时间=今天", "状态=待接单"],
      resultCount: 3
    },
    "帮我筛选近期发布且信用较高的需求": {
      text: "我会优先筛选近期发布、信用评价较高、仍可接单的需求。",
      type: "filter",
      tags: ["发布时间=近3天", "信用分>=4.5", "状态=待接单"],
      resultCount: 8
    },
    "如何发起纠纷？需要什么条件？": {
      text: "发起纠纷前，请先确认订单状态和证据是否完整：",
      type: "rules",
      rules: ["订单处于进行中、待确认或结算相关状态。", "保留聊天记录、现场照片、服务凭证等材料。", "优先与对方沟通，无法协商时再提交平台处理。"],
      footer: "AI 回答仅供参考，最终以平台规则和人工处理结论为准。"
    },
    "我的时间币为什么被冻结了？": {
      text: "时间币通常会在订单进行、纠纷处理或异常风控时暂时冻结。",
      type: "rules",
      rules: ["接单后，相关时间币会进入冻结状态，待双方确认后释放。", "发生纠纷时，冻结会延长至处理完成。", "如果触发异常风控，需要等待平台复核。"],
      footer: "你可以在钱包的冻结明细中查看具体来源。"
    },
    "帮我写一段发布代取快递任务的描述": {
      text: "下面是一版可直接调整的发布草稿：",
      type: "draft",
      draftTitle: "代取快递并送到楼下",
      draftBody: "希望今天 18:00 前帮忙到菜鸟驿站代取 2 件快递，送到 3 号楼大厅。快递不重，请取件后拍照确认，交付时当面核对。",
      draftTags: ["跑腿代取", "当日完成", "校内/社区"],
      draftReward: "10-15 时间币"
    },
    default: {
      text: "好的，让我帮你梳理一下相关信息：",
      type: "default",
      response: "我目前可以帮你解答平台规则相关问题、辅助筛选需求大厅的任务、帮忙生成发布文案草稿。\n\n你可以尝试问我：\n· 如何评价已完成订单？\n· 找一个今天发布的宠物照看需求\n· 发布一则社区活动通知应该怎么写\n· 陪审投票有什么作用？"
    }
  };

  function autoResize(el) {
    el.style.height = "";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  }
  window.autoResize = autoResize;

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function getResponse(query) {
    const q = query.trim();
    for (const [key, response] of Object.entries(aiResponses)) {
      if (key !== "default" && (q.includes(key) || key.includes(q))) {
        return response;
      }
    }
    return aiResponses.default;
  }

  function buildMsgHTML(role, content) {
    return `
      <div class="ai-msg ${role}">
        <div class="msg-avatar">${role === "user" ? userIcon : gearIcon}</div>
        <div class="msg-content"><div class="msg-bubble">${escapeHtml(content).replace(/\n/g, "<br>")}</div></div>
      </div>`;
  }

  function buildAIResponseHTML(response) {
    let html = `<div class="ai-msg assistant">
      <div class="msg-avatar">${gearIcon}</div>
      <div class="msg-content">
        <div class="msg-bubble">
          <p>${escapeHtml(response.text)}</p>`;

    if (response.type === "filter") {
      html += `<div class="apply-filter-card">
        <div class="filter-tags">${response.tags.map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <button class="apply-filter-btn" type="button" data-ai-action="apply-filter">查看匹配结果（${escapeHtml(response.resultCount)} 个任务）</button>
      </div>`;
    } else if (response.type === "rules" && response.rules) {
      html += `<ul style="margin-top:var(--space-md);list-style:none;font-size:13px;line-height:1.8;">${response.rules.map((rule) => `<li style="padding-left:var(--space-md);position:relative;"><span style="position:absolute;left:0;color:var(--secondary);">·</span>${escapeHtml(rule)}</li>`).join("")}</ul>`;
      if (response.footer) {
        html += `<p style="margin-top:var(--space-md);font-size:12px;color:var(--muted);">${escapeHtml(response.footer)}</p>`;
      }
    } else if (response.type === "draft") {
      html += `<div class="draft-card">
        <div class="draft-title">${escapeHtml(response.draftTitle)}</div>
        <div class="draft-body">${escapeHtml(response.draftBody)}</div>
        <div class="draft-tags">
          ${response.draftTags.map((tag) => `<span class="filter-tag" style="background:var(--accent-subtle);color:var(--accent);">${escapeHtml(tag)}</span>`).join("")}
          <span class="filter-tag" style="background:var(--warning-light);color:var(--warning);">悬赏 ${escapeHtml(response.draftReward)}</span>
        </div>
        <div class="draft-actions">
          <button class="btn btn--primary btn--sm" type="button" data-ai-action="apply-draft">确认并填入发布表单</button>
          <button class="btn btn--ghost btn--sm" type="button" data-ai-action="regenerate-draft">重新生成</button>
        </div>
      </div>`;
    } else if (response.response) {
      html += `<p style="white-space:pre-line;">${escapeHtml(response.response)}</p>`;
    }

    html += `</div>
        <div class="msg-actions">
          <button class="msg-btn" type="button" data-ai-action="copy">复制</button>
          <button class="msg-btn" type="button" data-ai-action="feedback" data-feedback="useful">有用</button>
          <button class="msg-btn" type="button" data-ai-action="feedback" data-feedback="useless">没用</button>
        </div>
      </div>
    </div>`;
    return html;
  }

  function showTyping() {
    const chatArea = document.getElementById("chat-area");
    chatArea?.insertAdjacentHTML("beforeend", '<div class="typing-indicator" id="typing-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  }

  function hideTyping() {
    document.getElementById("typing-dots")?.remove();
  }

  function sendMessage() {
    const input = document.getElementById("ai-input");
    const sendButton = document.getElementById("send-btn");
    const chatArea = document.getElementById("chat-area");
    const query = input?.value.trim() ?? "";
    if (!query || isProcessing || !input || !sendButton || !chatArea) {
      return;
    }
    isProcessing = true;
    sendButton.disabled = true;
    document.getElementById("welcome-section")?.remove();
    chatArea.insertAdjacentHTML("beforeend", buildMsgHTML("user", query));
    input.value = "";
    input.style.height = "";
    chatArea.scrollTop = chatArea.scrollHeight;
    setTimeout(() => {
      showTyping();
      setTimeout(() => {
        hideTyping();
        chatArea.insertAdjacentHTML("beforeend", buildAIResponseHTML(getResponse(query)));
        chatArea.scrollTop = chatArea.scrollHeight;
        isProcessing = false;
        sendButton.disabled = false;
      }, 600);
    }, 150);
  }

  function bindSuggestedQuestions(scope = document) {
    scope.querySelectorAll(".sq-btn").forEach((button) => {
      if (button.dataset.staticAiBound === "true") {
        return;
      }
      button.dataset.staticAiBound = "true";
      button.addEventListener("click", () => {
        const input = document.getElementById("ai-input");
        if (input) {
          input.value = button.dataset.question || button.textContent.trim();
          sendMessage();
        }
      });
    });
  }

  function resetChat() {
    const chatArea = document.getElementById("chat-area");
    if (!chatArea) return;
    chatArea.innerHTML = `
      <div class="ai-welcome" id="welcome-section">
        <div class="welcome-icon">${gearIcon.replaceAll('width="14"', 'width="36"').replaceAll('height="14"', 'height="36"')}</div>
        <h2>你好，我是邻帮 AI 助手</h2>
        <p>我可以帮你查找服务、解答规则、筛选需求，以及辅助发布内容。我不能替你做关键操作，最终决定权在你手中。</p>
        <div class="suggested-qs">
          <div class="sq-label">试试问我</div>
          <div class="sq-grid">
            <button class="sq-btn" data-question="我想找一个信用高、今天发布的电脑维修需求"><span class="sq-text">我想找一个信用高、今天发布的电脑维修需求</span></button>
            <button class="sq-btn" data-question="如何发起纠纷？需要什么条件？"><span class="sq-text">如何发起纠纷？需要什么条件？</span></button>
            <button class="sq-btn" data-question="我的时间币为什么被冻结了？"><span class="sq-text">我的时间币为什么被冻结了？</span></button>
            <button class="sq-btn" data-question="帮我写一段发布代取快递任务的描述"><span class="sq-text">帮我写一段发布代取快递任务的描述</span></button>
          </div>
        </div>
      </div>`;
    bindSuggestedQuestions(chatArea);
  }

  document.querySelectorAll(".scene-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".scene-chip").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      currentScene = chip.dataset.scene || "all";
      const placeholders = {
        all: "输入你的问题…",
        filter: "描述你想找的真实需求…",
        publish: "简单描述你要发布的内容…",
        rules: "询问平台规则…",
        summary: "选择一个订单或纠纷，我将为你生成摘要…"
      };
      const input = document.getElementById("ai-input");
      if (input) {
        input.placeholder = placeholders[currentScene] || placeholders.all;
        input.focus();
      }
    });
  });

  document.getElementById("ai-input")?.addEventListener("input", (event) => autoResize(event.currentTarget));
  document.getElementById("send-btn")?.addEventListener("click", sendMessage);
  document.getElementById("ai-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  document.getElementById("new-chat-btn")?.addEventListener("click", resetChat);

  const histPanel = document.getElementById("hist-panel");
  const histOverlay = document.getElementById("hist-overlay");
  const closeHist = () => {
    histPanel?.classList.remove("open");
    histOverlay?.classList.remove("open");
  };
  document.getElementById("hist-btn")?.addEventListener("click", () => {
    histPanel?.classList.add("open");
    histOverlay?.classList.add("open");
  });
  document.getElementById("close-hist-btn")?.addEventListener("click", closeHist);
  histOverlay?.addEventListener("click", closeHist);

  document.getElementById("chat-area")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-ai-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.aiAction;
    if (action === "apply-filter") {
      window.location.href = "tasks.html?aiFilter=true";
    } else if (action === "apply-draft") {
      window.location.href = "post.html?aiDraft=true";
    } else if (action === "regenerate-draft") {
      showTyping();
      setTimeout(() => {
        hideTyping();
        const chatArea = document.getElementById("chat-area");
        chatArea?.insertAdjacentHTML("beforeend", buildAIResponseHTML(getResponse("帮我写一段发布代取快递任务的描述")));
        if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
      }, 600);
    } else if (action === "copy") {
      const text = actionButton.closest(".ai-msg")?.querySelector(".msg-bubble")?.textContent.trim() || "";
      navigator.clipboard?.writeText(text);
      actionButton.textContent = "已复制";
      actionButton.classList.add("feedback-active");
      setTimeout(() => {
        actionButton.textContent = "复制";
        actionButton.classList.remove("feedback-active");
      }, 1600);
    } else if (action === "feedback") {
      actionButton.parentElement?.querySelectorAll(".msg-btn").forEach((button) => button.classList.remove("feedback-active"));
      actionButton.classList.add("feedback-active");
      actionButton.textContent = actionButton.dataset.feedback === "useful" ? "已反馈 · 有用" : "已反馈 · 没用";
    }
  });

  bindSuggestedQuestions();
})();
