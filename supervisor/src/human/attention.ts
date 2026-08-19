import { redactText } from "../security/redact.js";
import type { HumanAttention, NormalizedEvent } from "../types.js";

function metadataText(event: NormalizedEvent, key: string, maxLength = 1_000): string | null {
  const value = event.metadata[key];
  return typeof value === "string" && value.trim() ? redactText(value.trim(), maxLength) : null;
}

function questionDetails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const details: string[] = [];
  for (const entry of value.slice(0, 4)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const question = typeof record.question === "string" ? redactText(record.question.trim(), 1_000) : "";
    if (!question) continue;
    const options = Array.isArray(record.options)
      ? record.options.slice(0, 8).flatMap((option) => {
          if (!option || typeof option !== "object" || Array.isArray(option)) return [];
          const label = (option as Record<string, unknown>).label;
          return typeof label === "string" && label.trim() ? [redactText(label.trim(), 200)] : [];
        })
      : [];
    details.push(options.length ? `${question}\nChoix : ${options.join(" · ")}` : question);
  }
  return details;
}

export function humanAttentionFromEvent(event: NormalizedEvent): HumanAttention | null {
  if (event.event_type === "permission.requested") {
    const toolName = metadataText(event, "tool_name", 200) ?? "opération";
    const description = metadataText(event, "description", 800);
    const command = metadataText(event, "command_summary", 600);
    const target = metadataText(event, "changed_file", 1_000) ?? metadataText(event, "url", 1_000);
    const details = [
      `Outil : ${toolName}`,
      description ? `Demande : ${description}` : null,
      command ? `Commande : ${command}` : null,
      target ? `Cible : ${target}` : null,
    ].filter((value): value is string => Boolean(value));
    return {
      type: "permission",
      title: "Autorisation requise",
      reason: description ?? `Claude demande l’autorisation d’utiliser ${toolName}.`,
      requestedAction: "Ouvre la session Claude pour autoriser ou refuser cette opération.",
      safeToContinue: false,
      details,
    };
  }

  if (event.event_type === "human.input.requested") {
    const toolName = metadataText(event, "tool_name", 200);
    const questions = questionDetails(event.metadata.questions);
    const planApproval = toolName === "ExitPlanMode";
    const planFile = metadataText(event, "plan_file", 1_000);
    const reason = questions[0]
      ?? (planApproval ? "Claude attend ta validation du plan proposé." : "Claude attend une décision pour poursuivre le travail.");
    return {
      type: "question",
      title: planApproval ? "Validation du plan requise" : "Décision humaine requise",
      reason,
      requestedAction: planApproval
        ? "Ouvre la session Claude pour accepter le plan ou demander une modification."
        : "Ouvre la session Claude et réponds à la question affichée.",
      safeToContinue: false,
      details: questions.length ? questions : [planFile ? `Plan : ${planFile}` : reason],
    };
  }

  if (event.event_type === "elicitation.requested") {
    const server = metadataText(event, "mcp_server_name", 200) ?? "MCP";
    const message = metadataText(event, "message", 1_500) ?? "Une intégration MCP attend une saisie humaine.";
    const mode = metadataText(event, "mode", 100);
    const url = metadataText(event, "url", 1_000);
    return {
      type: "elicitation",
      title: "Saisie MCP requise",
      reason: message,
      requestedAction: "Ouvre la session Claude et complète ou refuse la demande MCP.",
      safeToContinue: false,
      details: [
        `Intégration : ${server}`,
        mode ? `Mode : ${mode}` : null,
        url ? `URL : ${url}` : null,
        `Demande : ${message}`,
      ].filter((value): value is string => Boolean(value)),
    };
  }

  return null;
}
