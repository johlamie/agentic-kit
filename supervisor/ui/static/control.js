"use strict";
// Kriton Supervisor — mission control client. Builds every node with createElement;
// never parses markup strings. Read-only: the only "actions" copy a command to the clipboard.
(() => {
  /** Lucide icons (ISC), as element specs. */
  const ICONS = {"layout-dashboard":[["rect",{"width":"7","height":"9","x":"3","y":"3","rx":"1"}],["rect",{"width":"7","height":"5","x":"14","y":"3","rx":"1"}],["rect",{"width":"7","height":"9","x":"14","y":"12","rx":"1"}],["rect",{"width":"7","height":"5","x":"3","y":"16","rx":"1"}]],"inbox":[["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}]],"octagon-alert":[["path",{"d":"M12 16h.01"}],["path",{"d":"M12 8v4"}],["path",{"d":"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"}]],"activity":[["path",{"d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]],"target":[["circle",{"cx":"12","cy":"12","r":"10"}],["circle",{"cx":"12","cy":"12","r":"6"}],["circle",{"cx":"12","cy":"12","r":"2"}]],"flag":[["path",{"d":"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"}]],"shield-check":[["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]],"history":[["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{"d":"M3 3v5h5"}],["path",{"d":"M12 7v5l4 2"}]],"folder":[["path",{"d":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}]],"folders":[["path",{"d":"M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z"}],["path",{"d":"M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1"}]],"chevron-right":[["path",{"d":"m9 18 6-6-6-6"}]],"copy":[["rect",{"width":"14","height":"14","x":"8","y":"8","rx":"2","ry":"2"}],["path",{"d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]],"check":[["path",{"d":"M20 6 9 17l-5-5"}]],"menu":[["path",{"d":"M4 5h16"}],["path",{"d":"M4 12h16"}],["path",{"d":"M4 19h16"}]],"x":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"circle-dot":[["circle",{"cx":"12","cy":"12","r":"1"}],["circle",{"cx":"12","cy":"12","r":"10"}]],"triangle-alert":[["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]],"git-branch":[["path",{"d":"M15 6a9 9 0 0 0-9 9V3"}],["circle",{"cx":"18","cy":"6","r":"3"}],["circle",{"cx":"6","cy":"18","r":"3"}]],"x-circle":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m15 9-6 6"}],["path",{"d":"m9 9 6 6"}]],"hourglass":[["path",{"d":"M5 22h14"}],["path",{"d":"M5 2h14"}],["path",{"d":"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"}],["path",{"d":"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"}]],"bot":[["path",{"d":"M12 8V4H8"}],["rect",{"width":"16","height":"12","x":"4","y":"8","rx":"2"}],["path",{"d":"M2 14h2"}],["path",{"d":"M20 14h2"}],["path",{"d":"M15 13v2"}],["path",{"d":"M9 13v2"}]],"external-link":[["path",{"d":"M15 3h6v6"}],["path",{"d":"M10 14 21 3"}],["path",{"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]]};
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SUMMARY_URL = "/_supervisor/api/control/summary";
  const STREAM_URL = "/_supervisor/api/control/stream";
  const POLL_MS = 5_000;

  const STATE_LABELS = {
    waiting: ["À toi", "human"],
    blocked: ["Bloquée", "block"],
    running: ["En cours", "info"],
    done: ["Terminée", "pass"],
    paused: ["En pause", "muted"],
    none: ["Sans mission", "muted"],
  };
  const KIND_LABELS = {
    claude: "Claude Code",
    gate: "Porte",
    block: "Audit bloquant",
    queued: "En file",
    mission: "Mission",
    grant: "Autorisation",
  };
  const ROUTES = ["overview", "attente", "bloques", "runs", "missions", "portes", "audits", "activite", "projets", "projet"];

  const state = { snapshot: null, failures: 0, live: "waiting", lastError: null, filter: "all", source: null, poll: null };

  // ---------- DOM helpers ----------
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else if (key === "href") node.href = value;
        else if (key === "hidden") node.hidden = true;
        else node.setAttribute(key, value === true ? "" : String(value));
      }
    }
    for (const child of children || []) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function icon(name, extra) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", `icon${extra ? ` ${extra}` : ""}`);
    for (const [tag, attrs] of ICONS[name] || []) {
      const part = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
      svg.appendChild(part);
    }
    return svg;
  }

  function replace(node, children) {
    while (node.firstChild) node.removeChild(node.firstChild);
    for (const child of children) if (child) node.appendChild(child);
  }

  // ---------- formatting ----------
  function minutesSince(at) {
    const time = Date.parse(at || "");
    return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 60_000)) : null;
  }

  function ago(at, prefix) {
    const minutes = minutesSince(at);
    if (minutes === null) return "—";
    const lead = prefix || "il y a";
    if (minutes < 1) return lead === "depuis" ? "depuis moins d’une minute" : "à l’instant";
    if (minutes < 60) return `${lead} ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${lead} ${hours} h`;
    const days = Math.floor(hours / 24);
    return `${lead} ${days} j`;
  }

  function clock(at) {
    const date = new Date(at || "");
    if (Number.isNaN(date.getTime())) return "—";
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
      ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  function plural(count, one, many) {
    return `${count} ${count > 1 ? many : one}`;
  }

  function projectHref(key) {
    return `#/projet/${encodeURIComponent(key)}`;
  }

  function stateTag(stateName) {
    const [label, tone] = STATE_LABELS[stateName] || STATE_LABELS.none;
    return el("span", { class: `tag tone--${tone}`, text: label });
  }

  function stateDot(stateName) {
    const tone = (STATE_LABELS[stateName] || STATE_LABELS.none)[1];
    return el("span", { class: `dot tone--${tone}`, "aria-hidden": "true" });
  }

  // ---------- building blocks ----------
  function copyButton(command) {
    const label = el("span", { class: "label", text: "Copier" });
    const button = el("button", { class: "copy", type: "button", "aria-label": `Copier la commande ${command}` }, [icon("copy"), label]);
    button.addEventListener("click", () => {
      const done = () => {
        button.classList.toggle("is-done", true);
        label.textContent = "Copié";
        setTimeout(() => { button.classList.toggle("is-done", false); label.textContent = "Copier"; }, 1_600);
      };
      const fallback = () => {
        const code = button.parentNode && button.parentNode.querySelector("code");
        const selection = window.getSelection && window.getSelection();
        if (code && selection && document.createRange) {
          const range = document.createRange();
          range.selectNodeContents(code);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(command).then(done, fallback);
      else fallback();
    });
    return button;
  }

  function commandRow(command) {
    return el("div", { class: "cmd" }, [el("code", { text: command }), copyButton(command)]);
  }

  function card(title, iconName, options, body) {
    const head = el("div", { class: "card__head" }, [
      iconName ? icon(iconName) : null,
      el("h2", { id: options.id, text: title }),
      options.hint ? el("span", { class: "hint", text: options.hint }) : null,
      options.more ? el("a", { class: "more", href: options.more.href }, [options.more.label, icon("chevron-right")]) : null,
    ]);
    return el("section", { class: `card${options.extra ? ` ${options.extra}` : ""}`, "aria-labelledby": options.id }, [head, ...body]);
  }

  function empty(text) {
    return el("p", { class: "empty", text });
  }

  function actionItem(item, index, projectsByKey) {
    const project = projectsByKey.get(item.projectKey);
    const why = [];
    if (item.unblocks) why.push(el("span", { class: "unblocks", text: item.unblocks }));
    if (item.unblocks && item.why) why.push(" · ");
    if (item.why) why.push(item.why);
    return el("li", { class: `action${index === 0 ? " is-first" : ""}` }, [
      el("span", { class: `prio prio--${item.priority}`, title: `Priorité ${item.priority}`, text: "!" }),
      el("span", { class: "action__title" }, [`${KIND_LABELS[item.kind] || "Action"} · `, item.title]),
      el("span", { class: "action__side" }, [
        project
          ? el("a", { class: "chip", href: projectHref(project.key) }, [icon("folder"), project.name])
          : el("span", { class: "chip" }, [icon("folder"), item.projectName]),
        item.since ? el("span", { class: "age", text: ago(item.since, "depuis") }) : null,
      ]),
      why.length ? el("p", { class: "action__why" }, why) : null,
      item.command ? commandRow(item.command) : null,
    ]);
  }

  function actionList(items, projectsByKey) {
    return el("ol", { class: "actions" }, items.map((item, index) => actionItem(item, index, projectsByKey)));
  }

  function flagList(flags) {
    return el("ul", { class: "flags" }, flags.map((flag) => el("li", { class: `tone--${flag.tone}` }, [
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("a", { href: projectHref(flag.projectKey), text: flag.projectName }),
      ` · ${flag.text}`,
      flag.meta ? el("span", { class: "meta", text: flag.meta }) : null,
    ])));
  }

  function banner(kind, iconName, title, text, flags, id) {
    return el("section", { class: `banner banner--${kind}`, "aria-labelledby": id }, [
      el("div", { class: "banner__head" }, [icon(iconName), el("div", null, [el("h2", { id, text: title }), text ? el("p", { text }) : null])]),
      flags.length ? flagList(flags) : null,
    ]);
  }

  function gatesList(gates, label) {
    const ids = ["G1", "G2", "G3", "G4"];
    const byId = new Map((gates || []).map((gate) => [gate.id, gate]));
    const shown = gates && gates.length ? gates : ids.map((id) => ({ id, status: "pending" }));
    const words = { done: "validée", waiting: "à toi", blocked: "bloquée", pending: "à venir", na: "hors profil" };
    return el("ol", { class: "gates", "aria-label": label || "Portes de la mission" }, (byId.size ? shown : shown).map((gate) =>
      el("li", { class: `gate gate--${gate.status}`, title: `${gate.id} : ${words[gate.status] || gate.status}${gate.decision ? ` — ${gate.decision}` : ""}` }, [
        gate.id, el("span", { class: "sr-only", text: ` ${words[gate.status] || gate.status}` }),
      ])));
  }

  function missionRow(project) {
    const mission = project.mission;
    const slices = project.slicesDeclared
      ? `${project.slices.filter((slice) => /termin|done|intégr|integr/iu.test(slice.status)).length} slices sur ${project.slices.length}`
      : null;
    const line = [mission.phase, slices, mission.nextStep].filter(Boolean).join(" · ");
    return el("li", { class: "mission-row" }, [
      el("div", { class: "row-head" }, [
        el("a", { class: "row-name", href: projectHref(project.key) }, [stateDot(project.state), project.name]),
        stateTag(project.state),
        el("span", { class: "tag tone--muted", text: mission.effectiveProfile }),
      ]),
      gatesList(mission.gates),
      el("p", { class: "row-line", text: line || mission.idea }),
    ]);
  }

  function runRow(run) {
    return el("li", null, [
      el("div", { class: "row-head" }, [
        el("span", { class: `dot tone--${run.silent ? "challenge" : "pass"}`, "aria-hidden": "true" }),
        el("a", { class: "row-name", href: projectHref(run.projectKey), text: run.projectName }),
        el("span", { class: `tag tone--${run.unattended ? "info" : "muted"}`, text: run.unattended ? "sans surveillance" : "interactif" }),
        run.silent ? el("span", { class: "tag tone--challenge", text: "silencieux" }) : null,
      ]),
      el("p", { class: "row-line row-line--meta", text: `${run.tool} · ${ago(run.startedAt, "depuis")} · signal ${ago(run.lastSignalAt)}` }),
      run.agents.length
        ? el("ul", { class: "agents", "aria-label": "Sous-agents actifs" }, run.agents.map((agent) =>
            el("li", null, [el("b", { text: agent.role }), ago(agent.since, "depuis")])))
        : el("p", { class: "row-line", text: run.silent ? "Aucun événement récent : la session attend peut-être une réponse dans le terminal." : "Aucun sous-agent actif." }),
    ]);
  }

  function timeline(items) {
    return el("ol", { class: "timeline" }, items.map((item) => el("li", null, [
      el("time", { datetime: item.at, text: clock(item.at) }),
      el("span", { class: `tag tone--${item.tone}`, text: item.label }),
      el("span", null, [el("b", { text: item.projectName }), ` · ${item.title}`]),
    ])));
  }

  function header(crumbs, title, subtitle) {
    const live = { live: ["en direct", ""], waiting: ["reconnexion…", " live--waiting"], stopped: ["supervision arrêtée", " live--stopped"] }[state.live];
    return el("div", null, [
      el("div", { class: "crumb" }, [
        ...crumbs.flatMap((crumb, index) => [index ? el("span", { "aria-hidden": "true", text: "›" }) : null,
          crumb.href ? el("a", { href: crumb.href, text: crumb.label }) : el("span", { text: crumb.label })]),
        el("span", { class: `live${live[1]}`, text: live[0] }),
      ]),
      el("h1", { tabindex: "-1", text: title }),
      subtitle ? el("p", { class: "subtitle", text: subtitle }) : null,
      state.lastError ? el("p", { class: "error-note", role: "status", text: state.lastError }) : null,
    ]);
  }

  // ---------- pages ----------
  function overview(mc, byKey) {
    const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const missions = mc.projects.filter((project) => project.mission && project.state !== "done");
    const blocks = [
      header([{ label: "Centre de contrôle" }, { label: "tous les projets" }], "Qu’est-ce qui attend ta décision maintenant ?",
        `${today.charAt(0).toUpperCase()}${today.slice(1)} · ${plural(mc.counts.missions, "mission", "missions")}, ${plural(mc.counts.runs, "run en cours", "runs en cours")}`),
      card("Maintenant", "circle-dot", {
        id: "now-title", extra: "card--now",
        hint: mc.waiting.length ? `${Math.min(3, mc.waiting.length)} actions et pourquoi` : null,
        more: mc.waiting.length > 3 ? { href: "#/attente", label: `En attente · ${mc.waiting.length}` } : null,
      }, [mc.waiting.length ? actionList(mc.waiting.slice(0, 3), byKey) : empty("Rien n’attend ta décision. Les missions avancent seules.")]),
    ];
    if (mc.blocked.length) {
      blocks.push(banner("block", "octagon-alert", `Bloqué : ${plural(mc.blocked.length, "mission n’avance", "missions n’avancent")} plus sans toi.`,
        "Le reste du travail continue ; ces missions attendent une décision ou un correctif.", mc.blocked, "blocked-title"));
    }
    if (mc.watch.length) {
      blocks.push(banner("watch", "triangle-alert", `À surveiller : ${plural(mc.watch.length, "point", "points")}.`,
        "Pas encore bloquant. Une mission s’arrête seule à la troisième tentative de réparation.", mc.watch, "watch-title"));
    }
    blocks.push(el("div", { class: "split" }, [
      card("Missions", "target", { id: "missions-title", hint: String(missions.length), more: { href: "#/missions", label: "Tout voir" } },
        [missions.length ? el("ul", { class: "rows" }, missions.slice(0, 6).map(missionRow)) : empty("Aucune mission en cours. Lance-en une avec /mission dans Claude Code.")]),
      card("Runs en cours", "activity", { id: "runs-title", hint: String(mc.runs.length), more: mc.runs.length > 4 ? { href: "#/runs", label: "Tout voir" } : null },
        [mc.runs.length ? el("ul", { class: "rows" }, mc.runs.slice(0, 4).map(runRow)) : empty("Aucune session Claude ou Codex en cours.")]),
    ]));
    blocks.push(card("Activité récente", "history", { id: "activity-title", more: { href: "#/activite", label: "Tout voir" } },
      [mc.activity.length ? timeline(mc.activity.slice(0, 8)) : empty("Aucune activité enregistrée pour l’instant.")]));
    return blocks;
  }

  function waitingPage(mc, byKey) {
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "En attente de toi" }], "En attente de toi",
        mc.waiting.length ? `${plural(mc.waiting.length, "élément", "éléments")}, du plus urgent au plus ancien.` : null),
      card("Tout ce qui attend ta réponse", "inbox", { id: "waiting-title", hint: String(mc.waiting.length) },
        [mc.waiting.length ? actionList(mc.waiting, byKey) : empty("Aucune intervention attendue.")]),
    ];
  }

  function blockedPage(mc) {
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Bloqués" }], "Bloqués et à surveiller", null),
      mc.blocked.length
        ? banner("block", "octagon-alert", `${plural(mc.blocked.length, "mission bloquée", "missions bloquées")}`, "Elles n’avancent plus sans décision ou correctif.", mc.blocked, "blocked-title")
        : card("Bloqués", "octagon-alert", { id: "blocked-title" }, [empty("Aucune mission bloquée.")]),
      mc.watch.length
        ? banner("watch", "triangle-alert", `${plural(mc.watch.length, "point à surveiller", "points à surveiller")}`, null, mc.watch, "watch-title")
        : card("À surveiller", "triangle-alert", { id: "watch-title" }, [empty("Rien à surveiller pour l’instant.")]),
    ];
  }

  function runsPage(mc) {
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Runs en cours" }], "Runs en cours", "Sessions Claude Code et Codex actives, avec leurs sous-agents."),
      card("Runs", "activity", { id: "runs-title", hint: String(mc.runs.length) },
        [mc.runs.length ? el("ul", { class: "rows" }, mc.runs.map(runRow)) : empty("Aucune session en cours.")]),
    ];
  }

  function missionsPage(mc) {
    const missions = mc.projects.filter((project) => project.mission);
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Missions" }], "Missions", `${plural(missions.length, "mission", "missions")}, terminées comprises.`),
      card("Missions", "target", { id: "missions-title", hint: String(missions.length) },
        [missions.length ? el("ul", { class: "rows" }, missions.map(missionRow)) : empty("Aucune mission. Lance-en une avec /mission dans Claude Code.")]),
    ];
  }

  function gatesPage(mc) {
    const missions = mc.projects.filter((project) => project.mission);
    const rows = missions.flatMap((project) => project.mission.gates.map((gate) => el("tr", null, [
      el("td", null, [el("a", { href: projectHref(project.key), text: project.name })]),
      el("td", { class: "mono", text: gate.id }),
      el("td", null, [el("span", { class: `gate gate--${gate.status}`, text: { done: "validée", waiting: "à toi", blocked: "bloquée", pending: "à venir", na: "hors profil" }[gate.status] || gate.status })]),
      el("td", { class: "muted", text: gate.date || "—" }),
      el("td", { text: gate.decision || "—" }),
    ])));
    const decisions = missions.flatMap((project) => project.decisions.slice(-3).map((decision) => el("li", null, [el("b", { text: project.name }), ` · ${decision}`])));
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Portes et décisions" }], "Portes et décisions", null),
      card("Portes", "flag", { id: "gates-title", hint: `${mc.counts.gates} à toi` }, [rows.length
        ? el("div", { class: "table-wrap card__body" }, [el("table", { class: "table" }, [
            el("thead", null, [el("tr", null, ["Projet", "Porte", "Statut", "Date", "Décision"].map((name) => el("th", { scope: "col", text: name })))]),
            el("tbody", null, rows)])])
        : empty("Aucune porte enregistrée.")]),
      card("Dernières décisions", "git-branch", { id: "decisions-title" }, [decisions.length ? el("ul", { class: "list" }, decisions) : empty("Aucune décision enregistrée dans DECISIONS.md.")]),
    ];
  }

  function auditsPage(mc) {
    const rows = mc.audits.map((audit) => el("tr", null, [
      el("td", { class: "mono", text: audit.projectName }),
      el("td", { text: audit.typeLabel }),
      el("td", null, [el("span", { class: `tag tone--${audit.tone}`, text: audit.label })]),
      el("td", { class: "muted", text: clock(audit.at) }),
      el("td", { text: audit.summary || "—" }),
    ]));
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Audits" }], "Audits du Supervisor", "Les contrôles indépendants les plus récents, tous projets confondus."),
      card("Audits", "shield-check", { id: "audits-title", hint: String(mc.audits.length) }, [rows.length
        ? el("div", { class: "table-wrap card__body" }, [el("table", { class: "table" }, [
            el("thead", null, [el("tr", null, ["Projet", "Contrôle", "Verdict", "Date", "Résumé"].map((name) => el("th", { scope: "col", text: name })))]),
            el("tbody", null, rows)])])
        : empty("Aucun audit enregistré.")]),
    ];
  }

  function activityPage(mc) {
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Activité" }], "Activité", "Les derniers événements et verdicts, tous projets confondus."),
      card("Activité", "history", { id: "activity-title" }, [mc.activity.length ? timeline(mc.activity) : empty("Aucune activité enregistrée.")]),
    ];
  }

  const FILTERS = [
    ["all", "Tous", () => true],
    ["waiting", "En attente", (project) => project.state === "waiting"],
    ["running", "En cours", (project) => project.state === "running"],
    ["blocked", "Bloqués", (project) => project.state === "blocked"],
    ["done", "Terminés", (project) => project.state === "done"],
    ["none", "Sans mission", (project) => !project.mission],
  ];

  function portfolioPage(mc) {
    const active = FILTERS.find(([key]) => key === state.filter) || FILTERS[0];
    const filters = el("ul", { class: "filters", "aria-label": "Filtrer les projets" }, FILTERS.map(([key, label, test]) => {
      const button = el("button", { class: "filter", type: "button", "aria-pressed": key === active[0] ? "true" : "false" },
        [label, el("span", { text: String(mc.projects.filter(test).length) })]);
      button.addEventListener("click", () => { state.filter = key; render(); });
      return el("li", null, [button]);
    }));
    const rows = mc.projects.filter(active[2]).map((project) => el("tr", null, [
      el("td", { class: "cell-name" }, [el("a", { href: projectHref(project.key), text: project.name })]),
      el("td", { class: project.mission ? "cell-idea" : "cell-idea muted", text: project.mission ? project.mission.idea : "aucune mission" }),
      el("td", { class: "cell-state" }, [stateTag(project.state)]),
      el("td", { class: "cell-prod" }, [project.production ? el("span", { class: "tag tone--pass", text: "Prod" }) : el("span", { class: "muted", text: "—" })]),
      el("td", { class: "cell-when muted mono", text: project.lastActivityAt ? ago(project.lastActivityAt) : "—" }),
    ]));
    return [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Portefeuille" }], "Portefeuille", `${plural(mc.projects.length, "projet", "projets")} sous ${mc.projectsRoot} et vus par le Supervisor.`),
      card("Projets", "folders", { id: "portfolio-title", hint: String(mc.projects.length) }, [
        filters,
        rows.length
          ? el("div", { class: "table-wrap card__body" }, [el("table", { class: "table table--portfolio" }, [
              el("thead", null, [el("tr", null, ["Projet", "Mission", "État", "Prod", "Activité"].map((name) => el("th", { scope: "col", text: name })))]),
              el("tbody", null, rows)])])
          : empty("Aucun projet pour ce filtre."),
      ]),
    ];
  }

  function projectPage(mc, byKey, key) {
    const project = byKey.get(key);
    if (!project) {
      return [header([{ label: "Centre de contrôle", href: "#/" }, { label: "Projet" }], "Projet introuvable",
        "Ce projet n’apparaît plus dans le portefeuille. Il a peut-être été déplacé."), el("p", null, [el("a", { class: "chip", href: "#/projets", text: "Revenir au portefeuille" })])];
    }
    const mission = project.mission;
    const waiting = mc.waiting.filter((item) => item.projectKey === project.key);
    const runs = mc.runs.filter((run) => run.projectKey === project.key);
    const facts = el("dl", { class: "facts" }, [
      el("dt", { text: "Dossier" }), el("dd", { class: "mono", text: project.displayPath || "hors du dossier personnel" }),
      el("dt", { text: "Profil" }), el("dd", { text: mission ? (mission.requestedProfile === mission.effectiveProfile ? mission.effectiveProfile : `${mission.effectiveProfile} (demandé : ${mission.requestedProfile})`) : "—" }),
      el("dt", { text: "Phase" }), el("dd", { text: mission ? mission.phase : "—" }),
      el("dt", { text: "Prochaine étape" }), el("dd", { text: mission && mission.nextStep ? mission.nextStep : "—" }),
      el("dt", { text: "Production" }), el("dd", { text: project.production ? "oui (listé dans production-projects)" : "non" }),
      el("dt", { text: "Autorisations" }), el("dd", { class: "mono", text: project.grants.length ? project.grants.join(" · ") : "aucune" }),
      el("dt", { text: "Dernier audit" }), el("dd", { text: project.latestAudit ? `${project.latestAudit.typeLabel} — ${project.latestAudit.label}` : "—" }),
    ]);
    const blocks = [
      header([{ label: "Centre de contrôle", href: "#/" }, { label: "Portefeuille", href: "#/projets" }, { label: project.name }],
        project.name, mission ? mission.idea : "Aucune mission en cours dans ce projet."),
      el("div", { class: "row-head" }, [stateTag(project.state), mission ? gatesList(mission.gates) : null,
        project.active && project.slug ? el("a", { class: "chip", href: `/${project.slug}` }, [icon("external-link"), "Fil d’activité détaillé"]) : null]),
    ];
    if (waiting.length) blocks.push(card("En attente de toi", "inbox", { id: "project-waiting", hint: String(waiting.length), extra: "card--now" }, [actionList(waiting, byKey)]));
    blocks.push(card("Mission", "target", { id: "project-mission" }, [facts]));
    const sliceRows = project.slices.map((slice) => el("tr", null, [
      el("td", { class: "cell-name", text: slice.name }),
      el("td", { class: "cell-role muted", text: slice.role || "—" }),
      el("td", { class: "cell-status", text: slice.status || "—" }),
      ...[[slice.reviewer, "Reviewer"], [slice.qa, "QA"], [slice.visual, "Visuel"]].map(([verdict, label]) => el("td", { class: "cell-verdict", "data-label": label }, [verdict
        ? el("span", { class: `tag tone--${/pass|ok|✓/iu.test(verdict) ? "pass" : /fail|block|ko/iu.test(verdict) ? "block" : /challenge/iu.test(verdict) ? "challenge" : "info"}`, text: verdict })
        : el("span", { class: "muted", text: "—" })])),
    ]));
    blocks.push(card("Slices et vérifications", "git-branch", { id: "project-slices", hint: project.slicesDeclared ? String(project.slices.length) : null }, [sliceRows.length
      ? el("div", { class: "table-wrap card__body" }, [el("table", { class: "table table--slices" }, [
          el("thead", null, [el("tr", null, ["Slice", "Rôle", "Statut", "Reviewer", "QA", "Visuel"].map((name) => el("th", { scope: "col", text: name })))]),
          el("tbody", null, sliceRows)])])
      : empty("Slices non renseignées dans ORCHESTRATOR.md.")]));
    if (project.repairLoops.length) {
      blocks.push(card("Boucles de réparation", "triangle-alert", { id: "project-loops" }, [el("ul", { class: "list" }, project.repairLoops.map((loop) =>
        el("li", null, [el("b", { text: `${loop.attempts}/3 ` }), loop.approach, loop.lastFailure ? ` — ${loop.lastFailure}` : ""])))]));
    }
    blocks.push(el("div", { class: "split" }, [
      card("Runs en cours", "activity", { id: "project-runs" }, [runs.length ? el("ul", { class: "rows" }, runs.map(runRow)) : empty("Aucune session en cours.")]),
      card("Définition de terminé", "check", { id: "project-dod" }, [mission && mission.definitionOfDone.length
        ? el("ul", { class: "list" }, mission.definitionOfDone.map((line) => el("li", { text: line })))
        : empty("Non renseignée.")]),
    ]));
    blocks.push(el("div", { class: "split" }, [
      card("Journal de mission", "history", { id: "project-journal" }, [mission && mission.journal.length
        ? el("ul", { class: "list" }, mission.journal.map((line) => el("li", { text: line })))
        : empty("Journal vide.")]),
      card("Dernières décisions", "flag", { id: "project-decisions" }, [project.decisions.length
        ? el("ul", { class: "list" }, project.decisions.map((line) => el("li", { text: line })))
        : empty("Aucune décision enregistrée.")]),
    ]));
    return blocks;
  }

  // ---------- chrome ----------
  function parseRoute() {
    const hash = (location.hash || "#/").replace(/^#\/?/u, "");
    const [name, ...rest] = hash.split("/");
    if (!name) return { name: "overview" };
    if (name === "projet") return { name: "projet", key: decodeURIComponent(rest.join("/")) };
    return { name: ROUTES.includes(name) ? name : "overview" };
  }

  function renderNav(mc, route) {
    for (const link of document.querySelectorAll("[data-route]")) {
      const current = link.getAttribute("data-route") === route.name;
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    for (const node of document.querySelectorAll("[data-count]")) {
      const value = mc ? mc.counts[node.getAttribute("data-count")] : null;
      node.textContent = value === null || value === undefined ? "—" : String(value);
      node.classList.toggle("is-on", Boolean(value));
    }
    const list = document.querySelector("[data-nav-projects]");
    if (list && mc) {
      replace(list, mc.projects.length
        ? mc.projects.slice(0, 30).map((project) => {
            const open = mc.waiting.filter((item) => item.projectKey === project.key).length;
            const link = el("a", { href: projectHref(project.key) }, [stateDot(project.state), el("span", { class: "name", text: project.name }), el("span", { class: "count", text: String(open) })]);
            if (route.name === "projet" && route.key === project.key) link.setAttribute("aria-current", "page");
            return el("li", null, [link]);
          })
        : [el("li", { class: "nav-empty", text: `Aucun projet sous ${mc.projectsRoot}.` })]);
    }
  }

  function renderHealth(snapshot) {
    const nodes = new Map([...document.querySelectorAll("[data-health]")].map((node) => [node.getAttribute("data-health"), node]));
    const set = (key, value, alert) => {
      const node = nodes.get(key);
      if (!node) return;
      node.textContent = value;
      node.classList.toggle("is-alert", Boolean(alert));
    };
    if (!snapshot) return;
    const daemon = snapshot.daemon;
    set("daemon", `${daemon.version} · ${daemon.level}${daemon.database === "ok" ? "" : " · base en erreur"}`, daemon.database !== "ok");
    set("queue", `${daemon.queue.running} en cours · ${daemon.queue.pending} en attente${daemon.queue.failed ? ` · ${daemon.queue.failed} en échec` : ""}`, daemon.queue.failed > 0);
    set("telegram", daemon.telegram === "configured" ? "configuré" : "non configuré", false);
  }

  function renderBadges(mc) {
    const holder = document.querySelector("[data-mobile-badges]");
    if (!holder) return;
    replace(holder, mc ? [
      mc.counts.waiting ? el("a", { class: "chip tone--human", href: "#/attente", text: `${mc.counts.waiting} à toi` }) : null,
      mc.counts.blocked ? el("a", { class: "chip tone--block", href: "#/bloques", text: `${mc.counts.blocked} bloqués` }) : null,
    ] : []);
  }

  function render() {
    const page = document.querySelector("[data-page]");
    if (!page) return;
    const route = parseRoute();
    const snapshot = state.snapshot;
    const mc = snapshot && snapshot.missionControl;
    renderNav(mc, route);
    renderHealth(snapshot);
    renderBadges(mc);
    if (!mc) {
      replace(page, [state.lastError ? el("p", { class: "error-note", role: "status", text: state.lastError }) : null,
        el("p", { class: "state-note", text: state.live === "stopped" ? "La supervision est arrêtée." : "Lecture de l’état de la supervision…" })]);
      return;
    }
    const byKey = new Map(mc.projects.map((project) => [project.key, project]));
    const builders = {
      overview: () => overview(mc, byKey),
      attente: () => waitingPage(mc, byKey),
      bloques: () => blockedPage(mc),
      runs: () => runsPage(mc),
      missions: () => missionsPage(mc),
      portes: () => gatesPage(mc),
      audits: () => auditsPage(mc),
      activite: () => activityPage(mc),
      projets: () => portfolioPage(mc),
      projet: () => projectPage(mc, byKey, route.key),
    };
    replace(page, (builders[route.name] || builders.overview)());
    const summary = document.querySelector("[data-live-summary]");
    if (summary) summary.textContent = `${plural(mc.counts.waiting, "élément t’attend", "éléments t’attendent")}, ${plural(mc.counts.blocked, "mission bloquée", "missions bloquées")}, ${plural(mc.counts.runs, "run", "runs")} en cours.`;
  }

  // ---------- data ----------
  async function refresh() {
    try {
      const response = await fetch(SUMMARY_URL, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.snapshot = await response.json();
      state.failures = 0;
      state.lastError = null;
    } catch (error) {
      state.failures += 1;
      state.lastError = `État indisponible (${error && error.message ? error.message : "erreur"}), nouvel essai automatique · tentative ${state.failures}`;
    }
    render();
  }

  function startPolling() {
    if (state.poll) return;
    state.poll = setInterval(refresh, POLL_MS);
  }

  function connect() {
    if (typeof EventSource !== "function") { startPolling(); return; }
    const source = new EventSource(STREAM_URL);
    state.source = source;
    source.addEventListener("refresh", () => {
      state.live = "live";
      if (state.poll) { clearInterval(state.poll); state.poll = null; }
      void refresh();
    });
    source.addEventListener("closed", () => {
      state.live = "stopped";
      source.close();
      if (state.poll) { clearInterval(state.poll); state.poll = null; }
      render();
    });
    source.onerror = () => {
      if (state.live === "stopped") return;
      state.live = "waiting";
      startPolling();
      render();
    };
  }

  function setNav(open) {
    document.body.classList.toggle("nav-open", open);
    const scrim = document.querySelector(".scrim");
    if (scrim) scrim.hidden = !open;
    const opener = document.querySelector("[data-open-nav]");
    if (opener) opener.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function boot() {
    for (const holder of document.querySelectorAll("[data-icon]")) {
      replace(holder, [icon(holder.getAttribute("data-icon"))]);
    }
    const opener = document.querySelector("[data-open-nav]");
    if (opener) opener.addEventListener("click", () => setNav(true));
    for (const closer of document.querySelectorAll("[data-close-nav]")) closer.addEventListener("click", () => setNav(false));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") setNav(false); });
    window.addEventListener("hashchange", () => {
      setNav(false);
      render();
      const title = document.querySelector("[data-page] h1");
      if (title && title.focus) title.focus();
    });
    render();
    void refresh();
    connect();
  }

  window.KritonControl = { render, state, parseRoute, ago };
  if (!window.KRITON_CONTROL_NO_BOOT) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
